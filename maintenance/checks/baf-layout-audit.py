#!/usr/bin/env python3
"""Read-only Big Ass Fans cache/live-layout inventory. Standard library only."""
import argparse
import collections
import datetime
import json
import pathlib
import re
import urllib.error
import urllib.request

LIMIT = 16 * 1024 * 1024
TYPES = {'40': 'Fan (legacy)', 'B7': 'Fan', '43': 'Light', '49': 'Switch',
         '86': 'Occupancy', '8A': 'Temperature', '82': 'Humidity'}
META = {'3E', 'A2'}
ROLES = ('white', 'modes', 'night', 'down', 'up', 'both')
FLAGS = ('dualLightModeControl', 'bothlightsControl', 'noLights', 'downlightEquipped',
         'uplightEquipped', 'showStandbyLED', 'showFanOccupancySensor',
         'showLightOccupancySensor', 'showTemperature', 'showHumidity')


def read_json(file):
    with file.open('rb') as handle:
        data = handle.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('Oversized JSON')
    return json.loads(data)


def short_type(value):
    return str(value or '').split('-')[0].upper().lstrip('0') or '0'


def characteristic(service, kind):
    for item in service.get('characteristics', []):
        if short_type(item.get('UUID', item.get('type'))) == kind:
            return item.get('value')
    return None


def services(accessory):
    result = []
    for service in accessory.get('services', []):
        kind = short_type(service.get('UUID', service.get('type')))
        if kind in META:
            continue
        result.append({'type': TYPES.get(kind, 'Other service'),
                       'name': characteristic(service, 'E3') or characteristic(service, '23')
                       or service.get('displayName') or TYPES.get(kind, 'Other service'),
                       'subtype': service.get('subtype'), '_kind': kind})
    return result


def inventory(accessory, role):
    rows = services(accessory)
    return {'name': accessory.get('displayName') or info_value(accessory, '23') or 'Unnamed accessory',
            'role': role, 'service_count': len(rows),
            'services': [{key: value for key, value in row.items() if key != '_kind'} for row in rows]}


def info_value(accessory, kind):
    for service in accessory.get('services', []):
        if short_type(service.get('UUID', service.get('type'))) == '3E':
            return characteristic(service, kind)
    return None


def identity(value):
    return re.sub('[^a-z0-9]', '', str(value or '').lower())


def is_fan_plugin(accessory):
    return 'bigassfans' in identity(str(accessory.get('plugin', '')) + str(accessory.get('platform', '')))


def cache_inventory(entries):
    selected = [row for row in entries if isinstance(row, dict) and is_fan_plugin(row)]
    parents = {row.get('UUID'): row for row in selected if not row.get('context', {}).get('parentUUID')}
    output = []
    for parent_id, parent in parents.items():
        children = [row for row in selected if row.get('context', {}).get('parentUUID') == parent_id]
        family = [parent, *children]
        findings = []
        old_lights = [row['name'] for row in services(parent)
                      if row['_kind'] == '43' or str(row.get('subtype', '')).startswith('white-mode-')]
        if old_lights:
            findings.append('Light controls remain grouped under the fan: ' + ', '.join(old_lights)
                            + '. Review against the selected layout; this can be intentional on single-light fans.')
        else:
            findings.append('No grouped light or migrated light-mode controls found on the parent fan.')
        owners = collections.defaultdict(list)
        for accessory in family:
            for row in services(accessory):
                if row.get('subtype'):
                    owners[(row['_kind'], row['subtype'])].append(accessory.get('displayName', 'Unnamed'))
        for (_, subtype), names in owners.items():
            if len(names) > 1:
                findings.append('Duplicate service subtype ' + subtype + ' appears in: ' + ', '.join(names))
        output.append({'fan': parent.get('displayName', 'Unnamed fan'), 'findings': findings,
                       'accessories': [inventory(row, 'fan' if row is parent else row.get('context', {}).get('lightTile', 'child'))
                                       for row in family]})
    orphans = [inventory(row, 'child with no parent in this file') for row in selected
               if row.get('context', {}).get('parentUUID') and row['context']['parentUUID'] not in parents]
    return output, orphans


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def live_inventory(platform, main):
    bridge = platform.get('_bridge') or main
    if bridge.get('disable') is True:
        return {'status': 'Skipped: child bridge is disabled in configuration.'}
    port = bridge.get('port')
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        return {'status': 'Unavailable: bridge port is not recorded in config. Saved-cache results still apply.'}
    serials = {}
    for fan in platform.get('fans', []):
        if not isinstance(fan, dict) or not fan.get('mac'):
            continue
        serials[identity(fan['mac'])] = 'fan'
        for role in ROLES:
            serials[identity(fan['mac'] + ':' + role)] = role
    headers = {}
    pin = bridge.get('pin', main.get('pin'))
    if isinstance(pin, str) and re.fullmatch(r'\d{3}-\d{2}-\d{3}', pin):
        headers['Authorization'] = pin
    request = urllib.request.Request('http://127.0.0.1:' + str(port) + '/accessories', headers=headers, method='GET')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=5) as response:
            data = response.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError('Oversized response')
        payload = json.loads(data)
        rows = payload.get('accessories')
        if not isinstance(rows, list):
            raise ValueError('Unknown response')
        matches = [inventory(row, serials[identity(info_value(row, '30'))]) for row in rows
                   if isinstance(row, dict) and identity(info_value(row, '30')) in serials]
        return {'status': 'Read successfully' if matches else 'Bridge replied, but no configured fan identities matched.',
                'accessories': matches}
    except urllib.error.HTTPError as error:
        return {'status': 'Live read unavailable: HTTP ' + str(error.code) + '. No access settings were changed.'}
    except Exception as error:
        return {'status': 'Live read unavailable (' + type(error).__name__ + '). No access settings were changed.'}


