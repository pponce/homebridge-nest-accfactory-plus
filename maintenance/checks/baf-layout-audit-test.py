#!/usr/bin/env python3
"""Synthetic cache and local-HTTP fixtures; never opens real Homebridge storage."""
import copy
import importlib.util
import io
import json
import pathlib
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('layout_audit', pathlib.Path(__file__).with_name('baf-layout-audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def service(kind, name, subtype=None):
    return {'UUID': '000000' + kind + '-0000-1000-8000-0026BB765291', 'subtype': subtype,
            'characteristics': [{'UUID': '23', 'value': name}]}


def accessory(name, uuid, rows, context=None):
    return {'plugin': 'homebridge-bigassfans-2', 'platform': 'BigAssFans-i6', 'UUID': uuid,
            'displayName': name, 'context': context or {}, 'services': rows}


parent = accessory('Test Fan', 'parent-private-id', [service('B7', 'Fan', 'fan'),
    service('86', 'Fan occupancy', 'fan-occupancy'), service('86', 'Light occupancy', 'light-occupancy'),
    service('8A', 'Temperature', 'temperature')])
child = accessory('Test Fan Light', 'child-private-id', [service('43', 'Light', 'white-light')],
                  {'parentUUID': 'parent-private-id', 'lightTile': 'white'})
stale = copy.deepcopy(parent)
stale['services'].append(service('43', 'Old grouped light', 'white-light'))
orphan = copy.deepcopy(child)
orphan['context']['parentUUID'] = 'missing-private-id'
bridge_id = 'AA:BB:CC:11:22:33'
mac = 'AA:BB:CC:44:55:66'
config = {'bridge': {'pin': '123-45-678', 'username': 'private-main'}, 'password': 'SECRET-PASSWORD',
          'platforms': [{'platform': 'BigAssFans-i6', '_bridge': {'username': bridge_id, 'port': 55555},
                         'fans': [{'name': 'Test Fan', 'mac': mac, 'ip': '192.0.2.55', 'noLights': False,
                                   'showTemperature': True, 'dualLightModeControl': 'SECRET-PASSWORD'}]}]}

fixture_root = pathlib.Path(__file__).resolve().parents[1] / '.integration'
fixture_root.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='baf-fixture-', dir=fixture_root) as temporary:
    root = pathlib.Path(temporary)
    (root / 'accessories').mkdir()
    (root / 'config.json').write_text(json.dumps(config))
    (root / 'accessories/cachedAccessories').write_text('[]')
    (root / 'accessories/cachedAccessories.AABBCC112233').write_text(json.dumps([parent, child]))
    (root / 'accessories/.cachedAccessories.AABBCC112233.bak').write_text(json.dumps([stale, child]))
    (root / 'accessories/cachedAccessories.DEADBEEF1234').write_text(json.dumps([orphan]))
    (root / 'accessories/cachedAccessories.000000000001').write_text('invalid JSON')
    before = {file: file.read_bytes() for file in root.rglob('*') if file.is_file()}
    result = audit.audit(root, live=False)
    active = next(row for row in result['caches'] if row['kind'] == 'Configured fan bridge 1')
    backup = next(row for row in result['caches'] if row['kind'] == 'Backup cache')
    assert active['fans'][0]['accessories'][0]['service_count'] == 4
    assert active['fans'][0]['findings'] == ['No grouped light or migrated light-mode controls found on the parent fan.']
    assert any('Duplicate service subtype' in row for row in backup['fans'][0]['findings'])
    assert any(row['orphaned_children'] for row in result['caches'])
    assert len(result['errors']) == 1 and 'JSONDecodeError' in result['errors'][0]
    text = json.dumps(result)
    for secret in ['SECRET-PASSWORD', '123-45-678', mac, bridge_id, 'AABBCC112233', '192.0.2.55', 'private-id']:
        assert secret not in text, secret
    assert before == {file: file.read_bytes() for file in root.rglob('*') if file.is_file()}

    live_parent = {'services': [service('3E', 'Test Fan'), *parent['services']]}
    live_parent['services'][0]['characteristics'].append({'type': '30', 'value': mac})
    payload = json.dumps({'accessories': [live_parent]}).encode()

    class Opener:
        def open(self, request, timeout):
            assert request.full_url == 'http://127.0.0.1:55555/accessories'
            assert request.get_method() == 'GET' and timeout == 5
            assert request.get_header('Authorization') == '123-45-678'
            return io.BytesIO(payload)

    def opener(*handlers):
        assert isinstance(handlers[0], audit.urllib.request.ProxyHandler) and handlers[0].proxies == {}
        assert isinstance(handlers[1], audit.NoRedirect)
        assert handlers[1].redirect_request(None) is None
        return Opener()

    with patch.object(audit.urllib.request, 'build_opener', side_effect=opener):
        live = audit.live_inventory(config['platforms'][0], config['bridge'])
    assert live['status'] == 'Read successfully'
    assert live['accessories'][0]['service_count'] == 4
    assert mac not in json.dumps(live)
    with patch.object(audit.urllib.request, 'build_opener', side_effect=opener):
        original = audit.LIMIT
        audit.LIMIT = 10
        bounded = audit.live_inventory(config['platforms'][0], config['bridge'])
        audit.LIMIT = original
    assert 'ValueError' in bounded['status']
    assert before == {file: file.read_bytes() for file in root.rglob('*') if file.is_file()}
print('PASS: active/backup separation, migrated services, duplicate/orphan detection, malformed cache, secret omission, bounded loopback-only GET and read-only storage.')
