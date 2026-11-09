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
version = json.loads((root / "package.json").read_text())["version"]
script = root / ("maintenance/install-execution-beta.sh" if "-" in version else "maintenance/install-release.sh")
label = "execution beta" if "-" in version else "release"
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
        "curl": '''#!/usr/bin/env python3
import json, os, pathlib, shutil, sys
args = sys.argv[1:]
destination = pathlib.Path(args[args.index('-o') + 1])
url = next(arg for arg in args if arg.startswith('https:'))
scenario = os.environ['CLIMATE_TEST_DOWNLOAD']
if url.startswith('https://github.com/') and scenario != 'normal':
    if scenario != 'fallback-checksum' or url.endswith('/SHA256SUMS'):
        destination.write_text('partial failed download')
        sys.exit(22)
if '/releases/tags/' in url:
    version = os.environ['CLIMATE_TEST_VERSION']
    tag = 'v' + version if scenario != 'wrong-release' else 'v0.0.0'
    assets = [{'id': 101, 'name': 'homebridge-nest-climate-cntrl-' + version + '.tgz', 'state': 'uploaded'},
              {'id': 102, 'name': 'SHA256SUMS', 'state': 'uploaded'}]
    if scenario == 'duplicate-asset': assets.append(assets[0])
    if scenario == 'missing-asset': assets = []
    destination.write_text(json.dumps({'tag_name': tag, 'draft': False, 'assets': assets}))
    sys.exit(0)
if '/releases/assets/' in url:
    assert 'Accept: application/octet-stream' in args
    if scenario == 'all-downloads-fail': sys.exit(22)
    if scenario == 'api-returns-json':
        destination.write_text('{"message":"metadata instead of archive"}')
        sys.exit(0)
    if scenario == 'malformed-checksum' and url.endswith('/102'):
        destination.write_text('not a checksum')
        sys.exit(0)
is_checksums = url.endswith('/SHA256SUMS') or url.endswith('/102')
shutil.copyfile(os.environ['CLIMATE_TEST_SUMS' if is_checksums else 'CLIMATE_TEST_ARCHIVE'], destination)
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
    for scenario, failure, bad_sum, download, expected_calls, success in [
        ("success", "", False, "normal", ["stop", "add", "start"], True),
        ("install fails but Homebridge is started", "add", False, "normal", ["stop", "add", "start"], False),
        ("start failure reported", "start", False, "normal", ["stop", "add", "start"], False),
        ("stop failure prevents install", "stop", False, "normal", ["stop"], False),
        ("checksum failure leaves Homebridge running", "", True, "normal", [], False),
        ("both assets use API fallback", "", False, "fallback-both", ["stop", "add", "start"], True),
        ("checksum uses API fallback", "", False, "fallback-checksum", ["stop", "add", "start"], True),
        ("both download paths fail", "", False, "all-downloads-fail", [], False),
        ("wrong release rejected", "", False, "wrong-release", [], False),
        ("duplicate asset rejected", "", False, "duplicate-asset", [], False),
        ("missing asset rejected", "", False, "missing-asset", [], False),
        ("API metadata instead of package rejected", "", False, "api-returns-json", [], False),
        ("malformed fallback checksum rejected", "", False, "malformed-checksum", [], False),
        ("fallback checksum mismatch rejected", "", True, "fallback-both", [], False),
    ]:
        home = base / scenario.replace(" ", "-")
        (home / "devProjects/homebridge-nest-climate-cntrl/.git").mkdir(parents=True)
        calls = home / "calls"
        env = dict(os.environ, HOME=str(home), PATH=f"{tools}:{os.environ['PATH']}",
                   CLIMATE_TEST_ARCHIVE=str(archive), CLIMATE_TEST_SUMS=str(wrong if bad_sum else checksums),
                   CLIMATE_TEST_CALLS=str(calls), CLIMATE_TEST_FAIL=failure,
                   CLIMATE_TEST_DOWNLOAD=download, CLIMATE_TEST_VERSION=version)
        result = subprocess.run(["bash", "-c", script.read_text() + "\nprintf 'SHELL STILL OPEN\\n'\n"],
                                env=env, text=True, capture_output=True, check=True)
        actual = calls.read_text().splitlines() if calls.exists() else []
        assert actual == expected_calls, (scenario, actual, result.stdout, result.stderr)
        assert f"=== Nest Climate {label} update START ===" in result.stdout
        assert f"=== Nest Climate {label} update END ===" in result.stdout
        assert "SHELL STILL OPEN" in result.stdout
        assert ("RESULT: SUCCESS" in result.stdout) == success, (scenario, result.stdout, result.stderr)
        print(f"PASS: {scenario}")