def audit(storage, live=True):
    report = {'generated_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'read_only': True, 'configured_fans': [], 'caches': [], 'live_bridges': [], 'errors': [],
              'limits': ['Apple Home’s private cache is not accessible from Homebridge.',
                         'Backups and other saved cache files do not establish what is currently published.',
                         'Counts exclude accessory-information and protocol-information services.']}
    try:
        config = read_json(storage / 'config.json')
    except Exception as error:
        report['errors'].append('Could not read Homebridge config (' + type(error).__name__ + ').')
        return report
    platforms = [p for p in config.get('platforms', []) if isinstance(p, dict) and 'bigassfans' in identity(p.get('platform'))]
    active = {'cachedAccessories': 'Main bridge cache'}
    for index, platform in enumerate(platforms, 1):
        bridge = platform.get('_bridge') or {}
        if bridge.get('username'):
            active['cachedAccessories.' + bridge['username'].replace(':', '').upper()] = 'Configured fan bridge ' + str(index)
        for fan in platform.get('fans', []):
            if isinstance(fan, dict):
                report['configured_fans'].append({'name': fan.get('name', 'Unnamed fan'),
                                                  'layout_settings': {k: fan[k] for k in FLAGS if k in fan and
                                                                      (isinstance(fan[k], bool) or
                                                                       (k == 'dualLightModeControl' and fan[k] in
                                                                        ('exclusive', 'channels', 'both-up', 'both-only',
                                                                         'separate-dimmers', 'separate-dimmers-both')))}})
        if live:
            report['live_bridges'].append({'bridge': 'Fan platform ' + str(index), **live_inventory(platform, config.get('bridge', {}))})
    if not platforms:
        report['errors'].append('No Big Ass Fans platform found in this Homebridge config.')
    files = sorted((storage / 'accessories').glob('*cachedAccessories*'))
    if len(files) > 64:
        report['errors'].append('Cache scan limited to 64 files.')
    for index, file in enumerate(files[:64], 1):
        if not file.is_file() or not re.fullmatch(r'\.?cachedAccessories(?:\.[a-fA-F0-9]{12})?(?:\.bak)?', file.name):
            continue
        kind = 'Backup cache' if file.name.endswith('.bak') else active.get(file.name, 'Other saved cache')
        label = kind + ' #' + str(index)
        try:
            data = read_json(file)
            if not isinstance(data, list):
                raise ValueError('Unknown cache format')
            fans, orphans = cache_inventory(data)
            if fans or orphans or file.name in active:
                report['caches'].append({'source': label, 'kind': kind,
                    'modified_at_utc': datetime.datetime.fromtimestamp(file.stat().st_mtime, datetime.timezone.utc).isoformat(),
                    'fans': fans, 'orphaned_children': orphans})
        except Exception as error:
            report['errors'].append(label + ': unreadable (' + type(error).__name__ + ').')
    for expected, label in active.items():
        if not (storage / 'accessories' / expected).is_file():
            report['errors'].append(label + ': saved cache not found.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--storage', type=pathlib.Path, default=pathlib.Path('/var/lib/homebridge'))
    parser.add_argument('--no-live', action='store_true', help='Read saved caches without querying the local bridge.')
    args = parser.parse_args()
    print(json.dumps(audit(args.storage, not args.no_live), indent=2, ensure_ascii=False))
