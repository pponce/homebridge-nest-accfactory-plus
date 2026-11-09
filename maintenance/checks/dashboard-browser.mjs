// Browser fixture only. No Nest, Homebridge or other real device requests are made.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkSourceRefresh } from './dashboard-source-refresh.mjs';
import { checkEcoFeedback } from './dashboard-eco-feedback.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.REVIEW_OUTPUT_DIR || path.join(project, 'maintenance/review/dashboard-web');
const staticRoot = path.join(project, 'homebridge-ui/dashboard');
const publicRoot = path.join(project, 'homebridge-ui/public');
const csrf = 'fixture-csrf';
let authenticated = true;
let statusAvailable = true;
let conflict = false;
let ecoEnabled = false;
let manualRoomTarget = null;
const commands = [];
const saves = [];
const ruleActions = [];
const pausedRules = new Set();
const automation = () => ({ available: true, rules: Object.values(config.rules).flat().map((rule) => ({ ...rule,
  ...(rule.kind === 'temperature' && manualRoomTarget !== null ? { desiredTemperature: manualRoomTarget,
    savedDesiredTemperature: rule.desiredTemperature, targetSource: 'manual', hasSchedule: true, nestTarget: 24 } : {}),
  paused: pausedRules.has(rule.id), phase: !rule.enabled ? 'disabled' : pausedRules.has(rule.id) ? 'paused' : 'active',
  reason: !rule.enabled ? 'Rule is disabled.' : pausedRules.has(rule.id) ? 'Paused by you.' : 'Automatic rule is running.' })) });
