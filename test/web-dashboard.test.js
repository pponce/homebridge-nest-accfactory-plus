import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import { WebDashboardAuth, SESSION_COOKIE } from '../src/web-dashboard-auth.js';
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
  { method = 'GET', body, cookie, csrf, host = 'localhost:9444', origin = 'https://localhost:9444', type = 'application/json' } = {},
) {
  const headers = { host };
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
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) {
        yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      }
    },
  };
  const result = { status: 200, headers: {}, body: '' };
  const response = {
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
  assert.equal(saved.executionEnabled, false);
  const next = await store.save({
    revision: saved.revision,
    config: { devices: [{ serialNumber: 'thermo', ecoSwitch: true, fanDuration: '1h' }] },
  });
  const actual = JSON.parse(await fs.readFile(state.configPath, 'utf8')).platforms[1];
  assert.deepEqual(actual.devices, [
    { serialNumber: 'THERMO', ecoSwitch: true, fanDuration: '1h', future: { keep: true } },
    { serialNumber: 'SECOND', hidden: 'retained' },
  ]);
  await assert.rejects(store.save({ revision: next.revision, config: { rules: { temperature: [{ ...draft, enabled: true }] } } }));
  assert.throws(() =>
    validateRuleDrafts({
      occupancy: [{ id: 'a', kind: 'presence', name: 'Home', sourceIds: [], enabled: false }],
      fans: [{ id: 'a', kind: 'fan', name: 'Fan', enabled: false }],
    }),
  );
  assert.throws(() => validateRuleDrafts({ fans: [{ id: 'a', kind: 'fan', name: 'Fan', threshold: Infinity }] }));
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...draft, unsupported: true }] }));
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
