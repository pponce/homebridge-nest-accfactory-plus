import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { loadWebCertificate } from '../src/web-dashboard.js';
import { ChildBridgeRestart } from '../src/child-bridge-restart.js';
import { WebDashboardConfig } from '../src/web-dashboard-config.js';

async function fixture(t, tls = false) {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-restart-'));
  const file = path.join(storage, 'config.json');
  const username = 'AA:BB:CC:DD:EE:FF';
  const secret = 'test-only-service-key-'.repeat(3);
  const calls = [];
  const metadata = { username, plugin: 'homebridge-nest-climate-cntrl', identifier: 'NestClimateCntrl', pid: process.pid };
  let responseMode = 'normal';
  const listener = (request, response) => {
    calls.push([request.method, request.url]);
    const token = request.headers.authorization?.slice(7).split('.');
    assert.equal(token.length, 3);
    assert.equal(token[2], crypto.createHmac('sha256', secret).update(token[0] + '.' + token[1]).digest('base64url'));
    const payload = JSON.parse(Buffer.from(token[1], 'base64url'));
    assert.equal(payload.service, metadata.plugin === 'other' ? 'homebridge-nest-climate-cntrl' : metadata.plugin);
    assert.equal(payload.admin, true);
    assert.equal(payload.exp - payload.iat, 60);
    assert.equal(payload.instanceId, crypto.createHash('sha256').update(secret).digest('hex'));
    if (responseMode === 'disconnect' || (responseMode === 'put-disconnect' && request.method === 'PUT')) {
      request.socket.destroy();
      return;
    }
    if (responseMode === 'redirect') {
      response.writeHead(302, { Location: 'http://example.invalid/never-follow' }).end();
      return;
    }
    if (responseMode === 'invalid') {
      response.end('not json');
      return;
    }
    if (responseMode === 'large') {
      response.end('X'.repeat(600000));
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.method === 'GET' ? [metadata] : { ok: responseMode !== 'reject' }));
  };
  const certificate = tls ? await loadWebCertificate(storage, {}, ['localhost']) : null;
  const uiServer = tls ? https.createServer(certificate, listener) : http.createServer(listener);
  await new Promise((resolve) => uiServer.listen(0, '127.0.0.1', resolve));
  const block = { platform: 'NestClimateCntrl', _bridge: { username } };
  const root = { platforms: [block, { platform: 'Config', port: uiServer.address().port }] };
  if (tls) {
    const cert = path.join(storage, 'uix.crt');
    await fs.writeFile(cert, certificate.cert);
    root.platforms[1].ssl = { cert };
  }
  const write = () => fs.writeFile(file, JSON.stringify(root));
  await write();
  await fs.writeFile(path.join(storage, '.uix-secrets'), JSON.stringify({ secretKey: secret }));
  const config = new WebDashboardConfig(file, block);
  config.restartRequired = true;
  const restart = new ChildBridgeRestart({ storage, config, username });
  t.after(async () => {
    uiServer.closeAllConnections();
    await new Promise((resolve) => uiServer.close(resolve));
    await fs.rm(storage, { recursive: true, force: true });
  });
  return { storage, config, restart, metadata, root, calls, write, mode: (value) => { responseMode = value; } };
}

test('explicit restart authenticates locally and targets only the current child process', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.restart.capability(), { available: true, phase: 'idle', message: null });
  const view = await f.config.snapshot();
  const restart = await f.restart.prepare({ revision: view.revision });
  assert.equal(f.calls.some(([method]) => method === 'PUT'), false);
  await assert.rejects(f.restart.prepare({ revision: view.revision }), { status: 409 });
  await restart();
  assert.equal(f.restart.phase, 'requested');
  assert.deepEqual(f.calls.filter(([method]) => method === 'PUT'), [['PUT', '/api/server/restart/AABBCCDDEEFF']]);
  assert.doesNotMatch(JSON.stringify(await f.restart.capability()), /token|test-only-service/);
});

