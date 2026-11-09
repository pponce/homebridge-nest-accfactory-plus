import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import hap from './helpers/homebridge-hap.js';
import { importSource } from './helpers/import-source.js';
import { processConfig } from '../src/config.js';
import { ClimateDashboard } from '../src/climate-dashboard.js';
import { WebDashboard, normalizeWebDashboard } from '../src/web-dashboard.js';
import { ClimateAutomation } from '../src/climate-automation.js';

const { default: Platform } = await importSource(new URL('../src/system.js', import.meta.url));
const { default: Connections } = await importSource(new URL('../src/connections.js', import.meta.url));
const account = { name: 'Fixture', type: 'nest', access_token: 'synthetic-test-token' };

async function fixture(t, overrides = {}) {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-startup-'));
  const configPath = path.join(storage, 'config.json');
  const config = { platform: 'NestClimateCntrl', accounts: [{ ...account }], ...overrides };
  await fs.writeFile(configPath, JSON.stringify({ platforms: [config] }));
  const callbacks = new Map();
  const logs = [];
  const starts = [];
  t.mock.method(Connections.prototype, 'start', (uuid) => starts.push(uuid));
  const api = {
    hap,
    on: (event, handler) => callbacks.set(event, handler),
    user: { storagePath: () => storage, configPath: () => configPath },
  };
  const log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push([level, ...args])]));
  const platform = new Platform(log, config, api);
  t.after(async () => {
    await callbacks.get('shutdown')?.();
    await fs.rm(storage, { recursive: true, force: true });
  });
  return { platform, callbacks, logs, starts, storage, config, api };
}

for (const config of [undefined, null, false, 'invalid', []]) {
  test('missing or malformed configuration stays inactive: ' + JSON.stringify(config), () => {
    const warnings = [];
    const log = { warn: (message) => warnings.push(message), debug() {} };
    const api = { on: () => assert.fail('Inactive platforms must not register lifecycle work') };
    assert.equal(processConfig(config, log, api, { video: false }), undefined);
    const platform = new Platform(log, config, api);
    assert.equal(platform.config, undefined);
    assert.doesNotThrow(() => platform.configureAccessory(null));
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((message) => message.includes('not configured')));
  });
}

test('configuration processing exceptions are logged without escaping or revealing their contents', () => {
  const errors = [];
  const config = { get webDashboard() { throw new Error('SENSITIVE-FIXTURE'); } };
  const api = { on: () => assert.fail('Invalid configuration must stay inactive') };
  assert.doesNotThrow(() => new Platform({ error: (message) => errors.push(message), debug() {} }, config, api));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /configuration could not be loaded/);
  assert.ok(!errors[0].includes('SENSITIVE-FIXTURE'));
});

for (const accounts of [undefined, [], [null], [{ name: 'Incomplete', type: 'google' }], [{ ...account, exclude: true }]]) {
  test('no usable account starts no services even with web access requested: ' + JSON.stringify(accounts), async (t) => {
    const f = await fixture(t, { accounts, webDashboard: { enabled: true } });
    await assert.doesNotReject(f.callbacks.get('didFinishLaunching')());
    assert.equal(f.platform.dashboard, undefined);
    assert.equal(f.platform.webDashboard, undefined);
    assert.equal(f.platform.automation, undefined);
    assert.deepEqual(f.starts, []);
    assert.deepEqual(await fs.readdir(f.storage), ['config.json']);
    assert.ok(f.logs.some((entry) => entry[0] === 'error' && entry[1].includes('No active connections')));
    await assert.doesNotReject(f.callbacks.get('shutdown')());
    assert.deepEqual(await fs.readdir(f.storage), ['config.json']);
  });
}

