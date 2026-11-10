import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConnectionSetup } from '../homebridge-ui/connection-setup.js';
import { applySetup, configuredAccounts, setupDraft } from '../homebridge-ui/public/connection-config.js';

const account = { name: 'Home', type: 'google', authMethod: 'refreshToken', refreshToken: 'fixture-token' };

test('onboarding uses usable saved accounts and preserves unrelated configuration', () => {
  assert.equal(configuredAccounts([]), false);
  assert.equal(configuredAccounts([{ accounts: [{ ...account, exclude: true }] }]), false);
  assert.equal(configuredAccounts([{ accounts: [{ ...account, refreshToken: ' ' }] }]), false);
  assert.equal(configuredAccounts([{ accounts: [account] }]), true);
  const legacy = { google: { issuetoken: 'fixture-url', cookie: 'fixture-cookie' } };
  assert.equal(configuredAccounts([legacy]), true);
  const original = [{
    platform: 'NestClimateCntrl', ...legacy, custom: 'preserve',
    _bridge: { username: 'AA:BB:CC:DD:EE:FF' },
    devices: { T1: { custom: true } }, rules: { temperature: [{ id: 'zone' }] },
  }, { platform: 'NestClimateCntrl', name: 'Second', accounts: [account] }];
  const before = structuredClone(original);
  const draft = setupDraft(original[0]);
  assert.equal(draft.webDashboard.enabled, false);
  draft.accounts = [account];
  const result = applySetup(original, draft);
  assert.deepEqual(original, before);
  for (const key of ['custom', '_bridge', 'devices', 'rules']) {
    assert.deepEqual(result[0][key], original[0][key]);
  }
  assert.deepEqual(result[1], original[1]);
  assert.equal(result[0].google, undefined);
  assert.equal(applySetup([], draft)[0].platform, 'NestClimateCntrl');
  assert.throws(() => applySetup([], { ...draft, accounts: [{ ...account, refreshToken: '' }] }), /credentials/);
  assert.throws(() => applySetup([], { ...draft, webDashboard: { ...draft.webDashboard, port: 0 } }), /port/);
  assert.throws(() => applySetup([], { ...draft, accounts: [], webDashboard: { ...draft.webDashboard, enabled: true } }), /account/);
});

test('first-install web login uses saved bridge identity and stores only a private hash', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-setup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'config.json');
  const block = { platform: 'NestClimateCntrl', accounts: [account], _bridge: { username: 'AA:BB:CC:DD:EE:FF' } };
  const write = (blocks) => fs.writeFile(configPath, JSON.stringify({ platforms: blocks }));
  await write([block]);
  let forwarded = 0;
  const setup = new ConnectionSetup(configPath, root, async () => {
    forwarded++;
    throw new Error('Runtime unavailable');
  }, () => import('../src/web-dashboard-auth.js'));
  let current = await setup.read();
  const credentials = { username: 'climate', password: 'fixture-password', revision: current.revision };
  assert.deepEqual(await setup.accountStatus(), { accountConfigured: false, username: 'admin' });
  await assert.rejects(setup.saveAccount({ ...credentials, revision: 'stale' }), /changed/);
  await assert.rejects(setup.saveAccount({ ...credentials, password: 'short' }), /password/);
  assert.deepEqual(await setup.saveAccount(credentials), { accountConfigured: true, username: 'climate' });
  const file = path.join(root, 'nest-climate/web/bridge-aabbccddeeff/web-account.json');
  const bytes = await fs.readFile(file, 'utf8');
  assert.equal(bytes.includes(credentials.password), false);
  assert.equal(JSON.parse(bytes).hash.length, 128);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await setup.accountStatus(), { accountConfigured: true, username: 'climate' });
  await assert.rejects(setup.saveAccount(credentials), /Start the Nest bridge/);
  await fs.writeFile(path.join(root, 'nest-climate/endpoint.json'), '{}');
  await assert.rejects(setup.saveAccount(credentials), /Runtime unavailable/);
  assert.equal(forwarded, 1);
  assert.equal(await fs.readFile(file, 'utf8'), bytes);
  await write([]);
  current = await setup.read();
  await assert.rejects(setup.saveAccount({ ...credentials, revision: current.revision }), /Save your Nest/);
  await write([block, block]);
  current = await setup.read();
  await assert.rejects(setup.saveAccount({ ...credentials, revision: current.revision }), /Save your Nest/);
});