test('restart requires saved configuration and rejects changed revisions and arbitrary targets', async (t) => {
  const f = await fixture(t);
  const view = await f.config.snapshot();
  for (const payload of [null, {}, { revision: view.revision, username: 'OTHER' }]) {
    await assert.rejects(f.restart.prepare(payload), { status: 400 });
  }
  await assert.rejects(f.restart.prepare({ revision: 'old' }), { status: 409 });
  f.config.restartRequired = false;
  await assert.rejects(f.restart.prepare({ revision: view.revision }), { status: 409 });
  f.config.restartRequired = true;
  const restart = await f.restart.prepare({ revision: view.revision });
  f.root.platforms[0].name = 'Changed elsewhere';
  await f.write();
  await restart();
  assert.equal(f.restart.phase, 'failed');
  assert.match(f.restart.message, /Settings changed/);
  assert.equal(f.calls.some(([method]) => method === 'PUT'), false);
});

test('main bridge, shared bridge, wrong process or plugin cannot be restarted', async (t) => {
  const f = await fixture(t);
  const main = new ChildBridgeRestart({ storage: f.storage, config: f.config });
  assert.equal((await main.capability()).available, false);
  f.root.platforms.push({ platform: 'Other', _bridge: { username: f.metadata.username } });
  await f.write();
  assert.match((await f.restart.capability()).message, /shared/);
  f.root.platforms.pop();
  f.root.platforms[0]._bridge.disable = true;
  await f.write();
  assert.equal((await f.restart.capability()).available, false);
  delete f.root.platforms[0]._bridge.disable;
  await f.write();
  for (const [key, value] of [['pid', -1], ['plugin', 'other'], ['identifier', 'Other'], ['manuallyStopped', true]]) {
    const previous = f.metadata[key];
    f.metadata[key] = value;
    assert.equal((await f.restart.capability()).available, false);
    f.metadata[key] = previous;
  }
  assert.equal(f.calls.some(([method]) => method === 'PUT'), false);
});

test('missing UI, credentials and invalid ports offer an actionable fallback without a restart', async (t) => {
  const f = await fixture(t);
  const ui = f.root.platforms.pop();
  await f.write();
  assert.equal((await f.restart.capability()).available, false);
  f.root.platforms.push({ ...ui, port: -1 });
  await f.write();
  assert.match((await f.restart.capability()).message, /port/);
  f.root.platforms[1] = ui;
  await f.write();
  await fs.writeFile(path.join(f.storage, '.uix-secrets'), '{}');
  assert.match((await f.restart.capability()).message, /authentication/);
  assert.equal(f.calls.length, 0);
});

test('unreadable, oversized, redirected and interrupted UI responses never trigger a fallback restart', async (t) => {
  const f = await fixture(t);
  for (const mode of ['invalid', 'large', 'redirect', 'disconnect']) {
    f.mode(mode);
    assert.equal((await f.restart.capability()).available, false);
  }
  assert.equal(f.calls.some(([method]) => method === 'PUT'), false);
  f.mode('normal');
  const restart = await f.restart.prepare({ revision: (await f.config.snapshot()).revision });
  f.mode('reject');
  await restart();
  assert.equal(f.restart.phase, 'failed');
  assert.match(f.restart.message, /did not confirm/);
});

test('local HTTPS trusts the configured UI certificate and validates its hostname', async (t) => {
  const f = await fixture(t, true);
  assert.equal((await f.restart.capability()).available, true);
  f.root.platforms[1].ssl.cert = '/missing/test-certificate';
  await f.write();
  assert.equal((await f.restart.capability()).available, false);
});

test('an interrupted restart reply stays pending and is never automatically resent', async (t) => {
  const f = await fixture(t);
  const payload = { revision: (await f.config.snapshot()).revision };
  const restart = await f.restart.prepare(payload);
  f.mode('put-disconnect');
  await restart();
  assert.equal(f.restart.phase, 'requested');
  assert.match(f.restart.message, /interrupted/);
  await assert.rejects(f.restart.prepare(payload), { status: 409 });
  assert.equal(f.calls.filter(([method]) => method === 'PUT').length, 1);
});
