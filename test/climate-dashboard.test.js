import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebDashboard } from '../src/web-dashboard.js';
import { ClimateDashboard, RuntimeLedger } from '../src/climate-dashboard.js';
import { nextSetpoint, editableConfig, displayTemperature, celsiusTemperature } from '../homebridge-ui/public/climate-utils.js';

test('dashboard units convert absolute temperatures separately from gaps and preserve bounds', () => {
  assert.equal(displayTemperature(21, 'F'), 69.8);
  assert.equal(celsiusTemperature(77, 'F'), 25);
  assert.equal(displayTemperature(1.5, 'F', true), 2.7);
  assert.equal(celsiusTemperature(1.8, 'F', true), 1);
  assert.equal(celsiusTemperature(0.18, 'F', true), 0.1);
  assert.equal(celsiusTemperature(48.2, 'F'), 9);
  assert.equal(celsiusTemperature(89.6, 'F'), 32);
  assert.equal(celsiusTemperature(5.4, 'F', true), 3);
  for (const unit of ['C', 'F']) {
    for (const value of [-40, 0, 9, 21.1111111111, 32, 35]) {
      assert.ok(Math.abs(celsiusTemperature(displayTemperature(value, unit), unit) - value) < 1e-9);
    }
    for (const value of [null, undefined, NaN, Infinity, '21']) {
      assert.ok(Number.isNaN(displayTemperature(value, unit)));
      assert.ok(Number.isNaN(celsiusTemperature(value, unit)));
    }
  }
});

const start = Date.parse('2026-11-06T23:59:30Z');
test('runtime prunes old days and periodic sampling persists observed time', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = await fixture(t);
  f.dashboard.ledger.days['T/2020-01-01'] = { date: '2020-01-01', heating: 10, cooling: 0, observed: 10 };
  const previous = f.dashboard.ledger.previous.get('T');
  previous.time -= 30000;
  t.mock.timers.tick(30000);
  await f.dashboard.saving;
  assert.equal(f.dashboard.ledger.days['T/2020-01-01'], undefined);
  const saved = JSON.parse(await fs.readFile(path.join(f.storage, 'nest-climate/runtime.json')));
  assert.ok(Object.values(saved).some((day) => day.observed >= 30));
});
test('dashboard isolates non-climate resources and clears native sensor selection', async (t) => {
  const f = await fixture(t);
  f.dashboard.update('C', 'Camera', { online: true }, 'A');
  assert.equal(f.dashboard.devices.has('C'), false);
  f.dashboard.update('S', 'TemperatureSensor', { current_temperature: 20 }, 'A');
  assert.equal(f.dashboard.ledger.previous.has('S'), false);
  f.dashboard.update('H', 'HomeAway', { occupancy: true, refreshToken: 'NEVER EXPORT' }, 'A');
  assert.deepEqual(f.dashboard.snapshot().devices.find((d) => d.serial === 'H').data, { occupancy: true });
  f.dashboard.update('T', 'Thermostat', { active_rcs_sensor: 'S' }, 'A');
  assert.equal(f.dashboard.snapshot().devices.find((d) => d.serial === 'T').data.active_rcs_sensor, 'S');
  f.dashboard.update('T', 'Thermostat', { active_rcs_sensor: undefined }, 'A');
  assert.equal(f.dashboard.snapshot().devices.find((d) => d.serial === 'T').data.active_rcs_sensor, undefined);
  f.dashboard.update('T', 'Thermostat', { active_rcs_sensor: '' }, 'A');
  assert.equal(f.dashboard.snapshot().devices.find((d) => d.serial === 'T').data.active_rcs_sensor, '');
});
test('native sensor writes recheck capability, connectivity and unchanged settings when queued', async () => {
  const accounts = [{ id: 'A', authorised: true, observing: true }];
  const commands = [];
  const dashboard = new ClimateDashboard('/tmp/unused-sensor-control', {
    accounts: () => accounts,
    command: async (...args) => commands.push(args),
  });
  const native = { supported: true, signature: 'observed' };
  dashboard.update('T', 'Thermostat', { nest_google_device_uuid: 'T', online: true, native_sensor_control: native }, 'A');
  const request = { action: 'hold', expected: 'observed' };
  await assert.rejects(dashboard.setNativeSensorControl('missing', request), { code: 'CLIMATE_CONFLICT' });
  await assert.rejects(dashboard.setNativeSensorControl('T', { ...request, expected: 'stale' }), { code: 'CLIMATE_CONFLICT' });
  await assert.rejects(dashboard.setNativeSensorControl('T', request, () => false), { code: 'CLIMATE_CONFLICT' });
  accounts[0].observing = false;
  await assert.rejects(dashboard.setNativeSensorControl('T', request), { code: 'CLIMATE_CONFLICT' });
  accounts[0].observing = true;
  await dashboard.setNativeSensorControl('T', request);
  assert.equal(commands.length, 1);
  assert.equal(commands[0][2].guard(), true);
  dashboard.update('T', 'Thermostat', { native_sensor_control: { ...native, signature: 'changed' } }, 'A');
  assert.equal(commands[0][2].guard(), false);
});

