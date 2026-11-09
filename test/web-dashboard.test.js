import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WebDashboardAuth, SESSION_COOKIE, HTTP_SESSION_COOKIE } from '../src/web-dashboard-auth.js';
import { WebDashboardConfig, validateRuleDrafts } from '../src/web-dashboard-config.js';
import { WebDashboard, normalizeWebDashboard, loadWebCertificate } from '../src/web-dashboard.js';

async function fixture(t) {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-web-'));
  t.after(() => fs.rm(storage, { recursive: true, force: true }));
  const configPath = path.join(storage, 'config.json');
  const block = {
    platform: 'NestClimateCntrl',
    name: 'Nest Climate Cntrl',
    _bridge: { username: 'AA:BB:CC:DD:EE:FF', pin: '111-22-333' },
    accounts: [{ name: 'Home', type: 'google', refreshToken: 'TOKEN-VERY-SECRET', authMethod: 'refreshToken' }],
    options: { eveHistory: true, customOption: 'preserved' },
    devices: [{ serialNumber: 'THERMO', ecoSwitch: false, external: 'private-file.js', unknownField: { keep: true }, fanDuration: '1h' }],
    futureSetting: { preserved: true },
  };
  const root = { bridge: { pin: '999-88-777' }, platforms: [{ platform: 'Other', password: 'OTHER-SECRET' }, block] };
  await fs.writeFile(configPath, JSON.stringify(root), { mode: 0o600 });
  const dashboard = {
    devices: new Map([['THERMO', {}]]),
    snapshot: () => ({ devices: [], accounts: [], generatedAt: 123 }),
    control: async (payload) => ({ accepted: true, action: payload.action }),
  };
  return { storage, configPath, block, root, dashboard };
}

async function call(
  server,
  route,
  {
    method = 'GET',
    body,
    cookie,
    csrf,
    host = 'localhost:9444',
    origin = 'https://localhost:9444',
    type = 'application/json',
    extraHeaders = {},
    remoteAddress = '127.0.0.1',
  } = {},
) {
  const headers = { ...extraHeaders, host };
  if (origin !== null) {
    headers.origin = origin;
  }
  if (cookie) {
    headers.cookie = cookie;
  }
  if (csrf) {
    headers['x-csrf-token'] = csrf;
  }
  if (body !== undefined) {
    headers['content-type'] = type;
  }
  const request = {
    method,
    url: route,
    headers,
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) {
        yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      }
    },
  };
  const result = { status: 200, headers: {}, body: '' };
  const events = new EventEmitter();
  const response = {
    once: events.once.bind(events),
    writableFinished: false,
    setHeader(key, value) {
      result.headers[key.toLowerCase()] = value;
    },
    writeHead(status, extra = {}) {
      result.status = status;
      for (const [key, value] of Object.entries(extra)) {
        this.setHeader(key, value);
      }
      return this;
    },
    end(value) {
      result.body = value?.toString() ?? '';
      this.writableFinished = true;
      events.emit('finish');
      events.emit('close');
    },
  };
  await server.handle(request, response);
  try {
    result.data = JSON.parse(result.body);
  } catch {
    result.data = null;
  }
  return result;
}

