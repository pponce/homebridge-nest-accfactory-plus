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
  assert.equal(report.platforms[0].cache.nestAccessories, 1);
  assert.equal(report.platforms[0].cache.types.thermostat, 1);
  assert.deepEqual(report.platforms[0].credentialMethods, ['google-refresh-token']);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-|AA:BB|111-22-333/);
  for (const [name, content] of Object.entries(files)) {
    assert.equal(await fs.readFile(path.join(root, name), 'utf8'), JSON.stringify(content));
  }
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
