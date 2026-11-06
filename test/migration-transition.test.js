import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareMigration, createSnapshot, applySnapshot, rollbackSnapshot } from '../maintenance/migrate-child-bridge.mjs';

const old = 'homebridge-nest-accfactory-plus';
const next = 'homebridge-nest-climate-cntrl';
const cache = 'accessories/cachedAccessories.AABBCCDDEEFF';
const fallback = 'accessories/.cachedAccessories.AABBCCDDEEFF.bak';
const uuid = (id) => id.padStart(8, '0') + '-0000-1000-8000-0026BB765291';

function fixture(t, withFallback = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'climate-transition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const storage = path.join(root, 'storage');
  const project = path.join(root, 'project');
  for (const folder of [storage, path.join(storage, 'accessories'), path.join(storage, 'persist'), path.join(project, '.git')]) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const config = {
    bridge: { username: '11:22:33:44:55:66' },
    plugins: ['unrelated-plugin', old],
    platforms: [
      { platform: 'Unrelated', token: 'PRIVATE-OTHER' },
      {
        platform: 'NestAccfactory', name: 'PRIVATE-NAME',
        _bridge: { username: 'AA:BB:CC:DD:EE:FF', port: 40000, pin: '111-22-333' },
        accounts: [{ type: 'google', refreshToken: 'PRIVATE-TOKEN' }],
      },
    ],
  };
  const entries = ['4A', '4A', '87', '87', '87', '87', '86'].map((id) => ({
    UUID: randomUUID(), plugin: old, platform: 'NestAccfactory', context: { value: 'PRIVATE-CONTEXT' },
    displayName: 'PRIVATE-ROOM', services: [
      { UUID: uuid('3E'), characteristics: [{ UUID: uuid('20'), value: 'PRIVATE-MODEL' }] },
      { UUID: uuid(id), subtype: '1', characteristics: [{ value: 21 }] },
    ],
  }));
  const files = {
    'config.json': config, [cache]: entries,
    'persist/AccessoryInfo.AABBCCDDEEFF.json': { pairedClients: { 'PRIVATE-CLIENT': { publicKey: 'PRIVATE-KEY' } } },
    'persist/IdentifierCache.AABBCCDDEEFF.json': { cache: { 'PRIVATE-UUID|AID': 2 } },
  };
  if (withFallback) {
    files[fallback] = entries;
  }
  for (const [name, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(storage, name), JSON.stringify(data), { mode: 0o600 });
  }
  return { root, storage, project, files, config, entries };
}

function unchanged(state) {
  for (const [name, data] of Object.entries(state.files)) {
    assert.equal(fs.readFileSync(path.join(state.storage, name), 'utf8'), JSON.stringify(data));
  }
}

test('migration plan changes only platform ownership and an explicit plugin allowlist', (t) => {
  const state = fixture(t);
  const plan = prepareMigration(state.storage, 7);
  assert.deepEqual(plan.summary.counts, { thermostat: 2, smokeOrCO: 4, occupancy: 1, temperature: 0 });
  assert.doesNotMatch(JSON.stringify(plan.summary), /PRIVATE-|AA:BB|111-22-333/);
  const config = JSON.parse(plan.after[0]);
  const entries = JSON.parse(plan.after[1]);
  assert.equal(config.platforms[1].platform, 'NestClimateCntrl');
  config.platforms[1].platform = 'NestAccfactory';
  assert.equal(config.plugins.pop(), next);
  assert.deepEqual(config, state.config);
  for (const entry of entries) {
    assert.equal(entry.plugin, next);
    assert.equal(entry.platform, 'NestClimateCntrl');
    entry.plugin = old;
    entry.platform = 'NestAccfactory';
  }
  assert.deepEqual(entries, state.entries);
  unchanged(state);
  assert.equal(fs.existsSync(path.join(state.project, 'maintenance')), false);
});

