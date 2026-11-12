import { WebDashboardConfig } from '../../src/web-dashboard-config.js';
import { checkRuleWindows } from './dashboard-rule-windows.mjs';
// Browser fixture only. No Nest, Homebridge or other real device requests are made.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkSourceRefresh } from './dashboard-source-refresh.mjs';
import { checkEcoFeedback } from './dashboard-eco-feedback.mjs';
import { navigate, checkCompactNavigation } from './dashboard-navigation.mjs';

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
let feedbackFixture = null;
const commands = [];
const saves = [];
const ruleActions = [];
const pausedRules = new Set();
const automation = () => ({ available: true, rules: Object.values(config.rules).flat().map((rule) => ({ ...rule,
  ...(rule.kind === 'temperature' && manualRoomTarget !== null ? { desiredTemperature: manualRoomTarget,
    savedDesiredTemperature: rule.desiredTemperature, targetSource: 'manual', hasSchedule: true, nestTarget: 24 } : {}),
  paused: pausedRules.has(rule.id), phase: !rule.enabled ? 'disabled' : pausedRules.has(rule.id) ? 'paused' : 'active',
  reason: !rule.enabled ? 'Rule is disabled.' : pausedRules.has(rule.id) ? 'Paused by you.' : 'Automatic rule is running.',
  ...(rule.kind === 'temperature' && feedbackFixture ? feedbackFixture : {}) })) });
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
    if (route === '/api/config/stage' && request.method === 'POST') {
      if (conflict || body.revision !== String(revision)) { json(409, { error: 'Configuration changed elsewhere.' }); return; }
      const blocks = structuredClone(body.blocks);
      const oldDevices = Array.isArray(blocks[0].devices) ? blocks[0].devices : Object.entries(blocks[0].devices || {}).map(([serialNumber, options]) => ({ serialNumber, ...options }));
      Object.assign(blocks[0], { name: config.name, options: config.options, dashboardTemperatureUnit: config.temperatureUnit,
        devices: config.devices.map((device) => ({ ...oldDevices.find((old) => old.serialNumber === device.serialNumber), ...device })), climateRuleDrafts: config.rules });
      const file = path.join(output, 'fixture-config.json');
      await fs.writeFile(file, JSON.stringify({ platforms: blocks }));
      const store = new WebDashboardConfig(file, blocks[0], { knownDevices: () => ['T1', 'T2'] });
      try { json(200, await store.stage({ revision: (await store.snapshot()).revision, config: body.config })); }
      catch (error) { json(error.status || 400, { error: error.message }); }
      return;
    }
    if (route === '/api/native-save' && request.method === 'POST') {
      config = structuredClone(body.config); revision++; json(200, envelope()); return;
    }
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
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
      const asset = await fs.readFile(path.join(publicRoot, name));
      // Model the global theme rules included in Homebridge's custom-UI iframe.
      response.end(name === 'host.css' ? asset.toString() + '\n.homebridge-host { color: #000 !important; background: #fff !important; } .homebridge-host .sidebar { background: #c2155d; color: #eee; } .homebridge-host a { color: #c2155d; } .homebridge-host a:hover { color: #c2155d !important; }' : asset);
    } catch { response.writeHead(404).end(); }
    return;
  }
  let file; let name;
  if (route.startsWith('/shared/') && ['climate-utils.js', 'time-zone-picker.js', 'sensor-preview.js', 'fan-speed.js', 'rule-window.js', 'connection-page.js', 'connection-config.js'].includes(route.slice(8))) { name = route.slice(8); file = path.join(publicRoot, name); }
  else { name = route === '/' ? 'index.html' : route.slice(1); if (!assets.has(name)) { response.writeHead(404).end(); return; } file = path.join(staticRoot, name); }
  response.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html; charset=utf-8');
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
    window.outerSave = true; window.schemaShown = false; window.configRevision = 'disk-1'; window.webAccounts = []; window.climateRequests = 0;
    window.savedBlocks = JSON.parse(sessionStorage.getItem('saved-blocks') || 'null') || (sessionStorage.getItem('first-install') ? [] : [{
      platform: 'NestClimateCntrl', accounts: [{ name: 'Home', type: 'google', authMethod: 'refreshToken', refreshToken: 'fixture-token' }],
      devices: { T1: { custom: 'keep' } }, custom: 'keep', rules: { temperature: [{ id: 'preserved' }] }, _bridge: { username: 'AA:BB:CC:DD:EE:FF' },
    }]);
    window.homebridge = {
      disableSaveButton() { window.outerSave = false; }, enableSaveButton() { window.outerSave = true; },
      showSchemaForm() { window.schemaShown = true; }, hideSchemaForm() { window.schemaShown = false; },
      updatePluginConfig: async (blocks) => { window.staged = blocks; },
      savePluginConfig: async () => { throw new Error('The embedded app must not save through the SDK'); },
      clickHomebridgeSave: async () => {
        if (!window.outerSave) throw new Error('Native Save is disabled');
        if (window.failSave) throw new Error('Fixture save failed');
        window.savedBlocks = structuredClone(window.staged); window.configRevision += '-saved';
        sessionStorage.setItem('saved-blocks', JSON.stringify(window.savedBlocks));
        if (window.stagedClimate) await fetch('/api/native-save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'fixture-csrf' }, body: JSON.stringify({ config: window.stagedClimate }) });
        window.restartPrompts = (window.restartPrompts || 0) + 1;
      },
      request: async (route, payload) => {
        if (route === '/plugin-config') return { revision: window.configRevision, blocks: structuredClone(window.savedBlocks) };
        if (route === '/setup/account-status') return { accountConfigured: sessionStorage.getItem('web-login') === 'true', username: 'admin' };
        if (route === '/setup/web-account') { window.webAccounts.push(payload); sessionStorage.setItem('web-login', 'true'); return {}; }
        if (route === '/web/status') {
          if (sessionStorage.getItem('runtime-inactive')) throw new Error('Fixture runtime inactive.');
          return { enabled: false, accountConfigured: false, instanceId: 'fixture-instance' };
        }
        if (route !== '/climate') throw new Error('Unexpected host route: ' + route);
        window.climateRequests++;
        if (sessionStorage.getItem('runtime-inactive')) throw new Error('Fixture runtime inactive.');
        const response = await fetch('/api' + payload.route, { method: payload.method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'fixture-csrf' },
          body: payload.body === undefined ? undefined : JSON.stringify(payload.route === '/config/stage' ? { ...payload.body, blocks: window.savedBlocks } : payload.body) });
        const body = await response.json();
        if (!response.ok) { const error = new Error(body.error); error.error = { status: response.status }; throw error; }
        if (payload.route === '/config/stage') { body.revision = window.configRevision; window.stagedClimate = body.restartRequired ? payload.body.config : null; }
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
  await checkCompactNavigation(page, output, 'embedded-desktop');
  await page.emulateMedia({ colorScheme: 'dark' });
  await checkCompactNavigation(page, output, 'embedded-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkCompactNavigation(page, output, 'embedded-mobile');
  await page.setViewportSize({ width: 1280, height: 1000 });
  assert.equal(await page.locator('#sign-out').isVisible(), false);
  assert.equal(await page.evaluate(() => window.outerSave), false);
  assert.equal(await page.locator('#connection-setup').count(), 0);
  await navigate(page, 'Settings');
  await page.locator('#pause-on-restart').check();
  await page.getByRole('switch', { name: 'Show climate rule temperature in Apple Home', exact: false }).first().check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-bar').hidden);
  assert.equal(config.options.pauseOnRestart, true);
  assert.equal(config.devices[0].homeKitRoomTemperature, true);
  // Restart-required edits stage automatically; the plugin never writes them before native Save.
  const priorSaves = saves.length;
  const humidity = page.getByRole('switch', { name: 'Separate humidity sensor', exact: false }).first();
  await humidity.uncheck();
  await page.waitForFunction(() => window.outerSave);
  assert.equal(config.devices[0].humiditySensor, true);
  assert.equal(saves.length, priorSaves);
  assert.equal(await page.locator('#save').isVisible(), false);
  assert.match(await page.locator('#save-detail').textContent(), /Homebridge’s Save button/);
  await page.screenshot({ path: path.join(output, 'native-save-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'native-save-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await humidity.check();
  await page.waitForFunction(() => !window.outerSave && !document.querySelector('#save').disabled);
  await humidity.uncheck();
  await page.waitForFunction(() => window.outerSave);
  await page.evaluate(() => window.homebridge.clickHomebridgeSave());
  assert.equal(await page.evaluate(() => window.restartPrompts), 1);
  assert.equal(config.devices[0].humiditySensor, false);
  assert.equal(saves.length, priorSaves);
  await page.reload();
  await page.getByRole('heading', { name: 'Your thermostats', exact: true }).waitFor();
  await navigate(page, 'Climate rules');
  await page.getByRole('switch', { name: 'Pause after a manual Nest target change', exact: false }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-bar').hidden);
  assert.equal(config.rules.temperature[0].manualTargetBehavior, 'pause');
  const beforeFeedbackCommands = commands.length;
  feedbackFixture = { enabled: true, phase: 'paused', paused: true, desiredTemperature: 22.22222222,
    nestTarget: 19, nestUpdatedAt: Date.now() - 1800000,
    reason: 'Nest feedback did not confirm the heating target within two minutes.',
    lastAction: { at: Date.now() - 120000, value: 22.22222222, message: 'Heating target accepted; awaiting device feedback.' } };
  await page.locator('#refresh-status').click();
  await page.waitForFunction(() => document.querySelector('#rule-runtime')?.textContent.includes('Reported Nest target: 19'));
  assert.match(await page.locator('#rule-runtime').textContent(), /Last requested Nest target: 22\.2/);
  assert.match(await page.locator('#rule-runtime').textContent(), /Last Nest device update:/);
  assert.equal((await page.locator('#rule-runtime').textContent()).includes('awaiting device feedback'), false);
  feedbackFixture.nestTarget = 22;
  feedbackFixture.lastAction.status = 'unconfirmed';
  feedbackFixture.lastAction.message = 'Heating command accepted, but its target was not confirmed. Automatic control is paused.';
  await page.locator('#refresh-status').click();
  await page.waitForFunction(() => document.querySelector('#rule-runtime')?.textContent.includes('Reported Nest target: 22'));
  assert.equal(commands.length, beforeFeedbackCommands, 'Status checks never send temperature commands');
  await page.screenshot({ path: path.join(output, 'temperature-feedback-paused.png'), fullPage: true });
  feedbackFixture = null;
  await page.locator('#refresh-status').click();
  await page.locator('[data-kind="fan"]').click();
  await page.getByText('Set rule priority', { exact: false }).waitFor();
  await page.locator('[data-kind="presence"]').click();
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).waitFor();
  await checkRuleWindows(page, output, 'embedded', () => config);
  await navigate(page, 'Accounts & web access');
  await page.getByRole('heading', { name: 'Nest & Google accounts', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.schemaShown || window.outerSave), false);
  await page.getByRole('switch', { name: 'Enable standalone web dashboard', exact: true }).check();
  await page.getByLabel('Web password', { exact: true }).fill('fixture-password');
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'accounts-desktop.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: path.join(output, 'accounts-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'accounts-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole('button', { name: 'Save web login', exact: true }).click();
  await page.waitForFunction(() => window.outerSave);
  assert.equal(await page.evaluate(() => window.webAccounts.length), 1);
  assert.equal(await page.getByLabel('Web password', { exact: true }).inputValue(), '');
  assert.equal(await page.evaluate(() => window.savedBlocks[0].webDashboard?.enabled === true), false);
  await page.evaluate(() => window.homebridge.clickHomebridgeSave());
  assert.equal(await page.evaluate(() => window.savedBlocks[0].devices[0].custom), 'keep');
  assert.equal(await page.evaluate(() => window.savedBlocks[0].rules.temperature[0].id), 'preserved');
  assert.equal(await page.evaluate(() => window.savedBlocks[0]._bridge.username), 'AA:BB:CC:DD:EE:FF');
  assert.equal(await page.evaluate(() => JSON.stringify(window.savedBlocks).includes('fixture-password')), false);
  await page.reload();
  await navigate(page, 'Accounts & web access');
  await page.getByLabel('Web password', { exact: true }).fill('fixture-replacement');
  await page.getByRole('button', { name: 'Save web login', exact: true }).click();
  await page.getByText('Web login saved. No bridge restart is needed.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.outerSave), false);
  await page.evaluate(() => { window.configRevision = 'disk-conflict'; });
  await page.getByLabel('Account name', { exact: true }).fill('Edited account');
  await page.getByText('Configuration changed elsewhere.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Account name', { exact: true }).inputValue(), 'Edited account');
  assert.equal(await page.evaluate(() => window.savedBlocks[0].accounts[0].name), 'Home');
  assert.equal(await page.evaluate(() => window.outerSave), false);
  await page.reload();
  await navigate(page, 'Settings');
  conflict = true;
  await page.locator('#dashboard-name').fill('A conflicting edit');
  await page.getByText('Configuration changed elsewhere.', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.outerSave), false);
  assert.equal(config.name, 'A little more comfort.');
  conflict = false;
  // An asset failure must keep connection setup available without claiming the package is missing.
  await page.route('**/climate/markup.js', (route) => route.fulfill({ status: 503, body: 'Fixture asset unavailable.' }));
  await page.reload();
  await page.getByText('Climate controls could not load.', { exact: false }).waitFor();
  assert.equal(await page.locator('#host-notice').textContent().then((message) => /missing|reinstall/i.test(message)), false);
  await page.locator('#setup-fallback').click();
  assert.equal(await page.evaluate(() => window.schemaShown && window.outerSave), true);
  await page.unroute('**/climate/markup.js');
  // Configured users still land on Overview during an outage, with account setup available in the menu.
  statusAvailable = false;
  await page.evaluate(() => sessionStorage.setItem('runtime-inactive', 'true'));
  await page.reload();
  await page.locator('#page-overview').waitFor();
  assert.equal(new URL(page.url()).hash, '#overview');
  await navigate(page, 'Accounts & web access');
  await page.getByLabel('Account name', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.schemaShown || window.outerSave), false);
  // First install has no running bridge and never asks it for climate data before account setup.
  await page.evaluate(() => { sessionStorage.removeItem('saved-blocks'); sessionStorage.removeItem('web-login'); sessionStorage.setItem('first-install', 'true'); });
  await page.reload();
  await page.getByRole('heading', { name: 'Connect your home', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#accounts');
  assert.equal(await page.getByRole('switch', { name: 'Enable standalone web dashboard', exact: true }).isChecked(), false);
  await page.locator('#refresh-status').click();
  assert.equal(await page.evaluate(() => window.climateRequests), 0);
  await page.screenshot({ path: path.join(output, 'accounts-first-install.png'), fullPage: true });
  await page.getByLabel('Account name', { exact: true }).fill('My Nest home');
  await page.getByLabel('Account type', { exact: true }).selectOption('nest');
  await page.getByLabel('Nest access token', { exact: true }).fill('fixture-access-token');
  await page.waitForFunction(() => window.outerSave);
  assert.equal(await page.evaluate(() => window.savedBlocks.length), 0);
  await page.evaluate(() => { window.failSave = true; });
  assert.match(await page.evaluate(() => window.homebridge.clickHomebridgeSave().catch((error) => error.message)), /Fixture save failed/);
  assert.equal(await page.getByLabel('Account name', { exact: true }).inputValue(), 'My Nest home');
  assert.equal(await page.evaluate(() => window.savedBlocks.length), 0);
  await page.evaluate(() => { window.failSave = false; });
  await page.evaluate(() => window.homebridge.clickHomebridgeSave());
  assert.equal(await page.evaluate(() => window.savedBlocks[0].webDashboard.enabled), false);
  assert.equal(await page.evaluate(() => window.webAccounts.length), 0);
  await page.reload();
  await page.locator('#page-overview').waitFor();
  assert.equal(new URL(page.url()).hash, '#overview');
  await navigate(page, 'Accounts & web access');
  await page.getByRole('switch', { name: 'Enable standalone web dashboard', exact: true }).check();
  await page.getByLabel('Web password', { exact: true }).fill('fixture-first-login');
  await page.getByRole('button', { name: 'Save web login', exact: true }).click();
  await page.waitForFunction(() => window.outerSave);
  await page.evaluate(() => window.homebridge.clickHomebridgeSave());
  assert.equal(await page.evaluate(() => window.webAccounts.length), 1);
  assert.deepEqual(errors, []);
  console.log('Homebridge shared climate UI: restricted assets, load failure, settings, rules, persistence, conflicts, setup and offline access passed.');
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}