test('child restart requires authentication, origin and CSRF, acknowledges before dispatch and blocks concurrent saves', async (t) => {
  const state = await fixture(t);
  let executed = 0;
  const restart = {
    phase: 'idle',
    capability: async () => ({ available: true }),
    async prepare(payload) {
      assert.deepEqual(Object.keys(payload), ['revision']);
      this.phase = 'prepared';
      return async () => {
        executed++;
        this.phase = 'requested';
      };
    },
  };
  const server = new WebDashboard({ ...state, platformConfig: state.block, restartFactory: () => restart });
  t.after(() => server.stop());
  await server.auth.setup({ username: 'admin', password: 'test-password' });
  const login = await call(server, '/api/login', { method: 'POST', body: { username: 'admin', password: 'test-password' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const csrf = login.data.csrfToken;
  const view = await server.config.snapshot();
  const request = { method: 'POST', cookie, csrf, body: { revision: view.revision } };
  assert.equal((await call(server, '/api/bridge/restart')).status, 401);
  assert.equal((await call(server, '/api/bridge/restart', { ...request, csrf: null })).status, 403);
  assert.equal((await call(server, '/api/bridge/restart', { ...request, origin: 'https://other.local' })).status, 403);
  assert.equal(executed, 0);
  server.config.restartRequired = true;
  assert.equal((await call(server, '/api/config', { cookie })).data.restart.available, true);
  const result = await call(server, '/api/bridge/restart', request);
  assert.equal(result.status, 202);
  assert.equal(result.data.instanceId, server.instanceId);
  assert.equal(executed, 0);
  assert.equal((await call(server, '/api/bridge/restart', request)).status, 409);
  const saveDuringRestart = await call(server, '/api/config', {
    ...request, method: 'PUT', body: { revision: view.revision, config: {} },
  });
  assert.equal(saveDuringRestart.status, 409);
  await assert.rejects(server.config.save({ revision: view.revision, config: {} }), { status: 409 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(executed, 1);
  assert.equal((await call(server, '/api/bridge/restart', { cookie })).data.phase, 'requested');
});

test('web accounts use private password hashes, expire sessions and invalidate sign-ins after reset', async (t) => {
  const { storage } = await fixture(t);
  let now = Date.now();
  const auth = new WebDashboardAuth(storage, { now: () => now });
  await auth.load();
  await assert.rejects(auth.setup({ username: 'bad name', password: 'short' }));
  await auth.setup({ username: 'admin', password: 'A long local password' });
  const saved = await fs.readFile(path.join(storage, 'web-account.json'), 'utf8');
  assert.doesNotMatch(saved, /A long local password/);
  assert.equal((await fs.stat(path.join(storage, 'web-account.json'))).mode & 0o777, 0o600);
  const loaded = new WebDashboardAuth(storage, { now: () => now });
  await loaded.load();
  const login = await loaded.login({ username: 'admin', password: 'A long local password' }, 'one');
  assert.equal(login.authenticated, true);
  assert.equal(loaded.session(SESSION_COOKIE + '=' + login.token).session.username, 'admin');
  now += 8 * 3600000 + 1;
  assert.equal(loaded.session(SESSION_COOKIE + '=' + login.token).session, undefined);
  await loaded.setup({ username: 'second', password: 'A new local password' });
  assert.equal((await loaded.login({ username: 'admin', password: 'A long local password' }, 'one')).authenticated, false);
  for (let i = 0; i < 5; i++) {
    await loaded.login({ username: 'wrong', password: 'wrong' }, 'bad-client');
  }
  assert.equal((await loaded.login({}, 'bad-client')).limited, true);
  now += 300001;
  assert.equal((await loaded.login({ username: 'second', password: 'A new local password' }, 'bad-client')).authenticated, true);
  loaded.close();
  assert.equal(loaded.sessions.size, 0);
});

test('web passwords accept 8 through 128 characters and reject out-of-range replacements', async (t) => {
  const { storage } = await fixture(t);
  const auth = new WebDashboardAuth(storage);
  await auth.setup({ username: 'admin', password: 'eight888' });
  const file = path.join(storage, 'web-account.json');
  const record = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(record, /eight888/);
  const loaded = new WebDashboardAuth(storage);
  await loaded.load();
  assert.equal((await loaded.login({ username: 'admin', password: 'eight888' }, 'one')).authenticated, true);
  for (const password of ['short-7', 'x'.repeat(129), undefined, 12345678]) {
    await assert.rejects(loaded.setup({ username: 'admin', password }), /8–128 characters/);
    assert.equal(await fs.readFile(file, 'utf8'), record);
  }
  assert.equal((await loaded.login({ username: 'admin', password: 'eight888' }, 'one')).authenticated, true);
  await loaded.setup({ username: 'admin', password: 'x'.repeat(128) });
  assert.equal((await loaded.login({ username: 'admin', password: 'x'.repeat(128) }, 'one')).authenticated, true);
  loaded.close();
});

test('concurrent account setup is serialized and outstanding old-password validation cannot issue a session', async (t) => {
  const { storage } = await fixture(t);
  const auth = new WebDashboardAuth(storage);
  await auth.setup({ username: 'admin', password: 'Original long password' });
  const old = auth.account;
  const login = auth.login({ username: 'admin', password: 'Original long password' }, 'one');
  auth.account = { ...old, username: 'changed' };
  assert.equal((await login).authenticated, false);
  await Promise.all([
    auth.setup({ username: 'first', password: 'First long password' }),
    auth.setup({ username: 'last', password: 'Last long password' }),
  ]);
  assert.equal(auth.account.username, 'last');
  const loaded = new WebDashboardAuth(storage);
  await loaded.load();
  assert.equal(loaded.account.username, 'last');
  const pending = loaded.login({ username: 'last', password: 'Last long password' }, 'one');
  loaded.close();
  assert.equal((await pending).authenticated, false);
});

test('malformed stored web accounts require setup instead of accepting coerced fields', async (t) => {
  const { storage } = await fixture(t);
  const auth = new WebDashboardAuth(storage);
  await auth.setup({ username: 'admin', password: 'A long local password' });
  const record = JSON.parse(await fs.readFile(path.join(storage, 'web-account.json'), 'utf8'));
  for (const malformed of [
    { ...record, username: 123 },
    { ...record, salt: [record.salt] },
    { ...record, hash: [record.hash] },
    { ...record, username: '' },
  ]) {
    await fs.writeFile(path.join(storage, 'web-account.json'), JSON.stringify(malformed));
    await auth.load();
    assert.equal(auth.account, undefined);
  }
  await fs.writeFile(path.join(storage, 'web-account.json'), 'x'.repeat(5000));
  await auth.load();
  assert.equal(auth.account, undefined);
});

test('each child bridge has separate private web credentials and TLS storage', async (t) => {
  const state = await fixture(t);
  const first = new WebDashboard({ ...state, platformConfig: state.block });
  const second = new WebDashboard({ ...state, platformConfig: { ...state.block, _bridge: { username: '11:22:33:44:55:66' } } });
  const main = new WebDashboard({ ...state, platformConfig: { platform: 'NestClimateCntrl' } });
  await first.setupAccount({ username: 'first', password: 'First bridge password' });
  await second.setupAccount({ username: 'second', password: 'Second bridge password' });
  assert.notEqual(first.directory, second.directory);
  assert.notEqual(first.directory, main.directory);
  assert.equal((await fs.stat(first.directory)).mode & 0o777, 0o700);
  const reload = new WebDashboard({ ...state, platformConfig: state.block });
  await reload.start();
  assert.equal(reload.status().username, 'first');
  assert.equal((await reload.auth.login({ username: 'second', password: 'Second bridge password' }, 'client')).authenticated, false);
  assert.equal((await reload.auth.login({ username: 'first', password: 'First bridge password' }, 'client')).authenticated, true);
  await Promise.all([first.stop(), second.stop(), main.stop(), reload.stop()]);
});

test('dashboard saves preserve credentials, child identity, unknown fields and other plugin blocks', async (t) => {
  const state = await fixture(t);
  const store = new WebDashboardConfig(state.configPath, state.block, { knownDevices: () => ['THERMO', 'NEW'] });
  const before = await store.snapshot();
  assert.doesNotMatch(JSON.stringify(before), /TOKEN-VERY-SECRET|OTHER-SECRET|111-22-333|999-88-777|private-file/);
  const saved = await store.save({
    revision: before.revision,
    config: { devices: [{ serialNumber: 'thermo', ecoSwitch: true, fanDuration: '45m', scheduleTimeZone: 'America/Los_Angeles' }] },
  });
  assert.equal(saved.restartRequired, true);
  const actual = JSON.parse(await fs.readFile(state.configPath, 'utf8'));
  const expected = structuredClone(state.root);
  expected.platforms[1].devices[0].ecoSwitch = true;
  expected.platforms[1].devices[0].fanDuration = '45m';
  expected.platforms[1].devices[0].scheduleTimeZone = 'America/Los_Angeles';
  assert.deepEqual(actual, expected);
  assert.equal((await fs.stat(state.configPath)).mode & 0o777, 0o600);
  await assert.rejects(store.save({ revision: before.revision, config: { name: 'stale' } }), (error) => error.status === 409);
  await assert.rejects(store.save({ revision: saved.revision, config: { _bridge: {} } }));
  await assert.rejects(store.save({ revision: saved.revision, config: { devices: [{ serialNumber: 'NOT-KNOWN', ecoSwitch: true }] } }));
  await assert.rejects(
    store.save({ revision: saved.revision, config: { devices: [{ serialNumber: 'THERMO', scheduleTimeZone: 'bad/time-zone' }] } }),
  );
  assert.deepEqual(JSON.parse(await fs.readFile(state.configPath, 'utf8')), expected);
});

test('legacy object device overrides retain unedited settings and rules remain drafts without a restart', async (t) => {
  const state = await fixture(t);
  state.block.devices = { THERMO: { ecoSwitch: false, fanDuration: '1h', future: { keep: true } }, SECOND: { hidden: 'retained' } };
  await fs.writeFile(state.configPath, JSON.stringify(state.root));
  const store = new WebDashboardConfig(state.configPath, state.block);
  const initial = await store.snapshot();
  assert.equal(initial.config.devices.length, 2);
  const draft = {
    id: 'one',
    name: 'Living room',
    kind: 'temperature',
    thermostatId: 'THERMO',
    sourceIds: ['nest:one'],
    aggregation: 'average',
    desiredTemperature: 21,
    enabled: false,
  };
  const saved = await store.save({ revision: initial.revision, config: { rules: { temperature: [draft] } } });
  assert.equal(saved.restartRequired, false);
  assert.equal(saved.executionEnabled, true);
  const next = await store.save({
    revision: saved.revision,
    config: { devices: [{ serialNumber: 'thermo', ecoSwitch: true, fanDuration: '1h' }] },
  });
  const actual = JSON.parse(await fs.readFile(state.configPath, 'utf8')).platforms[1];
  assert.deepEqual(actual.devices, [
    { serialNumber: 'THERMO', ecoSwitch: true, fanDuration: '1h', future: { keep: true } },
    { serialNumber: 'SECOND', hidden: 'retained' },
  ]);
  const enabled = await store.save({ revision: next.revision, config: { rules: { temperature: [{ ...draft, enabled: true }] } } });
  assert.equal(enabled.config.rules.temperature[0].enabled, true);
  assert.throws(() =>
    validateRuleDrafts({
      occupancy: [{ id: 'a', kind: 'presence', name: 'Home', sourceIds: [], enabled: false }],
      fans: [{ id: 'a', kind: 'fan', name: 'Fan', enabled: false }],
    }),
  );
  assert.throws(() => validateRuleDrafts({ fans: [{ id: 'a', kind: 'fan', name: 'Fan', threshold: Infinity }] }));
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...draft, unsupported: true }] }));
});

