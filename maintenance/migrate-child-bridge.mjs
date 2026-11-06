// Offline migration for a dedicated legacy child bridge. Backups contain secrets and stay local.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLD = 'homebridge-nest-accfactory-plus';
const NEXT = 'homebridge-nest-climate-cntrl';
const VERSION = '0.5.0-beta.1';
const hash = (data) => createHash('sha256').update(data).digest('hex');
const encode = (value) => Buffer.from(JSON.stringify(value, null, 4) + '\n');
const fail = (message) => { throw new Error(message); };
const type = (value) => typeof value === 'string' && /^[\da-f]{8}-0000-1000-8000-0026bb765291$/i.test(value)
  ? value.slice(0, 8).replace(/^0+/, '').toUpperCase() : '';

function readRecord(storage, relative, optional = false) {
  const file = path.join(storage, relative);
  if (fs.realpathSync(path.dirname(file)) !== path.dirname(file)) fail('Refusing a redirected storage directory.');
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (optional && error.code === 'ENOENT') return { relative, bytes: null };
    fail('A required installation file is missing or unreadable.');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('Expected an ordinary installation file.');
  return { relative, bytes: fs.readFileSync(file), mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
}

export function prepareMigration(storage, expectedCount) {
  storage = fs.realpathSync(storage);
  const configRecord = readRecord(storage, 'config.json');
  const config = JSON.parse(configRecord.bytes);
  if (!Array.isArray(config.platforms)) fail('Invalid platform configuration.');
  const candidates = config.platforms.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
    ['NestAccfactory', OLD + '.NestAccfactory'].includes(entry?.platform));
  if (candidates.length !== 1 || config.platforms.some((entry) => entry?.platform?.split('.').at(-1) === 'NestClimateCntrl')) {
    fail('Expected exactly one legacy Nest platform and no configured Climate platform.');
  }
  const { entry, index } = candidates[0];
  const username = entry._bridge?.username;
  if (!/^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(username ?? '') || entry._bridge?.disable === true) {
    fail('Expected an enabled, dedicated Nest child bridge.');
  }
  if (config.bridge?.username?.toUpperCase() === username.toUpperCase() || config.platforms.some((other, i) =>
    i !== index && other?._bridge?.username?.toUpperCase() === username.toUpperCase())) fail('The child bridge identity is shared.');
  if (config.disabledPlugins?.includes(NEXT)) fail('The Climate plugin is disabled in Homebridge.');
  if (config.plugins !== undefined && (!Array.isArray(config.plugins) || config.plugins.some((name) => typeof name !== 'string'))) {
    fail('Invalid plugin allowlist.');
  }
  const suffix = username.replaceAll(':', '').toUpperCase();
  const cachePath = 'accessories/cachedAccessories.' + suffix;
  const cacheRecord = readRecord(storage, cachePath);
  const entries = JSON.parse(cacheRecord.bytes);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || !Array.isArray(entries) || entries.length !== expectedCount) {
    fail('Accessory count differs from the reviewed inventory.');
  }
  const identities = new Set();
  const counts = { thermostat: 0, smokeOrCO: 0, occupancy: 0, temperature: 0 };
  for (const accessory of entries) {
    if (accessory?.plugin !== OLD || accessory?.platform !== 'NestAccfactory') fail('The cache has unexpected ownership.');
    if (typeof accessory.UUID !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(accessory.UUID) || identities.has(accessory.UUID.toUpperCase())) {
      fail('Missing, invalid or duplicate accessory identity.');
    }
    identities.add(accessory.UUID.toUpperCase());
    if (!Array.isArray(accessory.services)) fail('Invalid accessory services.');
    const ids = accessory.services.map((service) => type(service?.UUID ?? service?.type));
    const info = accessory.services.find((service) => type(service?.UUID ?? service?.type) === '3E');
    const model = (Array.isArray(info?.characteristics) ? info.characteristics : []).find((item) => type(item?.UUID ?? item?.type) === '20')?.value;
    if (!info || ids.some((id) => ['110', '121', '45'].includes(id)) || model === 'Weather') fail('The cache contains unsupported or incomplete accessories.');
    const kind = ids.includes('4A') ? 'thermostat' : ids.some((id) => ['87', '7F'].includes(id)) ? 'smokeOrCO'
      : ids.includes('86') ? 'occupancy' : ids.includes('8A') ? 'temperature' : undefined;
    if (!kind) fail('An accessory needs manual classification before migration.');
    counts[kind]++;
  }
  const pairing = readRecord(storage, 'persist/AccessoryInfo.' + suffix + '.json');
  const identifiers = readRecord(storage, 'persist/IdentifierCache.' + suffix + '.json');
  const pairedClients = JSON.parse(pairing.bytes)?.pairedClients;
  const identifierData = JSON.parse(identifiers.bytes)?.cache;
  if (!pairedClients || typeof pairedClients !== 'object' || Array.isArray(pairedClients) || !Object.keys(pairedClients).length
    || !identifierData || typeof identifierData !== 'object' || Array.isArray(identifierData)) {
    fail('Pairing or accessory identifier records are incomplete.');
  }
  const aids = new Set();
  for (const accessory of entries) {
    const aid = identifierData[accessory.UUID];
    if (!Number.isSafeInteger(aid) || aid < 2 || aids.has(aid)) fail('Accessory AID records are missing or inconsistent.');
    aids.add(aid);
    const iids = new Set([1]);
    for (const service of accessory.services) {
      const serviceUUID = service.UUID ?? service.type;
      const key = accessory.UUID + '|' + serviceUUID + (service.subtype ? '|' + service.subtype : '');
      const keys = type(serviceUUID) === '3E' ? [] : [key];
      if (!Array.isArray(service.characteristics)) fail('Cached characteristic records are incomplete.');
      for (const characteristic of service.characteristics) {
        const characteristicUUID = characteristic?.UUID ?? characteristic?.type;
        if (typeof characteristicUUID !== 'string' || !characteristicUUID) fail('Cached characteristic identities are missing.');
        keys.push(key + '|' + characteristicUUID);
      }
      for (const lookup of keys) {
        const iid = identifierData[lookup];
        if (!Number.isSafeInteger(iid) || iid < 2 || iids.has(iid)) fail('Service or characteristic IID records are missing or inconsistent.');
        iids.add(iid);
      }
    }
    const nextIID = identifierData[accessory.UUID + '|nextIID'];
    if (!Number.isSafeInteger(nextIID) || nextIID <= Math.max(...iids)) fail('Identifier allocation counters are missing or inconsistent.');
  }
  if (!Number.isSafeInteger(identifierData['|nextAID']) || identifierData['|nextAID'] <= Math.max(...aids)) {
    fail('Identifier allocation counters are missing or inconsistent.');
  }
  const nextConfig = structuredClone(config);
  nextConfig.platforms[index].platform = 'NestClimateCntrl';
  if (Array.isArray(nextConfig.plugins) && !nextConfig.plugins.includes(NEXT)) nextConfig.plugins.push(NEXT);
  const nextCache = entries.map((accessory) => ({ ...accessory, plugin: NEXT, platform: 'NestClimateCntrl' }));
  const fallback = readRecord(storage, 'accessories/.cachedAccessories.' + suffix + '.bak', true);
  const files = [configRecord, cacheRecord, fallback, pairing, identifiers];
  const after = [encode(nextConfig), encode(nextCache), encode(nextCache), null, null];
  return { storage, files, after, summary: { accessories: entries.length, counts, configurationIndex: index,
    platform: { from: 'NestAccfactory', to: 'NestClimateCntrl' }, package: { from: OLD, to: NEXT, version: VERSION },
    preserved: ['bridge identity', 'pairing records', 'accessory identifiers', 'accessory UUIDs', 'services', 'credentials'],
    fallbackCache: 'seeded from the current accessory cache' } };
}

