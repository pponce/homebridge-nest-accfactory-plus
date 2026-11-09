"""Exercise the pasteable installer without network, sudo or a live Homebridge."""

import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile


root = Path(__file__).resolve().parents[2]
script = root / "maintenance/install-execution-beta.sh"
version = json.loads((root / "package.json").read_text())["version"]
subprocess.run(["bash", "-n", str(script)], check=True)

with tempfile.TemporaryDirectory(prefix="climate-install-test-") as temporary:
    base = Path(temporary)
    tools = base / "bin"
    tools.mkdir()
    archive = base / "fixture.tgz"
    data = json.dumps({"name": "homebridge-nest-climate-cntrl", "version": version}).encode()
    with tarfile.open(archive, "w:gz") as tar:
        member = tarfile.TarInfo("package/package.json")
        member.size = len(data)
        tar.addfile(member, io.BytesIO(data))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksums = base / "SHA256SUMS"
    checksums.write_text(f"{digest}  homebridge-nest-climate-cntrl-{version}.tgz\n")
    wrong = base / "WRONGSUMS"
    wrong.write_text(f"{'0' * 64}  homebridge-nest-climate-cntrl-{version}.tgz\n")
    mocks = {
        "curl": '''#!/bin/bash
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) destination="$2"; shift ;;
    https:*) url="$1" ;;
  esac
  shift
done
if [[ "$url" == */SHA256SUMS ]]; then
  cp "$CLIMATE_TEST_SUMS" "$destination"
else
  cp "$CLIMATE_TEST_ARCHIVE" "$destination"
fi
''',
        "sudo": '#!/bin/bash\n"$@"\n',
        "hb-service": '''#!/bin/bash
printf '%s\n' "$1" >> "$CLIMATE_TEST_CALLS"
if [ "$1" = "$CLIMATE_TEST_FAIL" ]; then
  false
else
  true
fi
''',
    }
    for name, text in mocks.items():
        command = tools / name
        command.write_text(text)
        command.chmod(0o755)
    for scenario, failure, bad_sum, expected_calls, success in [
        ("success", "", False, ["stop", "add", "start"], True),
        ("install fails but Homebridge is started", "add", False, ["stop", "add", "start"], False),
        ("start failure reported", "start", False, ["stop", "add", "start"], False),
        ("stop failure prevents install", "stop", False, ["stop"], False),
        ("checksum failure leaves Homebridge running", "", True, [], False),
    ]:
        home = base / scenario.replace(" ", "-")
        (home / "devProjects/homebridge-nest-climate-cntrl/.git").mkdir(parents=True)
        calls = home / "calls"
        env = dict(os.environ, HOME=str(home), PATH=f"{tools}:{os.environ['PATH']}",
                   CLIMATE_TEST_ARCHIVE=str(archive), CLIMATE_TEST_SUMS=str(wrong if bad_sum else checksums),
                   CLIMATE_TEST_CALLS=str(calls), CLIMATE_TEST_FAIL=failure)
        result = subprocess.run(["bash", "-c", script.read_text() + "\nprintf 'SHELL STILL OPEN\\n'\n"],
                                env=env, text=True, capture_output=True, check=True)
        actual = calls.read_text().splitlines() if calls.exists() else []
        assert actual == expected_calls, (scenario, actual, result.stdout, result.stderr)
        assert "=== Nest Climate execution beta update START ===" in result.stdout
        assert "=== Nest Climate execution beta update END ===" in result.stdout
        assert "SHELL STILL OPEN" in result.stdout
        assert ("RESULT: SUCCESS" in result.stdout) == success, (scenario, result.stdout, result.stderr)
        print(f"PASS: {scenario}")