test('schedule time zone changes apply to the rule engine without requiring a bridge restart', async (t) => {
  const state = await fixture(t);
  const store = new WebDashboardConfig(state.configPath, state.block);
  const initial = await store.snapshot();
  const saved = await store.save({
    revision: initial.revision,
    config: { devices: [{ serialNumber: 'THERMO', scheduleTimeZone: 'America/Los_Angeles' }] },
  });
  assert.equal(saved.restartRequired, false);
  assert.equal(saved.config.devices[0].scheduleTimeZone, 'America/Los_Angeles');
  const automatic = await store.save({
    revision: saved.revision,
    config: { devices: [{ serialNumber: 'THERMO', scheduleTimeZone: null }] },
  });
  assert.equal(automatic.config.devices[0].scheduleTimeZone, undefined);
  assert.equal(automatic.restartRequired, false);
  await assert.rejects(
    store.save({ revision: automatic.revision, config: { devices: [{ serialNumber: 'THERMO', scheduleTimeZone: '+05:00' }] } }),
    /IANA/,
  );
});

test('dashboard unit preference persists without changing rules, credentials or requiring restart', async (t) => {
  const state = await fixture(t);
  const rule = {
    id: 'room',
    name: 'Room',
    kind: 'temperature',
    thermostatId: 'THERMO',
    sourceIds: ['nest:T'],
    targetIds: [],
    desiredTemperature: 21,
    maximumOffset: 1.5,
    enabled: true,
  };
  state.block.climateRuleDrafts = { temperature: [rule], fans: [], occupancy: [] };
  await fs.writeFile(state.configPath, JSON.stringify(state.root));
  const store = new WebDashboardConfig(state.configPath, state.block);
  let snapshot = await store.snapshot();
  assert.equal(snapshot.config.temperatureUnit, 'C');
  for (const unit of ['F', 'C', 'F']) {
    snapshot = await store.save({ revision: snapshot.revision, config: { temperatureUnit: unit } });
    assert.equal(snapshot.config.temperatureUnit, unit);
    assert.equal(snapshot.restartRequired, false);
    const saved = JSON.parse(await fs.readFile(state.configPath));
    assert.equal(saved.platforms[1].dashboardTemperatureUnit, unit);
    assert.deepEqual(saved.platforms[1].climateRuleDrafts, state.block.climateRuleDrafts);
    assert.deepEqual(saved.platforms[1].accounts, state.block.accounts);
    assert.deepEqual(saved.platforms[0], state.root.platforms[0]);
  }
  assert.equal((await new WebDashboardConfig(state.configPath, state.block).snapshot()).config.temperatureUnit, 'F');
  for (const value of ['K', 'fahrenheit', null, 1, {}]) {
    await assert.rejects(store.save({ revision: snapshot.revision, config: { temperatureUnit: value } }), /Celsius or Fahrenheit/);
  }
});

