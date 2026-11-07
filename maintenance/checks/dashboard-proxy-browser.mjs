// Exercise the real dashboard and browser cookies through an HTTPS-to-HTTP local proxy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { WebDashboard, loadWebCertificate } from '../../src/web-dashboard.js';
import { SESSION_COOKIE } from '../../src/web-dashboard-auth.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-proxy-browser-'));
const configPath = path.join(storage, 'config.json');
const platformConfig = { platform: 'NestClimateCntrl', name: 'Climate', webDashboard: { enabled: true, protocol: 'proxy', publicOrigin: 'https://localhost' } };
await fs.writeFile(configPath, JSON.stringify({ platforms: [platformConfig] }));
const commands = [];
const backend = new WebDashboard({
  storage, configPath, platformConfig,
  dashboard: {
    devices: new Map(),
    snapshot: () => ({ generatedAt: Date.now(), devices: [], accounts: [], runtimeTimezone: 'UTC' }),
    control: async (payload) => { commands.push(payload); return { accepted: true }; },
  },
  tlsFactory: () => assert.fail('Proxy backend requested a certificate'),
});
let proxy;
let browser;
try {
  await backend.setupAccount({ username: 'admin', password: 'eight888' });
  backend.options.port = 0;
  await backend.start();
  assert.equal(backend.status().available, true);
  backend.options.port = backend.server.address().port;
  proxy = https.createServer(await loadWebCertificate(storage, {}, ['localhost', '127.0.0.1']), (request, response) => {
    const upstream = http.request({ hostname: '127.0.0.1', port: backend.options.port, path: request.url, method: request.method, headers: request.headers }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.pipe(response);
    });
    upstream.on('error', () => response.writeHead(502).end());
    request.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const origin = 'https://127.0.0.1:' + proxy.address().port;
  backend.options.publicOrigin = origin;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Welcome home.' }).waitFor();
  assert.equal(await page.locator('#http-login-warning').isVisible(), false);
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('eight888');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await page.locator('#app').waitFor({ state: 'visible' });
  const cookie = (await context.cookies()).find((item) => item.name === SESSION_COOKIE);
  assert.ok(cookie);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Strict');
  assert.equal(await page.locator('#http-session-warning').isVisible(), false);
  await page.reload();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  assert.equal(await page.locator('#dashboard-url').textContent(), origin);
  await page.getByLabel('Dashboard name', { exact: true }).fill('Saved through proxy');
  const save = page.waitForResponse((response) => response.url().endsWith('/api/config') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.equal((await save).status(), 200);
  assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).platforms[0].name, 'Saved through proxy');
  const action = await page.evaluate(async () => {
    const session = await (await fetch('/api/session')).json();
    const response = await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify({ action: 'eco' }) });
    return response.status;
  });
  assert.equal(action, 200);
  assert.deepEqual(commands, [{ action: 'eco' }]);
  const denied = await page.evaluate(async () => (await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
  assert.equal(denied, 403);
  assert.equal(commands.length, 1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome home.' }).waitFor();
  assert.equal((await context.cookies()).some((item) => item.name === SESSION_COOKIE), false);
  await page.reload();
  await page.getByRole('heading', { name: 'Welcome home.' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Real HTTPS proxy browser: secure cookies, reload, settings, actions, CSRF and logout passed.');
} finally {
  await browser?.close();
  if (proxy?.listening) {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
  await backend.stop();
  await fs.rm(storage, { recursive: true, force: true });
}