function sameCurrent(storage, record) {
  const current = readRecord(storage, record.relative, record.bytes === null);
  return current.bytes === null ? record.bytes === null : record.bytes !== null && current.bytes.equals(record.bytes);
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function writeSnapshotFile(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function createSnapshot(plan, project) {
  project = fs.realpathSync(project);
  if (!fs.existsSync(path.join(project, '.git'))) fail('Expected the existing project checkout.');
  for (const record of plan.files) if (!sameCurrent(plan.storage, record)) fail('Installation changed after inspection; run inspection again.');
  let parent = project;
  for (const name of ['maintenance', 'migration', 'backups']) {
    const next = path.join(parent, name);
    try {
      const stat = fs.lstatSync(next);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Refusing a redirected backup directory.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(next, { mode: 0o700 });
      syncDirectory(parent);
    }
    parent = next;
  }
  const backup = path.join(parent, new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID());
  fs.mkdirSync(backup, { mode: 0o700 });
  const records = plan.files.map((record, index) => {
    const before = record.bytes === null ? null : index + '-before';
    const after = plan.after[index] === null ? null : index + '-after';
    if (before) writeSnapshotFile(path.join(backup, before), record.bytes);
    if (after) writeSnapshotFile(path.join(backup, after), plan.after[index]);
    return { relative: record.relative, mode: record.mode ?? plan.files[1].mode, uid: record.uid ?? plan.files[1].uid,
      gid: record.gid ?? plan.files[1].gid, before, after, beforeHash: before ? hash(record.bytes) : null,
      afterHash: after ? hash(plan.after[index]) : null };
  });
  writeSnapshotFile(path.join(backup, 'manifest.json'), encode({ schema: 1, storage: plan.storage, records, summary: plan.summary }));
  syncDirectory(backup);
  syncDirectory(parent);
  return backup;
}

function loadSnapshot(backup) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json')));
  if (manifest.schema !== 1 || !Array.isArray(manifest.records) || manifest.records.length !== 5) fail('Invalid migration snapshot.');
  const allowed = /^(?:config\.json|accessories\/\.?cachedAccessories\.[A-F\d]{12}(?:\.bak)?|persist\/(?:AccessoryInfo|IdentifierCache)\.[A-F\d]{12}\.json)$/;
  const paths = new Set();
  for (const [index, record] of manifest.records.entries()) {
    if (!allowed.test(record.relative) || paths.has(record.relative) || (record.after && record.relative.startsWith('persist/'))) fail('Invalid snapshot file selection.');
    paths.add(record.relative);
    for (const side of ['before', 'after']) {
      if (record[side] !== null && record[side] !== index + '-' + side) fail('Invalid snapshot artifact.');
      record[side + 'Bytes'] = record[side] ? fs.readFileSync(path.join(backup, record[side])) : null;
      if (record[side] && hash(record[side + 'Bytes']) !== record[side + 'Hash']) fail('Snapshot integrity check failed.');
    }
  }
  const suffix = /^accessories\/cachedAccessories\.([A-F\d]{12})$/.exec(manifest.records[1].relative)?.[1];
  const expected = ['config.json', 'accessories/cachedAccessories.' + suffix, 'accessories/.cachedAccessories.' + suffix + '.bak',
    'persist/AccessoryInfo.' + suffix + '.json', 'persist/IdentifierCache.' + suffix + '.json'];
  if (!suffix || manifest.records.some((record, index) => record.relative !== expected[index])) fail('Snapshot file order is invalid.');
  return manifest;
}

function atomicWrite(storage, record, bytes) {
  const target = path.join(storage, record.relative);
  if (fs.realpathSync(path.dirname(target)) !== path.dirname(target)) fail('Refusing a redirected storage directory.');
  if (bytes === null) { fs.rmSync(target, { force: true }); syncDirectory(path.dirname(target)); return; }
  const temporary = target + '.climate-' + randomUUID();
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fchownSync(fd, record.uid, record.gid);
    fs.fchmodSync(fd, record.mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, target);
    syncDirectory(path.dirname(target));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}

export function applySnapshot(backup, { write = atomicWrite } = {}) {
  const manifest = loadSnapshot(backup);
  for (const record of manifest.records) if (!sameCurrent(manifest.storage, { ...record, bytes: record.beforeBytes })) fail('Installation changed after backup; migration refused.');
  const changed = [];
  try {
    // Cache ownership must be in place before the configuration can activate the new platform.
    for (const record of [...manifest.records.slice(1, 3), manifest.records[0]]) {
      changed.push(record);
      write(manifest.storage, record, record.afterBytes);
    }
    for (const record of manifest.records) {
      if (!sameCurrent(manifest.storage, { ...record, bytes: record.afterBytes ?? record.beforeBytes })) fail('Post-migration verification failed.');
    }
  } catch {
    try {
      for (const record of changed.reverse()) atomicWrite(manifest.storage, record, record.beforeBytes);
    } catch {
      const error = new Error('Migration and rollback failed. Leave Homebridge stopped and retain the snapshot.');
      error.exitCode = 2;
      throw error;
    }
    fail('Migration failed; changed files were restored.');
  }
  return { status: 'migrated', ...manifest.summary };
}

export function rollbackSnapshot(backup, { write = atomicWrite } = {}) {
  const manifest = loadSnapshot(backup);
  const config = manifest.records[0];
  if (!sameCurrent(manifest.storage, { ...config, bytes: config.afterBytes }) && !sameCurrent(manifest.storage, { ...config, bytes: config.beforeBytes })) {
    fail('Configuration changed since migration; refusing to overwrite later edits.');
  }
  const starting = manifest.records.slice(0, 3).map((record) => readRecord(manifest.storage, record.relative, true));
  try {
    for (const record of [...manifest.records.slice(1, 3), manifest.records[0]]) write(manifest.storage, record, record.beforeBytes);
    for (const record of manifest.records.slice(0, 3)) {
      if (!sameCurrent(manifest.storage, { ...record, bytes: record.beforeBytes })) fail('Rollback verification failed.');
    }
  } catch {
    let recovered = true;
    try {
      for (const record of [...starting.slice(1), starting[0]]) atomicWrite(manifest.storage, record, record.bytes);
    } catch { recovered = false; }
    const error = new Error(recovered ? 'Rollback failed; its starting files were restored. Leave Homebridge stopped.'
      : 'Rollback recovery failed. Leave Homebridge stopped and retain the snapshot.');
    error.exitCode = 2;
    throw error;
  }
  return { status: 'rolled-back', pairingAndIdentifiers: 'left in place' };
}

function requireStopped() {
  if (process.getuid?.() !== 0) fail('Run mutation commands with sudo after stopping Homebridge.');
  const state = execFileSync('systemctl', ['show', 'homebridge.service', '--property=ActiveState', '--value'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (state !== 'inactive') fail('Homebridge must be stopped before mutation commands.');
}

function requireInstalled(storage) {
  for (const root of [path.join(storage, 'node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules', '/opt/homebridge/lib/node_modules']) {
    const file = path.join(root, NEXT, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file));
      if (pkg.name === NEXT && pkg.version === VERSION) return;
    }
  }
  fail('The exact beta package is not installed. Configuration was not changed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let result;
    if (command === 'plan' && args.length === 2) result = prepareMigration(args[0], Number(args[1])).summary;
    else if (command === 'snapshot' && args.length === 3) {
      requireStopped();
      result = { snapshot: createSnapshot(prepareMigration(args[0], Number(args[2])), args[1]) };
    } else if (command === 'apply' && args.length === 1) {
      requireStopped();
      const manifest = loadSnapshot(args[0]);
      requireInstalled(manifest.storage);
      result = applySnapshot(args[0]);
    } else if (command === 'rollback' && args.length === 1) {
      requireStopped();
      result = rollbackSnapshot(args[0]);
    } else fail('Usage: plan STORAGE COUNT | snapshot STORAGE PROJECT COUNT | apply SNAPSHOT | rollback SNAPSHOT');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    // Never print input contents or filesystem/parser errors that could expose credentials.
    process.stderr.write('Migration stopped. ' + (error.code || error instanceof SyntaxError ? 'A required file or service check failed.' : error.message) + '\n');
    process.exitCode = error.exitCode ?? 1;
  }
}
