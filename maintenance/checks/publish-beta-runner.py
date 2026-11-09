"""Exercise the publisher with fixture packages and mocked remote commands."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

PROJECT = Path(__file__).resolve().parents[2]
VERSION = json.loads((PROJECT / 'package.json').read_text())['version']
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, shutil, subprocess, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
root = pathlib.Path(os.environ['PUBLISH_FIXTURE'])
scenario = os.environ['PUBLISH_SCENARIO']
with (root / 'calls.jsonl').open('a') as log: log.write(json.dumps([name, *args]) + '\n')
if name == 'git':
    if scenario == 'artifacts' and args[2] in ['check-ignore', 'status']:
        sys.exit(subprocess.run([os.environ['REAL_GIT'], *args]).returncode)
    args = args[2:]
    if args[:3] == ['remote', 'get-url', 'origin']: print('https://github.com/pponce/homebridge-nest-climate-cntrl.git')
    elif args[:2] == ['branch', '--show-current']: print('main')
    elif args[:2] == ['status', '--porcelain'] and scenario == 'dirty': print(' M package.json')
    elif args[:2] == ['rev-parse', 'HEAD']: print('fixture-head')
    elif args[:2] == ['rev-parse', 'origin/main']: print('fixture-head')
    elif args[:2] == ['merge', '--ff-only'] and scenario == 'diverged': sys.exit(1)
    sys.exit(0)
if name == 'curl':
    destination = pathlib.Path(args[args.index('-o') + 1])
    shutil.copyfile(root / destination.name, destination)
    sys.exit(0)
if name == 'sleep': sys.exit(0)
if name == 'npm':
    args = args[2:]
    if args[0] == 'whoami': sys.exit(0)
    if args[0] == 'publish':
        if scenario == 'publish-failure': sys.exit(1)
        (root / 'published').write_text('yes')
        sys.exit(0)
    if args[0] == 'view' and args[2] == 'version':
        print(os.environ['PUBLISH_VERSION'])
        sys.exit(0)
    if args[0] == 'view':
        counter = root / 'views'
        count = int(counter.read_text()) + 1 if counter.exists() else 1
        counter.write_text(str(count))
        if scenario == 'registry-failure':
            print('npm error code ECONNRESET', file=sys.stderr)
            sys.exit(1)
        if scenario == 'mismatch':
            print(json.dumps('sha512-unexpected'))
            sys.exit(0)
        if scenario == 'existing' or ((root / 'published').exists() and scenario != 'pending' and count >= 3):
            print(json.dumps((root / 'integrity').read_text()))
            sys.exit(0)
        print('npm error code E404', file=sys.stderr)
        sys.exit(1)
raise RuntimeError('Unexpected mocked command')
'''


def run_case(scenario):
    with tempfile.TemporaryDirectory(prefix='publish-fixture-') as temp:
        root = Path(temp)
        home = root / 'home'
        checkout = home / 'devProjects/homebridge-nest-climate-cntrl'
        (checkout / '.git/info').mkdir(parents=True)
        pkg = {'name': 'homebridge-nest-climate-cntrl', 'version': VERSION}
        (checkout / 'package.json').write_text(json.dumps(pkg))
        artifact = checkout / 'maintenance/artifacts/local-result.txt'
        if scenario == 'artifacts':
            subprocess.run(['git', '-C', str(checkout), 'init', '-b', 'main'], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(checkout), 'add', 'package.json'], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(checkout), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                            'commit', '-m', 'Fixture'], check=True, capture_output=True)
            artifact.parent.mkdir(parents=True)
            artifact.write_text('retain this local artifact')
        filename = f'homebridge-nest-climate-cntrl-{VERSION}.tgz'
        archive = root / filename
        with tarfile.open(archive, 'w:gz') as tar:
            content = json.dumps(pkg).encode()
            info = tarfile.TarInfo('package/package.json')
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        if scenario == 'checksum': checksum = '0' * 64
        (root / 'SHA256SUMS').write_text(checksum + '  ' + filename + '\n')
        (root / 'integrity').write_text('sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode())
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        for command in ['git', 'curl', 'npm', 'sleep']:
            script = bin_dir / command
            script.write_text(MOCK)
            script.chmod(0o755)
        env = dict(os.environ, HOME=str(home), PATH=str(bin_dir) + ':' + os.environ['PATH'],
                   SSH_CONNECTION='198.51.100.10 12345 192.0.2.20 22', PUBLISH_FIXTURE=str(root), PUBLISH_SCENARIO=scenario, PUBLISH_VERSION=VERSION, REAL_GIT=shutil.which('git'))
        release = checkout / f'maintenance/releases/v{VERSION}'
        if scenario == 'pending':
            release.mkdir(parents=True)
            (release / 'npm-upload-accepted').write_text('fixture accepted upload')
        result = subprocess.run(['bash', str(PROJECT / 'maintenance/update-checkout-and-publish-beta.sh')],
                                env=env, text=True, capture_output=True, timeout=45)
        calls = [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]
        publishes = [call for call in calls if call[0] == 'npm' and call[3] == 'publish']
        expected = 'SUCCESS' if scenario in ['success', 'existing', 'artifacts'] else 'PENDING' if scenario == 'pending' else 'FAILED'
        assert 'END: ' + expected in result.stdout, (scenario, result.stdout, result.stderr)
        assert len(publishes) == (1 if scenario in ['success', 'publish-failure', 'artifacts'] else 0), (scenario, publishes)
        if scenario in ['dirty', 'diverged']:
            assert not any(call[0] in ['curl', 'npm'] for call in calls), (scenario, calls)
        if scenario == 'checksum': assert not any(call[0] == 'npm' for call in calls)
        reports = list(release.glob('publish-result-*.json'))
        if scenario not in ['dirty', 'diverged']:
            assert reports and json.loads(reports[0].read_text())['homebridgeChanged'] is False
            assert json.loads(reports[0].read_text())['version'] == VERSION
            assert f'rsync -P {subprocess.check_output(["id", "-un"], text=True).strip()}@192.0.2.20:' in result.stdout
        if scenario == 'success':
            assert (release / 'npm-upload-accepted').exists()
            assert '--tag' in publishes[0] and publishes[0][publishes[0].index('--tag') + 1] == 'beta'
        if scenario == 'artifacts':
            assert artifact.read_text() == 'retain this local artifact'
            assert '/maintenance/artifacts/' in (checkout / '.git/info/exclude').read_text()
            assert any(call[0] == 'git' and '--no-overwrite-ignore' in call for call in calls)
        print(scenario + ': passed')


for case in ['success', 'existing', 'pending', 'dirty', 'diverged', 'checksum', 'mismatch', 'registry-failure', 'publish-failure', 'artifacts']:
    run_case(case)

# Real Git must reject an upstream file that would overwrite an ignored local artifact.
with tempfile.TemporaryDirectory(prefix='publish-ignore-fixture-') as temp:
    repo = Path(temp)
    def git(*args, check=True):
        return subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Fixture',
                               '-c', 'user.email=fixture@example.invalid', *args],
                              check=check, capture_output=True, text=True)
    git('init', '-b', 'main')
    (repo / 'README').write_text('fixture')
    git('add', 'README')
    git('commit', '-m', 'Base')
    git('checkout', '-b', 'incoming')
    target = repo / 'maintenance/artifacts/local-result.txt'
    target.parent.mkdir(parents=True)
    target.write_text('upstream content')
    git('add', 'maintenance/artifacts/local-result.txt')
    git('commit', '-m', 'Incoming artifact')
    git('checkout', 'main')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('retained local content')
    (repo / '.git/info/exclude').write_text('/maintenance/artifacts/\n')
    result = git('merge', '--ff-only', '--no-overwrite-ignore', 'incoming', check=False)
    assert result.returncode != 0 and target.read_text() == 'retained local content'
    print('ignored artifact collision: passed')