test('offline migration and rollback preserve original files, permissions, pairing and identifiers', (t) => {
  for (const withFallback of [true, false]) {
    const state = fixture(t, withFallback);
    const plan = prepareMigration(state.storage, 7);
    const snapshot = createSnapshot(plan, state.project);
    assert.equal(fs.statSync(snapshot).mode & 0o777, 0o700);
    for (const file of fs.readdirSync(snapshot)) {
      assert.equal(fs.statSync(path.join(snapshot, file)).mode & 0o777, 0o600);
    }
    unchanged(state);
    assert.equal(applySnapshot(snapshot).status, 'migrated');
    const migrated = JSON.parse(fs.readFileSync(path.join(state.storage, cache)));
    assert.deepEqual(migrated.map((entry) => entry.UUID), state.entries.map((entry) => entry.UUID));
    for (const name of Object.keys(state.files).filter((name) => name.startsWith('persist/'))) {
      assert.equal(fs.readFileSync(path.join(state.storage, name), 'utf8'), JSON.stringify(state.files[name]));
    }
    assert.equal(fs.statSync(path.join(state.storage, 'config.json')).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(state.storage, fallback))), migrated);
    assert.throws(() => applySnapshot(snapshot), /changed after backup/);
    assert.equal(rollbackSnapshot(snapshot).status, 'rolled-back');
    unchanged(state);
    if (!withFallback) {
      assert.equal(fs.existsSync(path.join(state.storage, fallback)), false);
    }
  }
});

test('a write failure restores the original ownership before Homebridge can restart', (t) => {
  const state = fixture(t, false);
  const snapshot = createSnapshot(prepareMigration(state.storage, 7), state.project);
  let writes = 0;
  assert.throws(() => applySnapshot(snapshot, {
    write(storage, record, bytes) {
      if (++writes === 2) {
        throw new Error('injected failure');
      }
      fs.writeFileSync(path.join(storage, record.relative), bytes);
    },
  }), /changed files were restored/);
  unchanged(state);
  assert.equal(fs.existsSync(path.join(state.storage, fallback)), false);
  assert.equal(fs.readdirSync(path.join(state.storage, 'accessories')).length, 1);
});

test('migration rejects stale snapshots, corrupt backup artifacts and later configuration edits', (t) => {
  const state = fixture(t);
  const plan = prepareMigration(state.storage, 7);
  const snapshot = createSnapshot(plan, state.project);
  const configPath = path.join(state.storage, 'config.json');
  fs.appendFileSync(configPath, ' ');
  assert.throws(() => applySnapshot(snapshot), /changed after backup/);
  assert.throws(() => createSnapshot(plan, state.project), /changed after inspection/);
  fs.writeFileSync(configPath, JSON.stringify(state.config));
  applySnapshot(snapshot);
  fs.appendFileSync(configPath, ' ');
  assert.throws(() => rollbackSnapshot(snapshot), /later edits/);
  fs.appendFileSync(path.join(snapshot, '1-before'), ' ');
  assert.throws(() => applySnapshot(snapshot), /integrity check failed/);
});

test('migration refuses unsupported accessories, mixed ownership and changed inventory', (t) => {
  const state = fixture(t);
  assert.throws(() => prepareMigration(state.storage, 6), /count differs/);
  for (const change of [
    (entries) => {
      entries[0].plugin = 'another-plugin';
    },
    (entries) => {
      entries[0].UUID = entries[1].UUID;
    },
    (entries) => {
      entries[0].services.push({ UUID: uuid('110') });
    },
    (entries) => {
      entries[0].services[0].characteristics[0].value = 'Weather';
    },
    (entries) => {
      entries[0].services = [{ UUID: uuid('49') }];
    },
  ]) {
    const entries = structuredClone(state.entries);
    change(entries);
    fs.writeFileSync(path.join(state.storage, cache), JSON.stringify(entries));
    assert.throws(() => prepareMigration(state.storage, 7));
  }
  assert.equal(fs.existsSync(path.join(state.project, 'maintenance')), false);
});