test('HTTPS API requires allowed hosts, a local session, matching origin and CSRF for changes', async (t) => {
  const state = await fixture(t);
  const server = new WebDashboard({ ...state, platformConfig: state.block, discoveryDelay: 0 });
  t.after(() => server.stop());
  await server.start();
  assert.equal(server.status().enabled, false);
  assert.equal(server.status().available, false);
  assert.equal((await call(server, '/api/session')).data.setupRequired, true);
  assert.equal((await call(server, '/api/status')).status, 401);
  assert.equal((await call(server, '/api/session', { host: 'rebind.example:9444', origin: null })).status, 403);
  assert.equal((await call(server, '/api/login', { method: 'POST', body: {}, origin: null })).status, 403);
  await server.setupAccount({ username: 'admin', password: 'A secure local password' });
  const login = await call(server, '/api/login', { method: 'POST', body: { username: 'admin', password: 'A secure local password' } });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const csrf = login.data.csrfToken;
  assert.equal((await call(server, '/api/status', { cookie })).status, 200);
  assert.equal((await call(server, '/api/status', { cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(server, '/api/config', { cookie })).data.config.name, 'Nest Climate Cntrl');
  assert.equal((await call(server, '/api/command', { method: 'POST', cookie, body: { action: 'eco' } })).status, 403);
  assert.equal((await call(server, '/api/command', { method: 'POST', cookie, csrf, body: { action: 'eco' } })).data.accepted, true);
  assert.equal((await call(server, '/api/command', { method: 'POST', cookie, csrf, body: '{broken' })).status, 400);
  assert.equal((await call(server, '/api/command', { method: 'POST', cookie, csrf, body: 'x'.repeat(66000) })).status, 413);
  assert.equal((await call(server, '/api/command', { method: 'POST', cookie, csrf, type: 'text/plain', body: '{}' })).status, 415);
  assert.equal((await call(server, '/../../config.json', { cookie })).status, 404);
  assert.equal((await call(server, '/%2e%2e/config.json', { cookie })).status, 404);
  assert.equal((await call(server, '/api/unknown', { cookie })).status, 404);
  assert.equal((await call(server, '/api/logout', { method: 'POST', cookie, csrf, body: {} })).status, 200);
  assert.equal((await call(server, '/api/status', { cookie })).status, 401);
  assert.match(login.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('HTTP is explicit and keeps origin, CSRF and session-cookie separation', async (t) => {
  const state = await fixture(t);
  assert.equal(normalizeWebDashboard().protocol, 'https');
  assert.equal(normalizeWebDashboard({ protocol: 'invalid' }).protocol, 'https');
  const server = new WebDashboard({ ...state, platformConfig: { ...state.block, webDashboard: { enabled: true, protocol: 'http' } } });
  await server.setupAccount({ username: 'admin', password: 'eight888' });
  assert.equal(server.status().protocol, 'http');
  assert.match(server.status().url, /^http:/);
  const loginOptions = { method: 'POST', body: { username: 'admin', password: 'eight888' }, origin: 'http://localhost:9444' };
  assert.equal((await call(server, '/api/login', { ...loginOptions, origin: 'https://localhost:9444' })).status, 403);
  assert.equal((await call(server, '/api/login', { ...loginOptions, origin: null })).status, 403);
  assert.equal((await call(server, '/api/login', { ...loginOptions, host: 'attacker.example:9444' })).status, 403);
  const login = await call(server, '/api/login', loginOptions);
  assert.equal(login.status, 200);
  assert.ok(login.headers['set-cookie'].startsWith(HTTP_SESSION_COOKIE + '='));
  assert.match(login.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(login.headers['set-cookie'], /Secure|Domain=/);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const options = { cookie, origin: 'http://localhost:9444' };
  const csrf = login.data.csrfToken;
  assert.equal((await call(server, '/api/status', options)).status, 200);
  assert.equal((await call(server, '/api/command', { ...options, method: 'POST', body: {} })).status, 403);
  assert.equal(
    (await call(server, '/api/command', { ...options, method: 'POST', body: {}, csrf, origin: 'http://other.local:9444' })).status,
    403,
  );
  assert.equal((await call(server, '/api/command', { ...options, method: 'POST', body: { action: 'eco' }, csrf })).status, 200);
  assert.equal(
    (await call(server, '/api/status', { ...options, cookie: cookie.replace(HTTP_SESSION_COOKIE, SESSION_COOKIE) })).status,
    401,
  );
  const secure = new WebDashboard({ ...state, platformConfig: state.block });
  secure.auth.sessions = server.auth.sessions;
  assert.equal((await call(secure, '/api/status', { cookie })).status, 401);
  const logout = await call(server, '/api/logout', { ...options, method: 'POST', body: {}, csrf });
  assert.equal(logout.status, 200);
  assert.equal(logout.headers['set-cookie'], HTTP_SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  assert.equal((await call(server, '/api/status', options)).status, 401);
  await server.stop();
  await secure.stop();
  for (const protocol of ['http', 'https']) {
    const custom = new WebDashboard({
      ...state,
      platformConfig: { ...state.block, webDashboard: { protocol, displayHost: 'climate.example.com' } },
    });
    assert.equal(custom.safeHost({ headers: { host: 'climate.example.com' } }), true);
    assert.equal(custom.safeHost({ headers: { host: 'climate.example.com:12345' } }), false);
    assert.equal(custom.sameOrigin({ headers: { host: 'climate.example.com', origin: protocol + '://climate.example.com' } }), true);
  }
});

test('HTTP listener works without TLS and warns about unencrypted passwords', async (t) => {
  const state = await fixture(t);
  const warnings = [];
  let tlsCalls = 0;
  const server = new WebDashboard({
    ...state,
    platformConfig: { ...state.block, webDashboard: { enabled: true, protocol: 'http', host: '127.0.0.1', certificatePath: '/unused' } },
    tlsFactory: async () => {
      tlsCalls++;
      throw new Error('TLS must not run in HTTP mode');
    },
    log: { warn: (message) => warnings.push(message) },
  });
  t.after(() => server.stop());
  await server.setupAccount({ username: 'admin', password: 'eight888' });
  server.options.port = 0;
  await server.start();
  assert.equal(server.status().available, true);
  assert.equal(tlsCalls, 0);
  assert.match(warnings.join(' '), /Passwords.*unencrypted/);
  await assert.rejects(fs.access(path.join(server.directory, 'web-private-key.pem')));
  server.options.port = server.server.address().port;
  const origin = 'http://127.0.0.1:' + server.options.port;
  const result = await new Promise((resolve, reject) => {
    const request = http.request(
      origin + '/api/login',
      { method: 'POST', headers: { origin, 'content-type': 'application/json' } },
      (response) => {
        let body = '';
        response.on('data', (part) => {
          body += part;
        });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body), cookie: response.headers['set-cookie'] }));
      },
    );
    request.on('error', reject);
    request.end(JSON.stringify({ username: 'admin', password: 'eight888' }));
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.authenticated, true);
  assert.ok(result.cookie[0].startsWith(HTTP_SESSION_COOKIE + '='));
  await server.stop();
  assert.equal(server.status().available, false);
});

test('source discovery is shared, read-only and closed with the dashboard', async (t) => {
  const state = await fixture(t);
  let reads = 0;
  let closed = false;
  const access = {
    client: { startDiscovery() {} },
    async start() {},
    async refresh() {
      reads++;
      return { bridges: [], sources: [] };
    },
    close() {
      closed = true;
    },
  };
  const server = new WebDashboard({ ...state, platformConfig: state.block, accessFactory: () => access, discoveryDelay: 0 });
  assert.deepEqual(await Promise.all([server.sources(), server.sources()]), [
    { bridges: [], sources: [] },
    { bridges: [], sources: [] },
  ]);
  assert.equal(reads, 1);
  await server.stop();
  assert.equal(closed, true);
  const ipv6 = new WebDashboard({ ...state, platformConfig: { ...state.block, webDashboard: { host: 'fd00::10', port: 9444 } } });
  assert.equal(ipv6.safeHost({ headers: { host: '[fd00::10]:9444' } }), true);
  assert.equal(normalizeWebDashboard({ enabled: 'true', port: 1, host: 'evil/name' }).enabled, false);
  assert.equal(normalizeWebDashboard({ port: 1 }).port, 9444);
  const failed = new WebDashboard({
    ...state,
    platformConfig: { ...state.block, webDashboard: { enabled: true } },
    tlsFactory: async () => {
      throw new Error('SECRET-PATH');
    },
  });
  const status = await failed.start();
  assert.equal(status.available, false);
  assert.doesNotMatch(status.error, /SECRET/);
});

test('local TLS certificates are private, reused and renewed when advertised names change', async (t) => {
  const { storage } = await fixture(t);
  const options = { certificatePath: '', keyPath: '' };
  const first = await loadWebCertificate(storage, options, ['localhost', '127.0.0.1']);
  const parsed = new crypto.X509Certificate(first.cert);
  assert.equal(parsed.checkHost('localhost'), 'localhost');
  assert.equal(parsed.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(parsed.checkPrivateKey(crypto.createPrivateKey(first.key)), true);
  assert.equal((await fs.stat(path.join(storage, 'web-private-key.pem'))).mode & 0o777, 0o600);
  assert.deepEqual(await loadWebCertificate(storage, options, ['localhost', '127.0.0.1']), first);
  const renamed = await loadWebCertificate(storage, options, ['localhost', '127.0.0.1', 'nest.local']);
  assert.equal(new crypto.X509Certificate(renamed.cert).checkHost('nest.local'), 'nest.local');
  assert.notDeepEqual(renamed.cert, first.cert);
  assert.deepEqual(
    await loadWebCertificate(
      storage,
      {
        certificatePath: path.join(storage, 'web-certificate.pem'),
        keyPath: path.join(storage, 'web-private-key.pem'),
      },
      [],
    ),
    renamed,
  );
  await assert.rejects(loadWebCertificate(storage, { certificatePath: 'only-one' }, []), /Both certificate/);
});

test('HTTPS listener serves only fixed assets and closes cleanly', async (t) => {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip('This test environment cannot bind local listeners; the CI runner executes this check.');
      return;
    }
    throw error;
  }
  const state = await fixture(t);
  await fs.mkdir(path.join(state.storage, 'dashboard'));
  await fs.writeFile(path.join(state.storage, 'dashboard/index.html'), '<!doctype html><title>Climate</title>');
  const server = new WebDashboard({
    ...state,
    platformConfig: { ...state.block, webDashboard: { enabled: true, host: '127.0.0.1' } },
    assetRoot: state.storage,
  });
  t.after(() => server.stop());
  server.options.port = 0;
  await server.start();
  assert.equal(server.status().available, true);
  server.options.port = server.server.address().port;
  const get = (pathname) =>
    new Promise((resolve, reject) => {
      https
        .get('https://127.0.0.1:' + server.options.port + pathname, { rejectUnauthorized: false }, (response) => {
          let body = '';
          response.on('data', (part) => {
            body += part;
          });
          response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
        })
        .on('error', reject);
    });
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /Climate/);
  assert.equal((await get('/web-private-key.pem')).status, 404);
  assert.equal(JSON.parse((await get('/api/session')).body).setupRequired, true);
  await server.stop();
  assert.equal(server.status().available, false);
});

test('shutdown during HTTPS or source startup prevents late listeners and discovery clients', async (t) => {
  const state = await fixture(t);
  let releaseTls;
  let enteredTls;
  const tlsEntered = new Promise((resolve) => {
    enteredTls = resolve;
  });
  const tlsReady = new Promise((resolve) => {
    releaseTls = resolve;
  });
  const server = new WebDashboard({
    ...state,
    platformConfig: { ...state.block, webDashboard: { enabled: true } },
    tlsFactory: async () => {
      enteredTls();
      await tlsReady;
      return {};
    },
  });
  const started = server.start();
  await tlsEntered;
  const stopped = server.stop();
  releaseTls();
  await Promise.all([started, stopped]);
  assert.equal(server.status().available, false);
  assert.equal(server.server, undefined);

  let releaseAccess;
  let enteredAccess;
  let closed = false;
  let discovered = false;
  const accessEntered = new Promise((resolve) => {
    enteredAccess = resolve;
  });
  const accessReady = new Promise((resolve) => {
    releaseAccess = resolve;
  });
  const discovery = new WebDashboard({
    ...state,
    platformConfig: state.block,
    discoveryDelay: 0,
    accessFactory: () => ({
      client: {
        startDiscovery() {
          discovered = true;
        },
      },
      async start() {
        enteredAccess();
        await accessReady;
      },
      close() {
        closed = true;
      },
    }),
  });
  const rejected = assert.rejects(discovery.sources(), /stopping/);
  await accessEntered;
  const closedServer = discovery.stop();
  releaseAccess();
  await Promise.all([rejected, closedServer]);
  assert.equal(closed, true);
  assert.equal(discovered, false);
  await assert.rejects(discovery.sources(), /stopping/);
});

test('proxy mode requires a valid public HTTPS origin and always binds to IPv4 loopback', async (t) => {
  const state = await fixture(t);
  const options = normalizeWebDashboard({ protocol: 'proxy', host: '::', publicOrigin: 'https://Climate.example.com:443/' });
  assert.equal(options.host, '127.0.0.1');
  assert.equal(options.publicOrigin, 'https://climate.example.com');
  for (const publicOrigin of [
    '',
    undefined,
    'http://climate.example.com',
    'https://user@climate.example.com',
    'https://climate.example.com/path',
    'https://climate.example.com/?x',
    'https://climate.example.com/#x',
    'https://climate.example.com/path/..',
    'https://climate.example.com\\other',
    'https://climate.example.com:99999',
    'https://climate.example.com?',
  ]) {
    const server = new WebDashboard({
      ...state,
      platformConfig: { ...state.block, webDashboard: { enabled: true, protocol: 'proxy', publicOrigin } },
      tlsFactory: () => assert.fail('Proxy must not load TLS'),
    });
    const status = await server.start();
    assert.equal(status.available, false, String(publicOrigin));
    assert.equal(status.url, null);
    assert.match(status.error, /public HTTPS origin/);
    assert.equal(server.server, undefined);
    await server.stop();
  }
});

test('proxy trust comes from the loopback peer and public Host and Origin, never forwarded headers', async (t) => {
  const state = await fixture(t);
  const server = new WebDashboard({
    ...state,
    platformConfig: { ...state.block, webDashboard: { enabled: true, protocol: 'proxy', publicOrigin: 'https://climate.example.com' } },
  });
  t.after(() => server.stop());
  assert.equal(server.status().url, 'https://climate.example.com');
  assert.equal(server.status().protocol, 'https');
  assert.equal(server.status().connectionMode, 'proxy');
  const base = { host: 'climate.example.com', origin: 'https://climate.example.com' };
  const spoof = {
    forwarded: 'for=127.0.0.1;host=climate.example.com;proto=https',
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-host': 'climate.example.com',
    'x-forwarded-proto': 'https',
  };
  for (const remoteAddress of ['192.0.2.10', '::ffff:192.0.2.10', '::1', undefined]) {
    assert.equal(server.safeHost({ headers: { host: base.host, ...spoof }, socket: { remoteAddress } }), false);
  }
  for (const host of ['localhost:9444', '127.0.0.1:9444', 'climate.example.com:9444', 'evil.example', 'climate.example.com/']) {
    assert.equal((await call(server, '/api/session', { ...base, host, extraHeaders: spoof })).status, 403);
  }
  for (const origin of [
    'http://climate.example.com',
    'https://climate.example.com:9444',
    'https://evil.example',
    'null',
    'https://climate.example.com/#x',
    'https://climate.example.com/?x',
  ]) {
    assert.equal((await call(server, '/api/session', { ...base, origin, extraHeaders: spoof })).status, 403);
  }
  assert.equal((await call(server, '/api/login', { ...base, origin: null, method: 'POST', body: {}, extraHeaders: spoof })).status, 403);
  assert.equal((await call(server, '/api/session', { ...base, origin: null })).status, 200);
  assert.equal(
    (
      await call(server, '/api/session', {
        ...base,
        extraHeaders: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' },
      })
    ).status,
    200,
  );
  for (const protocol of ['http', 'https']) {
    const direct = new WebDashboard({ ...state, platformConfig: { ...state.block, webDashboard: { protocol } } });
    assert.equal(
      (
        await call(direct, '/api/login', {
          method: 'POST',
          body: {},
          origin: protocol === 'http' ? 'https://localhost:9444' : 'http://localhost:9444',
          extraHeaders: spoof,
        })
      ).status,
      403,
    );
    await direct.stop();
  }
});

test('HTTPS reverse proxy carries secure sessions, actions, configuration and logout to a certificate-free HTTP backend', async (t) => {
  const state = await fixture(t);
  const ruleActions = [];
  state.dashboard.automation = {
    tick: async () => {},
    control: async (payload) => {
      if (payload.action === 'invalid') {
        throw new Error('Invalid rule action');
      }
      ruleActions.push(payload);
      return { available: true, rules: [{ id: payload.id, paused: payload.action === 'pause' }] };
    },
  };
  const warnings = [];
  const server = new WebDashboard({
    ...state,
    platformConfig: {
      ...state.block,
      webDashboard: {
        enabled: true,
        protocol: 'proxy',
        host: '0.0.0.0',
        publicOrigin: 'https://climate.example.com',
        certificatePath: '/not-readable',
        keyPath: '/not-readable',
      },
    },
    tlsFactory: () => assert.fail('Proxy backend must not read or generate certificates'),
    log: { warn: (value) => warnings.push(value) },
  });
  t.after(() => server.stop());
  await server.setupAccount({ username: 'admin', password: 'eight888' });
  server.options.port = 0;
  await server.start();
  assert.equal(server.status().available, true);
  assert.equal(server.server.address().address, '127.0.0.1');
  assert.equal(warnings.length, 0);
  assert.deepEqual(
    (await fs.readdir(server.directory)).filter((file) => file.endsWith('.pem')),
    [],
  );
  server.options.port = server.server.address().port;
  // TLS belongs solely to this test proxy. The dashboard's TLS factory must never run.
  const tls = await loadWebCertificate(state.storage, {}, ['localhost', '127.0.0.1']);
  const proxy = https.createServer(tls, (request, response) => {
    const upstream = http.request(
      { hostname: '127.0.0.1', port: server.options.port, path: request.url, method: request.method, headers: request.headers },
      (reply) => {
        response.writeHead(reply.statusCode, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => response.writeHead(502).end());
    request.pipe(upstream);
  });
  t.after(async () => {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const publicOrigin = 'https://127.0.0.1:' + proxy.address().port;
  server.options.publicOrigin = publicOrigin;
  const request = (route, { method = 'GET', body, headers = {}, origin = publicOrigin } = {}) =>
    new Promise((resolve, reject) => {
      const outgoing = https.request(
        publicOrigin + route,
        {
          method,
          ca: tls.cert,
          servername: 'localhost',
          headers: { ...(origin === null ? {} : { origin }), 'content-type': 'application/json', ...headers },
        },
        (response) => {
          let bytes = '';
          response.on('data', (part) => {
            bytes += part;
          });
          response.on('end', () => {
            let data;
            try {
              data = JSON.parse(bytes);
            } catch {
              /* HTML asset */
            }
            resolve({ status: response.statusCode, headers: response.headers, data });
          });
        },
      );
      outgoing.on('error', reject);
      outgoing.end(body === undefined ? undefined : JSON.stringify(body));
    });
  assert.equal((await request('/', { origin: null })).status, 200);
  assert.equal((await request('/api/status')).status, 401);
  assert.equal((await request('/api/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })).status, 401);
  assert.equal(
    (
      await request('/api/login', {
        method: 'POST',
        origin: 'http://127.0.0.1:' + proxy.address().port,
        headers: { 'x-forwarded-proto': 'https' },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/session', {
        headers: { host: 'evil.example', 'x-forwarded-host': new URL(publicOrigin).host },
      })
    ).status,
    403,
  );
  const login = await request('/api/login', { method: 'POST', body: { username: 'admin', password: 'eight888' } });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(login.headers['set-cookie'][0].startsWith(SESSION_COOKIE + '='));
  const headers = { cookie: login.headers['set-cookie'][0].split(';')[0], 'x-csrf-token': login.data.csrfToken };
  assert.equal(
    (await request('/api/rules/command', { method: 'POST', headers: { cookie: headers.cookie }, body: { id: 'rooms', action: 'resume' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await request('/api/rules/command', {
        method: 'POST',
        headers,
        origin: 'https://evil.example',
        body: { id: 'rooms', action: 'resume' },
      })
    ).status,
    403,
  );
  assert.equal(ruleActions.length, 0);
  assert.equal(
    (await request('/api/rules/command', { method: 'POST', headers, body: { id: 'rooms', action: 'pause' } })).data.rules[0].paused,
    true,
  );
  assert.deepEqual(ruleActions, [{ id: 'rooms', action: 'pause' }]);
  assert.equal((await request('/api/rules/command', { method: 'POST', headers, body: { id: 'rooms', action: 'invalid' } })).status, 400);
  assert.equal((await request('/api/session', { headers })).data.authenticated, true);
  assert.equal((await request('/api/status', { headers })).status, 200);
  assert.equal(
    (
      await request('/api/command', {
        method: 'POST',
        headers: { cookie: headers.cookie },
        body: { action: 'eco' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/command', {
        method: 'POST',
        headers,
        origin: 'https://evil.example',
        body: { action: 'eco' },
      })
    ).status,
    403,
  );
  assert.equal((await request('/api/command', { method: 'POST', headers, body: { action: 'eco' } })).data.accepted, true);
  const config = await request('/api/config', { headers });
  assert.equal(config.data.web.url, publicOrigin);
  assert.doesNotMatch(JSON.stringify(config.data), /TOKEN-VERY-SECRET|OTHER-SECRET/);
  const payload = { revision: config.data.revision, config: { name: 'Proxy dashboard' } };
  assert.equal(
    (
      await request('/api/config', {
        method: 'PUT',
        headers: { ...headers, 'x-csrf-token': 'wrong' },
        body: payload,
      })
    ).status,
    403,
  );
  const saved = await request('/api/config', { method: 'PUT', headers, body: payload });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.config.name, 'Proxy dashboard');
  assert.equal(JSON.parse(await fs.readFile(state.configPath, 'utf8')).platforms[1].accounts[0].refreshToken, 'TOKEN-VERY-SECRET');
  assert.equal((await request('/api/config', { method: 'PUT', headers, body: payload })).status, 409);
  assert.equal((await request('/api/logout', { method: 'POST', headers: { cookie: headers.cookie }, body: {} })).status, 403);
  const logout = await request('/api/logout', { method: 'POST', headers, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers['set-cookie'][0], /Secure; SameSite=Strict; Max-Age=0/);
  assert.equal((await request('/api/session', { headers })).data.authenticated, false);
  assert.equal((await request('/api/status', { headers })).status, 401);
  assert.equal((await request('/api/rules/command', { method: 'POST', headers, body: { id: 'rooms', action: 'resume' } })).status, 401);
});

test('heating recommendations use authenticated reads and CSRF-protected explicit Apply', async (t) => {
  const state = await fixture(t);
  const server = new WebDashboard({ ...state, platformConfig: state.block });
  t.after(() => server.stop());
  await server.setupAccount({ username: 'admin', password: 'eight888' });
  assert.equal((await call(server, '/api/heating-response')).status, 401);
  const login = await call(server, '/api/login', { method: 'POST', body: { username: 'admin', password: 'eight888' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const csrf = login.data.csrfToken;
  assert.equal((await call(server, '/api/heating-response', { cookie })).status, 503);
  let reads = 0;
  let applies = 0;
  state.dashboard.automation = {
    heatingRecommendations: async () => {
      reads++;
      return { rules: [] };
    },
    applyHeatingRecommendation: async (payload) => {
      applies++;
      return { applied: payload.id };
    },
  };
  assert.deepEqual((await call(server, '/api/heating-response', { cookie })).data.rules, []);
  assert.equal(reads, 1);
  assert.equal(applies, 0);
  const mutation = { method: 'POST', cookie, body: { id: 'rooms' } };
  assert.equal((await call(server, '/api/heating-response/apply', mutation)).status, 403);
  assert.equal((await call(server, '/api/heating-response/apply', { ...mutation, csrf })).data.applied, 'rooms');
  assert.equal(applies, 1);
});