test('configuration editor preserves legacy credentials, overrides and unknown fields', () => {
  const original = {
    google: { issuetoken: 'fixture-url', cookie: 'fixture-cookie' },
    devices: { T: { fanDuration: '1h', custom: true } },
    custom: { retain: true },
  };
  const config = editableConfig(original);
  assert.equal(config.accounts[0].issueToken, 'fixture-url');
  assert.equal(config.google, undefined, 'removing a migrated account must not resurrect legacy credentials');
  assert.deepEqual(config.devices, [{ serialNumber: 'T', fanDuration: '1h', custom: true }]);
  assert.deepEqual(config.custom, original.custom);
  assert.equal(original.accounts, undefined);
  assert.throws(() => editableConfig({ devices: { T: false } }));
  assert.throws(() => editableConfig({ accounts: [null] }));
  assert.throws(() => editableConfig({ homes: 'invalid' }));
});
test('dashboard closes its listener if endpoint persistence fails', async (t) => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-start-'));
  t.after(() => fs.rm(storage, { recursive: true, force: true }));
  const dashboard = new ClimateDashboard(storage, { accounts: () => [], command: async () => {} });
  dashboard.write = async () => {
    throw new Error('Fixture disk failure');
  };
  await assert.rejects(dashboard.start(), /Fixture disk failure/);
  assert.equal(dashboard.server.listening, false);
  assert.equal(dashboard.timer, undefined);
});
test('runtime splits UTC midnight and counts previous HVAC state', () => {
  const ledger = new RuntimeLedger();
  ledger.sample('T', 'heating', true, start);
  ledger.sample('T', 'cooling', true, start + 60000);
  ledger.sample('T', 'off', true, start + 90000);
  assert.equal(ledger.days['T/2026-11-06'].heating, 30);
  assert.equal(ledger.days['T/2026-11-07'].heating, 30);
  assert.equal(ledger.days['T/2026-11-07'].cooling, 30);
  assert.equal(ledger.days['T/2026-11-07'].observed, 60);
});
test('runtime never fills downtime, offline intervals, or backward time', () => {
  const ledger = new RuntimeLedger();
  ledger.sample('T', 'heating', true, start);
  ledger.sample('T', 'heating', true, start + 100000);
  ledger.sample('T', 'heating', false, start + 110000);
  ledger.sample('T', 'heating', true, start + 120000);
  ledger.sample('T', 'heating', true, start + 119000);
  assert.deepEqual(ledger.days, {});
  const restored = new RuntimeLedger(ledger.days);
  restored.sample('T', 'heating', true, start + 140000);
  assert.deepEqual(restored.days, {});
  assert.equal(restored.summary('T', start).length, 7);
});
test('next schedule uses specified timezone and wraps week, ignores invalid entries', () => {
  const entries = [
    { day: 0, time: 8 * 3600 },
    { day: 6, time: 20 * 3600 },
    { day: 9, time: 0 },
  ];
  assert.equal(nextSetpoint(entries, 'America/Los_Angeles', new Date('2026-11-09T03:00Z')).day, 6);
  assert.equal(nextSetpoint(entries, 'America/Los_Angeles', new Date('2026-11-09T05:00Z')).day, 0);
  assert.equal(nextSetpoint(entries, 'invalid'), null);
  assert.equal(nextSetpoint(entries, ''), null);
});
async function fixture(t) {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-climate-test-'));
  const requests = [];
  const accounts = [{ id: 'A', name: 'Home', authorised: true, observing: true }];
  const dashboard = new ClimateDashboard(storage, { accounts: () => accounts, command: async (...args) => requests.push(args), log: {} });
  await dashboard.start();
  t.after(async () => {
    await dashboard.stop();
    await fs.rm(storage, { recursive: true, force: true });
  });
  dashboard.update(
    'T',
    'Thermostat',
    {
      nest_google_device_uuid: 'DEVICE_T',
      description: 'Living room',
      online: true,
      hvac_state: 'heating',
      eco_mode: false,
      has_fan: true,
      linked_rcs_sensors: ['SENSOR'],
      cookie: 'NEVER EXPORT',
      refreshToken: 'NEVER EXPORT',
    },
    'A',
  );
  const endpoint = JSON.parse(await fs.readFile(path.join(storage, 'nest-climate/endpoint.json')));
  return {
    dashboard,
    requests,
    accounts,
    storage,
    endpoint,
    url: 'http://127.0.0.1:' + endpoint.port,
    headers: { Authorization: 'Bearer ' + endpoint.token },
  };
}
test('local dashboard rejects unauthenticated/browser-origin requests and redacts runtime fields', async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url + '/status')).status, 403);
  assert.equal((await fetch(f.url + '/status', { headers: { ...f.headers, Origin: 'https://example.com' } })).status, 403);
  const response = await fetch(f.url + '/status', { headers: f.headers });
  const text = await response.text();
  assert.ok(!text.includes('NEVER EXPORT'));
  assert.ok(!text.includes(f.endpoint.token));
  assert.equal(JSON.parse(text).devices[0].data.eco_mode, false);
  assert.equal((await fs.stat(path.join(f.storage, 'nest-climate/endpoint.json'))).mode & 0o777, 0o600);
  assert.equal((await fetch(f.url + '/no', { headers: f.headers })).status, 404);
  assert.equal((await fetch(f.url + '/command', { method: 'POST', headers: f.headers, body: 'bad json' })).status, 400);
  assert.equal((await fetch(f.url + '/command', { method: 'POST', headers: f.headers, body: 'a'.repeat(5000) })).status, 413);
});
test('web account provisioning requires the local dashboard token and never exposes the password in status', async (t) => {
  const f = await fixture(t);
  const requests = [];
  f.dashboard.webDashboard = {
    status: () => ({ enabled: false, available: false, accountConfigured: true, username: 'admin' }),
    setupAccount: async (payload) => {
      requests.push(payload);
      return { accountConfigured: true };
    },
  };
  const payload = { username: 'admin', password: 'PRIVATE-WEB-PASSWORD' };
  const denied = await fetch(f.url + '/web/account', { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(denied.status, 403);
  const origin = await fetch(f.url + '/web/account', {
    method: 'POST',
    headers: { ...f.headers, Origin: 'https://example.com' },
    body: JSON.stringify(payload),
  });
  assert.equal(origin.status, 403);
  assert.equal(requests.length, 0);
  const saved = await fetch(f.url + '/web/account', { method: 'POST', headers: f.headers, body: JSON.stringify(payload) });
  assert.equal(saved.status, 200);
  assert.deepEqual(requests, [payload]);
  const status = await fetch(f.url + '/web/status', { headers: f.headers });
  const statusText = await status.text();
  assert.doesNotMatch(statusText, /PRIVATE-WEB-PASSWORD/);
  assert.equal(JSON.parse(statusText).accountConfigured, true);
  f.dashboard.webDashboard = undefined;
  assert.deepEqual(await (await fetch(f.url + '/web/status', { headers: f.headers })).json(), {
    enabled: false,
    available: false,
    accountConfigured: false,
  });
  assert.equal((await fetch(f.url + '/web/account', { method: 'POST', headers: f.headers, body: '{}' })).status, 503);
});
test('commands validate association, capability and connectivity; failures remain failures', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'sensor', value: 'FOREIGN' }));
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'fan', value: 999 }));
  for (const [action, value] of [
    ['eco', true],
    ['sensor', 'SENSOR'],
    ['sensor', ''],
    ['fan', 30],
  ]) {
    assert.equal((await f.dashboard.control({ serial: 'T', action, value })).accepted, true);
  }
  assert.deepEqual(f.requests[1], ['DEVICE_T', { temperature_sensor: 'SENSOR' }]);
  assert.equal(f.requests[3][1].fan_duration, 1800);
  const accepted = await fetch(f.url + '/command', {
    method: 'POST',
    headers: f.headers,
    body: JSON.stringify({ serial: 'T', action: 'eco', value: true }),
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).accepted, true);
  assert.deepEqual(f.requests.at(-1), ['DEVICE_T', { eco_mode: true }]);
  assert.equal(f.dashboard.snapshot().devices[0].data.eco_mode, false, 'wait for cloud confirmation');
  f.accounts[0].observing = false;
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'eco', value: true }));
  f.accounts[0].observing = true;
  f.dashboard.command = async () => {
    throw new Error('secret token');
  };
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'eco', value: true }), (e) => !e.message.includes('secret'));
  assert.equal(f.dashboard.lastCommand.accepted, false);
  f.dashboard.invalidate('A');
  f.dashboard.update('T', 'Thermostat', { current_temperature: 21 }, 'A');
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'eco', value: true }));
  f.dashboard.update('T', 'Thermostat', { hvac_state: 'off' }, 'A');
  assert.equal(f.dashboard.devices.get('T').needsUpdate, false);
  f.dashboard.remove('T');
  assert.equal(f.dashboard.snapshot().devices.length, 0);
});
test('dashboard serializes commands and does not report acceptance early', async (t) => {
  const f = await fixture(t);
  const pending = Promise.withResolvers();
  f.dashboard.command = () => pending.promise;
  const first = f.dashboard.control({ serial: 'T', action: 'eco', value: true });
  await assert.rejects(f.dashboard.control({ serial: 'T', action: 'eco', value: false }), /progress/);
  assert.equal(f.dashboard.lastCommand, null);
  pending.resolve();
  await first;
});
test('saved history survives restart without counting the stopped interval', async (t) => {
  const f = await fixture(t);
  const date = new Date().toISOString().slice(0, 10);
  f.dashboard.ledger.days['T/' + date] = { date, heating: 60, cooling: 30, observed: 120 };
  await f.dashboard.persist();
  const second = new ClimateDashboard(f.storage, { accounts: () => [], command: async () => {}, log: {} });
  await second.start();
  assert.equal(second.ledger.days['T/' + date].heating, 60);
  assert.equal(second.ledger.previous.size, 0);
  await second.stop();
});