const day = 86400000;
const runtime = Array.from({ length: 7 }, (_, index) => ({ date: new Date(Date.now() - (6 - index) * day).toISOString().slice(0, 10), heating: [4700, 6500, 3800, 7200, 5100, 6100, 4200][index], cooling: [0, 900, 1200, 0, 600, 0, 700][index], observed: index === 6 ? 33000 : 86400 }));
const snapshot = () => ({
  generatedAt: Date.now(), runtimeTimezone: 'UTC', lastCommand: null,
  automation: automation(),
  accounts: [{ id: 'A', name: 'Google Home', authorised: true, observing: true, authMethod: 'refreshToken', lastUpdate: Date.now() }],
  devices: [
    { serial: 'T1', id: 'thermostat-living', type: 'Thermostat', account: 'A', lastUpdate: Date.now(), data: {
      description: 'Living room', model: 'Nest Learning Thermostat', online: true, temperature_scale: 'C', current_temperature: 21.5,
      physical_temperature: 21.5, current_humidity: 43, target_temperature: 22, hvac_mode: 'heat', hvac_state: 'heating',
      eco_mode: ecoEnabled, has_fan: true, fan_state: false, linked_rcs_sensors: ['sensor-bedroom'], active_rcs_sensor: '',
      schedules: { 0: { first: { time: 25200, 'temp-min': 21, 'temp-max': 25 }, second: { time: 79200, 'temp-min': 18, 'temp-max': 25 } }, 1: { first: { time: 25200, 'temp-min': 21, 'temp-max': 25 } } },
    }, runtime },
    { serial: 'T2', id: 'thermostat-upstairs', type: 'Thermostat', account: 'A', lastUpdate: Date.now(), data: {
      description: 'Upstairs', model: 'Nest Thermostat', online: true, temperature_scale: 'C', current_temperature: 20.8, physical_temperature: 20.8,
      current_humidity: 47, target_temperature: 21, hvac_mode: 'heat', hvac_state: 'off', eco_mode: false, has_fan: false,
      linked_rcs_sensors: [], active_rcs_sensor: '', schedules: {},
    }, runtime },
    { serial: 'S1', id: 'sensor-bedroom', type: 'TemperatureSensor', account: 'A', lastUpdate: Date.now(), data: { description: 'Bedroom sensor', online: true, current_temperature: 20.2 } },
    { serial: 'H1', id: 'home-away', type: 'HomeAway', account: 'A', lastUpdate: Date.now(), data: { description: 'Nest Home/Away', online: true, occupancy: true } },
  ],
});
const sourceData = () => ({ bridges: [{ id: 'B1', name: 'Room devices', kind: 'child', available: true }, { id: 'B2', name: 'Hallway', kind: 'child', available: true }], sources: [
  { id: 'office-temp', name: 'Office sensor', bridgeName: 'Room devices', provider: 'homebridge', kind: 'temperature', available: true, temperature: 20.1, lastReadAt: Date.now(), measuredAt: null },
  { id: 'hall-motion', name: 'Hallway motion', bridgeName: 'Hallway', provider: 'homebridge', kind: 'motion', available: true, detected: false, lastReadAt: Date.now(), measuredAt: null },
  { id: 'nest-home-copy', serial: 'h1', name: 'Nest Home/Away', bridgeName: 'Nest Climate Cntrl', kind: 'occupancy', available: true, detected: true, lastReadAt: Date.now() },
  { id: 'rule-output', serial: 'CLIMATE-PRESENCE-FIXTURE', name: 'Combined output', bridgeName: 'Nest Climate Cntrl', kind: 'occupancy', available: true, detected: true, lastReadAt: Date.now() },
  { id: 'living-presence', name: 'Living room presence', bridgeName: 'Room devices', provider: 'homebridge', kind: 'occupancy', available: true, detected: true, lastReadAt: Date.now(), measuredAt: null },
  { id: 'living-fan', name: 'Living room ceiling fan', bridgeName: 'Room devices', provider: 'homebridge', kind: 'fan', available: true, running: false, canControl: true, lastReadAt: Date.now(), measuredAt: null },
  { id: 'bedroom-fan', name: 'Bedroom fan', bridgeName: 'Room devices', provider: 'homebridge', kind: 'fan', available: true, running: true, canControl: true, lastReadAt: Date.now(), measuredAt: null },
] });
let config = {
  name: 'A little more comfort.', options: { eveHistory: true },
  devices: [{ serialNumber: 'T1', ecoSwitch: false, humiditySensor: true, fanPresetSwitches: false, fanDuration: '1h', scheduleTimeZone: 'America/Los_Angeles' }],
  rules: {
    temperature: [{ id: 'temperature-1', kind: 'temperature', name: 'Living room balance', enabled: false, thermostatId: 'T1', sourceIds: ['nest:thermostat-living'], aggregation: 'average', desiredTemperature: 21 }],
    occupancy: [{ id: 'presence-1', kind: 'presence', name: 'Someone is home', enabled: false, sourceIds: ['hall-motion', 'living-presence', 'nest-home-copy'], logic: 'any', holdMinutes: 10, awayDelayMinutes: 20 }],
    fans: [{ id: 'fan-1', kind: 'fan', name: 'Cooler evenings', enabled: false, sourceIds: ['office-temp'], targetIds: ['living-fan'], action: 'temperature', threshold: 24, hysteresis: 1 }],
  },
};
let revision = 1;
const envelope = () => ({ revision: String(revision), config: structuredClone(config), accounts: [{ name: 'Google Home', type: 'google', authMethod: 'refreshToken', configured: true }], web: { enabled: true, port: 9444, url: 'https://homebridge.local:9444', username: 'admin' }, executionEnabled: true, restartRequired: false });
const assets = new Set(['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']);
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  response.setHeader('Cache-Control', 'no-store');
  const route = new URL(request.url, 'http://localhost').pathname;
  const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)); };
  if (route.startsWith('/api/')) {
    let body = {};
    if (request.method !== 'GET') { let raw = ''; for await (const chunk of request) raw += chunk; body = JSON.parse(raw || '{}'); }
    if (route === '/api/session') { json(200, authenticated ? { authenticated: true, username: 'admin', csrfToken: csrf } : { authenticated: false, setupRequired: false }); return; }
    if (route === '/api/login') {
      if (body.username !== 'admin' || body.password !== 'fixture-password') { json(401, { error: 'Check your username and password.' }); return; }
      authenticated = true; json(200, { authenticated: true, username: 'admin', csrfToken: csrf }); return;
    }
    if (!authenticated) { json(401, { error: 'Sign in required.' }); return; }
    if (request.method !== 'GET' && request.headers['x-csrf-token'] !== csrf) { json(403, { error: 'CSRF token missing.' }); return; }
    if (route === '/api/logout') { authenticated = false; json(200, { authenticated: false }); return; }
    if (route === '/api/status') { json(statusAvailable ? 200 : 503, statusAvailable ? snapshot() : { error: 'Fixture bridge unavailable.' }); return; }
    if (route === '/api/sources') { json(200, sourceData()); return; }
    if (route === '/api/heating-response' && request.method === 'GET') { json(200, { revision: String(revision), rules: [] }); return; }
    if (route === '/api/config' && request.method === 'GET') { json(200, envelope()); return; }
    if (route === '/api/config' && request.method === 'PUT') {
      if (conflict || body.revision !== String(revision)) { json(409, { error: 'Configuration changed.' }); return; }
      saves.push(structuredClone(body)); config = structuredClone(body.config); revision++; json(200, envelope()); return;
    }
    if (route === '/api/command') { commands.push(structuredClone(body)); if (body.action === 'eco' && body.serial === 'T1') ecoEnabled = body.value; json(200, { accepted: true, message: 'Command accepted.' }); return; }
    if (route === '/api/rules/command') { ruleActions.push(body); if (body.action === 'pause') pausedRules.add(body.id); else pausedRules.delete(body.id); json(200, automation()); return; }
    json(404, { error: 'Not found.' }); return;
  }
  if (route.startsWith('/embedded/')) {
    const name = route.slice('/embedded/'.length) || 'index.html';
    if (name.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(name)) { response.writeHead(404).end(); return; }
    // Homebridge Config UI X serves only its root HTML entrypoint. Its custom-UI
    // asset controller rejects additional HTML documents, including nested index.html.
    if (name !== 'index.html' && /\.(?:html?|xhtml)$/i.test(name)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html');
      response.end(await fs.readFile(path.join(publicRoot, name)));
    } catch { response.writeHead(404).end(); }
    return;
  }
  let file; let name;
  if (route.startsWith('/shared/') && ['climate-utils.js', 'time-zone-picker.js', 'sensor-preview.js', 'fan-speed.js'].includes(route.slice(8))) { name = route.slice(8); file = path.join(publicRoot, name); }
  else { name = route === '/' ? 'index.html' : route.slice(1); if (!assets.has(name)) { response.writeHead(404).end(); return; } file = path.join(staticRoot, name); }
  response.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html');
  response.end(await fs.readFile(file));
});