test('configured startup is idempotent and standalone web access remains off by default', async (t) => {
  const f = await fixture(t);
  const starting = f.callbacks.get('didFinishLaunching')();
  assert.equal(f.callbacks.get('didFinishLaunching')(), starting);
  await starting;
  assert.equal(f.starts.length, 1);
  assert.equal(f.platform.dashboard.server.listening, true);
  assert.equal(f.platform.webDashboard.status().enabled, false);
  assert.equal(f.platform.webDashboard.status().available, false);
  assert.equal(f.platform.webDashboard.server, undefined);
  assert.equal(f.platform.automation.snapshot().available, true);
  await f.platform.webDashboard.setupAccount({ username: 'fixture', password: 'synthetic-password' });
  assert.equal(f.platform.webDashboard.status().available, false, 'Creating credentials must not enable web access');
  const schema = JSON.parse(await fs.readFile(new URL('../config.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.schema.properties.webDashboard.properties.enabled.default, false);
  for (const value of [undefined, null, {}, true, { enabled: 'true' }, { enabled: 1 }]) {
    assert.equal(normalizeWebDashboard(value).enabled, false);
  }
  assert.equal(normalizeWebDashboard({ enabled: true }).enabled, true);
});

test('connection preparation failures are caught at the Homebridge event boundary', async (t) => {
  const f = await fixture(t);
  t.mock.method(Connections, 'fromConfig', () => { throw new Error('SENSITIVE-FIXTURE'); });
  await assert.doesNotReject(f.callbacks.get('didFinishLaunching')());
  assert.deepEqual(f.starts, []);
  assert.equal(f.platform.dashboard, undefined);
  assert.ok(f.logs.some((entry) => entry[0] === 'error' && entry[1].includes('could not start')));
  assert.ok(!JSON.stringify(f.logs).includes('SENSITIVE-FIXTURE'));
});

for (const [name, Type] of [['configuration dashboard', ClimateDashboard], ['web dashboard', WebDashboard], ['automation', ClimateAutomation]]) {
  test(name + ' startup failure closes partial services and keeps native connections available', async (t) => {
    const f = await fixture(t);
    const original = Type.prototype.start;
    let service;
    t.mock.method(Type.prototype, 'start', async function (...args) {
      service = this;
      await original.apply(this, args);
      throw new Error('SENSITIVE-FIXTURE');
    });
    await assert.doesNotReject(f.callbacks.get('didFinishLaunching')());
    assert.equal(f.starts.length, 1);
    assert.equal(service.server?.listening ?? false, false);
    assert.equal(f.platform.dashboard, undefined);
    assert.equal(f.platform.webDashboard, undefined);
    assert.equal(f.platform.automation, undefined);
    assert.ok(f.logs.some((entry) => entry[0] === 'warn' && entry[1].includes('could not start')));
    assert.ok(!JSON.stringify(f.logs).includes('SENSITIVE-FIXTURE'));
  });
}

test('shutdown completes remaining cleanup after each component reports a failure', async (t) => {
  const f = await fixture(t);
  await f.callbacks.get('didFinishLaunching')();
  const dashboard = f.platform.dashboard;
  const stops = [];
  for (const [name, Type, method] of [
    ['automation', ClimateAutomation, 'stop'], ['web', WebDashboard, 'stop'],
    ['dashboard', ClimateDashboard, 'stop'], ['connections', Connections, 'shutdown'],
  ]) {
    const original = Type.prototype[method];
    t.mock.method(Type.prototype, method, async function (...args) {
      stops.push(name);
      await original.apply(this, args);
      throw new Error('SENSITIVE-FIXTURE');
    });
  }
  const stopping = f.callbacks.get('shutdown')();
  assert.equal(f.callbacks.get('shutdown')(), stopping);
  await assert.doesNotReject(stopping);
  assert.deepEqual(stops, ['automation', 'web', 'dashboard', 'connections']);
  assert.equal(dashboard.server.listening, false);
  assert.equal(f.platform.automation, undefined);
  assert.equal(f.logs.filter((entry) => entry[0] === 'warn').length, 4);
  assert.ok(!JSON.stringify(f.logs).includes('SENSITIVE-FIXTURE'));
});

test('shutdown during startup waits for the pending listener and prevents further services or connections', async (t) => {
  const f = await fixture(t);
  const entered = Promise.withResolvers();
  const proceed = Promise.withResolvers();
  const original = ClimateDashboard.prototype.start;
  let dashboard;
  t.mock.method(ClimateDashboard.prototype, 'start', async function () {
    dashboard = this;
    await original.call(this);
    entered.resolve();
    await proceed.promise;
  });
  const starting = f.callbacks.get('didFinishLaunching')();
  await entered.promise;
  const stopping = f.callbacks.get('shutdown')();
  proceed.resolve();
  await assert.doesNotReject(Promise.all([starting, stopping]));
  assert.equal(dashboard.server.listening, false);
  assert.deepEqual(f.starts, []);
  assert.equal(f.platform.webDashboard, undefined);
  await f.callbacks.get('didFinishLaunching')();
  assert.equal(f.platform.dashboard, undefined);
});

test('cached accessory restoration errors are logged and do not escape into Homebridge', async (t) => {
  const f = await fixture(t);
  const accessory = { get services() { throw new Error('SENSITIVE-FIXTURE'); } };
  assert.doesNotThrow(() => f.platform.configureAccessory(accessory));
  assert.ok(f.logs.some((entry) => entry[0] === 'warn' && entry[1].includes('cached Nest accessory')));
  assert.ok(!JSON.stringify(f.logs).includes('SENSITIVE-FIXTURE'));
});