test('Homebridge climate routes share configuration validation while standalone web access is disabled', async (t) => {
  const f = await fixture(t);
  const block = { platform: 'NestClimateCntrl', accounts: [{ refreshToken: 'PRIVATE-TOKEN' }] };
  const configPath = path.join(f.storage, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ platforms: [block] }));
  const web = new WebDashboard({ storage: f.storage, configPath, platformConfig: block, dashboard: f.dashboard });
  f.dashboard.webDashboard = web;
  await web.start();
  t.after(() => web.stop());
  assert.equal(web.status().enabled, false);
  assert.equal((await fetch(f.url + '/ui/config')).status, 403);
  assert.equal((await fetch(f.url + '/ui/config', { headers: { ...f.headers, Origin: 'https://example.com' } })).status, 403);
  const response = await fetch(f.url + '/ui/config', { headers: f.headers });
  const envelope = await response.json();
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(envelope).includes('PRIVATE-TOKEN'), false);
  assert.equal(envelope.config.options.pauseOnRestart, false);
  const save = () => fetch(f.url + '/ui/config', { method: 'PUT',
    headers: { ...f.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: envelope.revision, config: { options: { pauseOnRestart: true } } }),
  });
  const saved = await save();
  assert.equal(saved.status, 200);
  const result = await saved.json();
  assert.equal(result.config.options.pauseOnRestart, true);
  assert.equal(result.restartRequired, false);
  assert.equal((await save()).status, 409);
  assert.equal((await fetch(f.url + '/ui/login', { headers: f.headers })).status, 404);
  const root = JSON.parse(await fs.readFile(configPath));
  assert.equal(root.platforms[0].accounts[0].refreshToken, 'PRIVATE-TOKEN');
});

test('sensor and presence readings clear their reconnect flag without needing an HVAC state', async (t) => {
  const f = await fixture(t);
  f.dashboard.update('S', 'TemperatureSensor', { online: true, current_temperature: 20 }, 'A');
  f.dashboard.update('H', 'HomeAway', { online: true, occupancy: false }, 'A');
  f.dashboard.invalidate('A');
  f.dashboard.update('S', 'TemperatureSensor', { online: true }, 'A');
  assert.equal(f.dashboard.devices.get('S').needsUpdate, true);
  f.dashboard.update('S', 'TemperatureSensor', { current_temperature: 21 }, 'A');
  f.dashboard.update('H', 'HomeAway', { occupancy: true }, 'A');
  assert.equal(f.dashboard.devices.get('S').needsUpdate, false);
  assert.equal(f.dashboard.devices.get('H').needsUpdate, false);
  assert.equal(f.dashboard.devices.get('T').needsUpdate, true);
});