await fs.mkdir(output, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.outerSave = true; window.schemaShown = false; window.configRevision = 'disk-1'; window.webAccounts = [];
    window.homebridge = {
      disableSaveButton() { window.outerSave = false; }, enableSaveButton() { window.outerSave = true; },
      showSchemaForm() { window.schemaShown = true; }, hideSchemaForm() { window.schemaShown = false; },
      updatePluginConfig: async (blocks) => { window.staged = blocks; },
      request: async (route, payload) => {
        if (route === '/plugin-config') return { revision: window.configRevision, blocks: [{ platform: 'NestClimateCntrl', accounts: [], devices: { T1: { custom: 'keep' } }, custom: 'keep' }] };
        if (route === '/web/status') {
          if (sessionStorage.getItem('runtime-inactive')) throw new Error('Fixture runtime inactive.');
          return { enabled: false, accountConfigured: false, instanceId: 'fixture-instance' };
        }
        if (route === '/web/account') { window.webAccounts.push(payload); return {}; }
        if (route !== '/climate') throw new Error('Unexpected host route: ' + route);
        const response = await fetch('/api' + payload.route, { method: payload.method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'fixture-csrf' },
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body) });
        const body = await response.json();
        if (!response.ok) { const error = new Error(body.error); error.error = { status: response.status }; throw error; }
        return body;
      },
    };
  });
  const embeddedUrl = 'http://127.0.0.1:' + server.address().port + '/embedded/';
  assert.equal((await page.request.get(embeddedUrl + 'climate/index.html')).status(), 404);
  const nestedHtmlRequests = [];
  page.on('request', (request) => {
    if (/\/embedded\/.+\/.+\.(?:html?|xhtml)(?:[?#]|$)/i.test(request.url())) nestedHtmlRequests.push(request.url());
  });
  await page.goto(embeddedUrl);
  await page.getByRole('heading', { name: 'Your thermostats', exact: true }).waitFor();
  assert.deepEqual(nestedHtmlRequests, []);
  assert.equal(await page.locator('#sign-out').isVisible(), false);
  assert.equal(await page.evaluate(() => window.outerSave), false);
  assert.equal(await page.locator('#connection-setup').isVisible(), true);
  await page.locator('[data-page="settings"]').click();
  await page.locator('#pause-on-restart').check();
  await page.getByRole('switch', { name: 'Show climate rule temperature in Apple Home', exact: false }).first().check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-bar').hidden);
  assert.equal(config.options.pauseOnRestart, true);
  assert.equal(config.devices[0].homeKitRoomTemperature, true);
  await page.locator('[data-page="rules"]').click();
  await page.getByRole('switch', { name: 'Pause after a manual Nest target change', exact: false }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-bar').hidden);
  assert.equal(config.rules.temperature[0].manualTargetBehavior, 'pause');
  await page.locator('[data-kind="fan"]').click();
  await page.getByText('Set rule priority', { exact: false }).waitFor();
  await page.locator('[data-kind="presence"]').click();
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).waitFor();
  await page.locator('#connection-setup').click();
  assert.equal(await page.evaluate(() => window.schemaShown && window.outerSave), true);
  assert.equal(await page.evaluate(() => window.staged[0].devices[0].custom), 'keep');
  await page.locator('#web-account-password').fill('fixture-password');
  await page.locator('#web-account-save').click();
  await page.waitForFunction(() => window.webAccounts.length === 1);
  assert.equal(await page.locator('#web-account-password').inputValue(), '');
  await page.evaluate(() => { window.configRevision = 'disk-2'; });
  await page.waitForFunction(() => !window.outerSave);
  await page.locator('#return-to-climate').click();
  assert.equal(await page.evaluate(() => window.schemaShown), false);
  await page.locator('[data-page="settings"]').click();
  await page.locator('#dashboard-name').fill('A conflicting edit');
  conflict = true;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Newer configuration found', { exact: true }).waitFor();
  assert.equal(config.name, 'A little more comfort.');
  conflict = false;
  // An asset failure must keep connection setup available without claiming the package is missing.
  await page.route('**/climate/markup.js', (route) => route.fulfill({ status: 503, body: 'Fixture asset unavailable.' }));
  await page.reload();
  await page.getByText('Climate controls could not load.', { exact: false }).waitFor();
  assert.equal(await page.locator('#host-notice').textContent().then((message) => /missing|reinstall/i.test(message)), false);
  await page.locator('#connection-setup').click();
  await page.locator('#connection-panel').waitFor();
  assert.equal(await page.evaluate(() => window.schemaShown && window.outerSave), true);
  await page.unroute('**/climate/markup.js');
  // A fresh opening while the child bridge is unavailable still permits account/network setup.
  statusAvailable = false;
  await page.evaluate(() => sessionStorage.setItem('runtime-inactive', 'true'));
  await page.reload();
  await page.locator('#connection-panel').waitFor();
  assert.equal(await page.evaluate(() => window.schemaShown && window.outerSave), true);
  await page.getByText('Standalone web access is optional and off by default.', { exact: false }).waitFor();
  assert.equal(await page.locator('#open-climate-web').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('Homebridge shared climate UI: restricted assets, load failure, settings, rules, persistence, conflicts, setup and offline access passed.');
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
