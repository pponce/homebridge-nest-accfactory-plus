import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectInstallation } from '../scripts/migration-preflight.mjs';

test('migration inspection reports child ownership and pairing counts without exposing or editing private data', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-inspect-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'accessories'));
  await fs.mkdir(path.join(root, 'persist'));
  const files = {
    'config.json': {
      platforms: [
        {
          platform: 'NestAccfactory',
          name: 'PRIVATE-NAME',
          _bridge: { username: 'AA:BB:CC:DD:EE:FF', pin: '111-22-333' },
          accounts: [{ type: 'google', refreshToken: 'PRIVATE-TOKEN' }],
        },
      ],
    },
    'persist/AccessoryInfo.AABBCCDDEEFF.json': { pairedClients: { 'PRIVATE-CLIENT': { publicKey: 'PRIVATE-KEY' } } },
    'persist/IdentifierCache.AABBCCDDEEFF.json': { cache: { 'PRIVATE-ACCESSORY': 2 } },
    'accessories/cachedAccessories.AABBCCDDEEFF': [
      {
        plugin: 'homebridge-nest-accfactory-plus',
        platform: 'NestAccfactory',
        UUID: 'PRIVATE-UUID',
        displayName: 'PRIVATE-ROOM',
        context: { token: 'PRIVATE-CONTEXT' },
        services: [{ UUID: '0000004A-0000-1000-8000-0026BB765291' }],
      },
    ],
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(root, name), JSON.stringify(content));
  }
  const report = await inspectInstallation(root, { packageRoots: [] });
  assert.equal(report.platforms[0].bridge, 'child');
  assert.equal(report.platforms[0].pairedClientCount, 1);
  assert.equal(report.platforms[0].identifierCache, 'read');
  assert.equal(report.platforms[0].cache.nestAccessories, 1);
  assert.equal(report.platforms[0].cache.types.thermostat, 1);
  assert.deepEqual(report.platforms[0].credentialMethods, ['google-refresh-token']);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-|AA:BB|111-22-333/);
  for (const [name, content] of Object.entries(files)) {
    assert.equal(await fs.readFile(path.join(root, name), 'utf8'), JSON.stringify(content));
  }
});

test('migration inspection identifies retained and removed capabilities without exporting characteristic values', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-inventory-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'accessories'));
  const uuid = (id) => id.padStart(8, '0') + '-0000-1000-8000-0026BB765291';
  const service = (id) => ({ UUID: uuid(id) });
  const model = (value) => ({ ...service('3E'), characteristics: [{ UUID: uuid('20'), value }] });
  const accessory = (services, index) => ({
    UUID: 'PRIVATE-UUID-' + index,
    plugin: 'homebridge-nest-accfactory-plus',
    platform: 'NestAccfactory',
    displayName: 'PRIVATE-NAME',
    context: { refreshToken: 'PRIVATE-TOKEN' },
    services,
  });
  const entries = [
    [model('PRIVATE-MODEL'), service('87'), service('7F'), service('96'), service('85')],
    [model('PRIVATE-MODEL'), service('87'), service('7F'), service('96'), service('85')],
    [model('Weather'), service('8A'), service('82')],
    [model('Home/Away'), service('86')],
    [model('Temperature Sensor (2nd gen)'), service('8A')],
    [service('4A'), service('82'), service('B7'), service('49')],
    [service('110'), service('121')],
    [{ UUID: '00000087-PRIVATE-CUSTOM' }],
    [service('86')],
  ].map(accessory);
  await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({ platforms: [{ platform: 'NestAccfactory' }] }));
  const cacheFile = path.join(root, 'accessories/cachedAccessories');
  await fs.writeFile(cacheFile, JSON.stringify(entries));
  const report = await inspectInstallation(root, { packageRoots: [] });
  assert.equal(report.schemaVersion, 2);
  assert.deepEqual(report.platforms[0].cache.types, {
    'smoke-or-carbon-monoxide-sensor': 2,
    weather: 1,
    'home-away': 1,
    'temperature-sensor': 1,
    thermostat: 1,
    'camera-doorbell-or-lock': 1,
    other: 1,
    'occupancy-sensor': 1,
  });
  const groups = report.platforms[0].cache.serviceGroups;
  assert.equal(groups.find((group) => group.kind === 'smoke-or-carbon-monoxide-sensor').count, 2);
  assert.deepEqual(groups.find((group) => group.kind === 'other').services, ['custom-or-unknown']);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-/);
  assert.equal(await fs.readFile(cacheFile, 'utf8'), JSON.stringify(entries));
});

test('migration inspection reports installed Homebridge versions and distinguishes missing identifier records', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packages = path.join(root, 'node_modules');
  for (const [name, version] of [
    ['homebridge', '2.4.0'],
    ['homebridge-config-ui-x', '5.0.0'],
    ['homebridge-nest-accfactory-plus', '0.4.4'],
  ]) {
    await fs.mkdir(path.join(packages, name), { recursive: true });
    await fs.writeFile(path.join(packages, name, 'package.json'), JSON.stringify({ name, version }));
  }
  await fs.writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      platforms: [{ platform: 'NestAccfactory', _bridge: { username: 'AA:BB:CC:DD:EE:FF' } }],
    }),
  );
  const report = await inspectInstallation(root, { packageRoots: [packages] });
  assert.equal(report.platforms[0].identifierCache, 'missing');
  assert.deepEqual(report.installedPackages, [
    { name: 'homebridge-nest-accfactory-plus', version: '0.4.4' },
    { name: 'homebridge', version: '2.4.0' },
    { name: 'homebridge-config-ui-x', version: '5.0.0' },
  ]);
});

test('migration inspection distinguishes missing or malformed caches and refuses invalid configuration', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-inspect-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      bridge: {},
      platforms: [
        { platform: 'NestAccfactory', nest: { access_token: 'secret' } },
        { platform: 'NestClimateCntrl', _bridge: { username: '../../unsafe' } },
        { platform: 'OtherPlugin', password: 'secret' },
      ],
    }),
  );
  const report = await inspectInstallation(root, { packageRoots: [] });
  assert.equal(report.platforms.length, 2);
  assert.equal(report.platforms[0].cache.status, 'missing');
  assert.deepEqual(report.platforms[0].credentialMethods, ['nest-access-token']);
  assert.equal(report.platforms[1].cache.status, 'unknown-child-identity');
  await fs.mkdir(path.join(root, 'accessories'));
  await fs.writeFile(path.join(root, 'accessories/cachedAccessories'), '{}');
  assert.equal((await inspectInstallation(root, { packageRoots: [] })).platforms[0].cache.status, 'invalid-format');
  await fs.writeFile(path.join(root, 'config.json'), '{ PRIVATE-TOKEN');
  await assert.rejects(inspectInstallation(root), /unavailable or invalid/);
});
