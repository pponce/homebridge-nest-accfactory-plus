import { checkRuleWindows } from './dashboard-rule-windows.mjs';
import { checkScheduleOverview } from './dashboard-schedule.mjs';
// Browser fixture only. No Nest, Homebridge or other real device requests are made.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkSourceRefresh } from './dashboard-source-refresh.mjs';
import { checkEcoFeedback } from './dashboard-eco-feedback.mjs';
import { checkTemperatureEditor } from './dashboard-temperature-editor.mjs';
import { navigate, checkCompactNavigation } from './dashboard-navigation.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.REVIEW_OUTPUT_DIR || path.join(project, 'maintenance/review/dashboard-web');
const staticRoot = path.join(project, 'homebridge-ui/dashboard');
const publicRoot = path.join(project, 'homebridge-ui/public');
const csrf = 'fixture-csrf';
let authenticated = false;
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light' });
  const errors = []; const cspErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /Content Security Policy|Refused to/.test(message.text())) cspErrors.push(message.text()); });
  const capture = async (name) => {
    await page.waitForFunction(() => document.getElementById('toast').hidden);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.waitForFunction(() => window.scrollY === 0);
    await page.screenshot({ path: path.join(output, name), fullPage: true });
  };
  const checkTextContrast = async () => {
    const results = await page.evaluate(() => {
      const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const contrast = (text, background) => {
        const first = luminance(text); const second = luminance(background);
        return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
      };
      const checks = [];
      for (const status of ['neutral', 'good', 'heating', 'warn', 'cooling']) {
        const badge = document.createElement('span'); badge.className = 'status-pill ' + status; document.body.append(badge);
        const style = getComputedStyle(badge);
        checks.push({ name: status + ' status', ratio: contrast(style.color, style.backgroundColor) }); badge.remove();
      }
      for (const [selector, backgroundSelector] of [
        ['.welcome-card p', '.welcome-card'], ['.welcome-card .eyebrow', '.welcome-card'],
        ['.login-copy p', '.login-intro'], ['.login-copy .eyebrow', '.login-intro'], ['.login-footer', '.login-intro'],
      ]) {
        const text = getComputedStyle(document.querySelector(selector));
        const background = getComputedStyle(document.querySelector(backgroundSelector));
        const colors = background.backgroundImage.match(/rgba?\([^)]+\)/g) || [background.backgroundColor];
        checks.push({ name: selector, ratio: Math.min(...colors.map((color) => contrast(text.color, color))) });
      }
      return checks;
    });
    for (const result of results) assert.ok(result.ratio >= 4.5, result.name + ' text contrast must reach 4.5:1; received ' + result.ratio.toFixed(2));
  };
  const base = 'http://127.0.0.1:' + server.address().port;
  await checkScheduleOverview(browser, base, output);
  await checkSourceRefresh(browser, base);
  await checkEcoFeedback(browser, base);
  await checkTemperatureEditor(browser, base, output);
  await page.goto(base);
  await page.getByRole('heading', { name: 'Welcome home.' }).waitFor();
  assert.equal(await page.locator('#http-login-warning').isVisible(), true);
  await capture('login-desktop.png');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await page.getByText('Connected', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Living room', exact: true }).waitFor();
  await checkTextContrast();
  assert.equal(await page.locator('#http-session-warning').isVisible(), true);
  const securePage = await browser.newPage();
  await securePage.route('https://climate.example.test/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: base + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await securePage.goto('https://climate.example.test/');
  await securePage.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await securePage.locator('#http-login-warning').isVisible(), false);
  assert.equal(await securePage.locator('#http-session-warning').isVisible(), false);
  await securePage.close();
  assert.equal(await page.locator('#climate-sidebar').isVisible(), true);
  assert.equal(await page.locator('#climate-menu-toggle').isVisible(), false);
  await capture('overview-desktop.png');
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.getByLabel('Turn Eco on for Living room').isEnabled(), true);
  await navigate(page, 'Settings', true);
  assert.equal(await page.getByLabel('Default HVAC fan duration').inputValue(), '1h');
  assert.equal(await page.getByRole('switch', { name: 'Show climate rule temperature in Apple Home', exact: false }).first().isChecked(), false);
  await navigate(page, 'Climate rules', false);
  assert.equal(await page.getByRole('switch', { name: 'Pause after a manual Nest target change', exact: false }).isChecked(), false);
  const help = page.getByRole('button', { name: 'Help for Desired room temperature (°C)', exact: true });
  const tooltip = page.getByRole('tooltip');
  await help.hover(); await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /selected rooms to reach/);
  await tooltip.hover();
  await page.waitForTimeout(200);
  assert.equal(await tooltip.isVisible(), true, 'Help remains open while reading its content');
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  await help.focus(); await tooltip.waitFor();
  assert.equal(await page.getByLabel('Desired room temperature (°C)', { exact: true }).getAttribute('aria-describedby'), await tooltip.getAttribute('id'));
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  assert.equal(await help.evaluate((node) => node === document.activeElement), true, 'Escape keeps keyboard focus');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Desired room temperature (°C)', { exact: true }).evaluate((node) => node === document.activeElement), true);
  await page.getByRole('button', { name: 'Help for Enable automatic execution', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).isChecked(), false, 'Help cannot toggle execution');
  assert.equal(await page.locator('#save-bar').isVisible(), false, 'Reading help leaves the draft unchanged');
  await page.getByRole('button', { name: 'Help for Maximum target adjustment (°C)', exact: true }).click();
  assert.equal(await tooltip.count(), 1, 'Only one tooltip is shown');
  assert.match(await tooltip.innerText(), /±1.5°C/);
  await capture('rule-help-desktop.png');
  await page.getByLabel('Rule name', { exact: true }).click(); await tooltip.waitFor({ state: 'hidden' });
  const phone = await browser.newPage({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  await phone.goto(base + '/#rules');
  const phoneHelp = phone.getByRole('button', { name: 'Help for Desired room temperature (°C)', exact: true });
  await phoneHelp.tap(); await phone.getByRole('tooltip').waitFor();
  const tipBounds = await phone.getByRole('tooltip').boundingBox();
  const helpBounds = await phoneHelp.boundingBox();
  assert.ok(tipBounds.x >= 0 && tipBounds.x + tipBounds.width <= 360 && tipBounds.y >= 0 && tipBounds.y + tipBounds.height <= 800, 'Phone help fits the viewport');
  assert.ok(helpBounds.width >= 44 && helpBounds.height >= 44, 'Phone help has a touch-sized target');
  await phone.screenshot({ path: path.join(output, 'rule-help-mobile-dark.png') });
  await phoneHelp.tap(); await phone.getByRole('tooltip').waitFor({ state: 'hidden' });
  await phoneHelp.tap(); await phone.getByRole('tooltip').waitFor();
  await phone.getByLabel('Rule name', { exact: true }).tap(); await phone.getByRole('tooltip').waitFor({ state: 'hidden' });
  assert.equal(await phone.locator('#save-bar').isVisible(), false, 'Touch help leaves the draft unchanged');
  await phone.close();
  await navigate(page, 'Settings', true);
  await page.getByRole('switch', { name: 'Show climate rule temperature in Apple Home', exact: false }).first().check();
  assert.equal(await page.getByRole('switch', { name: 'Show climate rule temperature in Apple Home', exact: false }).nth(1).isChecked(), false, 'each thermostat keeps its own setting');
  await navigate(page, 'Climate rules', false);
  await page.getByLabel('Rule name', { exact: true }).fill('Downstairs balance');
  await page.getByLabel('Desired room temperature (°C)', { exact: true }).fill('22');
  await page.getByRole('switch', { name: 'Pause after a manual Nest target change', exact: false }).check();
  await page.getByLabel('Office sensor', { exact: false }).check();
  await page.getByText('2 sources · desired 22.0°C.', { exact: false }).waitFor();
  await capture('rules-desktop.png');
  assert.equal(commands.length, 0, 'Rule previews must never call live commands');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Saved. Check execution status for running rules and any required setup. Disabled rules remain drafts.', { exact: true }).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].config.rules.temperature[0].desiredTemperature, 22);
  assert.equal(saves[0].config.rules.temperature[0].manualTargetBehavior, 'pause');
  assert.equal(saves[0].config.rules.temperature[0].enabled, false);
  assert.equal(saves[0].config.devices[0].fanDuration, '1h');
  assert.equal(saves[0].config.devices[0].homeKitRoomTemperature, true);
  assert.equal(saves[0].config.devices[0].scheduleTimeZone, 'America/Los_Angeles');
  assert.equal(commands.length, 0);
  manualRoomTarget = 23;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.locator('#rule-runtime').getByText('Desired room temperature: 23.0°C · Reported Nest target: 24.0°C', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Desired room temperature (°C)', { exact: true }).inputValue(), '22', 'runtime targets never rewrite the saved editor value');
  assert.equal(await page.getByRole('switch', { name: 'Pause after a manual Nest target change', exact: false }).isChecked(), true);
  manualRoomTarget = null;
  await page.getByRole('tab', { name: 'Home & away', exact: false }).click();
  await page.getByRole('button', { name: 'Help for Motion hold (minutes)', exact: true }).click();
  assert.match(await tooltip.innerText(), /Further detections extend the hold/);
  await page.getByText('Home condition met now', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Room fans', exact: false }).click();
  await tooltip.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Help for Turn-off gap (°C)', exact: true }).click();
  assert.match(await tooltip.innerText(), /23.0°C or below/);
  await page.keyboard.press('Escape');
  await page.getByText('Run condition not met', { exact: true }).waitFor();
  assert.equal(commands.length, 0);
  conflict = true;
  await page.getByLabel('Rule name', { exact: true }).fill('A concurrent edit');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('The configuration changed elsewhere.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'A concurrent edit');
  assert.equal(saves.length, 1);
  conflict = false;
  const dialogs = [];
  page.on('dialog', (dialog) => { dialogs.push(dialog.type()); dialog.dismiss(); });
  const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(await confirmation.getByRole('button', { name: 'Keep editing' }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await confirmation.getByRole('button', { name: 'Discard changes' }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await confirmation.evaluate((node) => node.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Discard', exact: true }).evaluate((node) => node === document.activeElement), true);
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'A concurrent edit');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Keep editing' }).click();
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'A concurrent edit');
  assert.equal(saves.length, 1);
  await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep rule' }).click();
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'A concurrent edit');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep editing' }).click();
  assert.equal(await page.locator('#app').isVisible(), true);
  await page.route('**/api/config', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture read unavailable.' }) }), { times: 1 });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByText('Fixture read unavailable.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'A concurrent edit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(await confirmation.evaluate((node) => node.getBoundingClientRect().right <= innerWidth && node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: path.join(output, 'discard-dialog-mobile.png'), fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(dialogs, [], 'Dashboard actions use in-page confirmations');
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Pause rule', exact: true }).waitFor();
  assert.equal(saves.at(-1).config.rules.fans[0].enabled, true);
  await page.getByRole('button', { name: 'Pause rule', exact: true }).click();
  await page.getByRole('button', { name: 'Resume automatic control', exact: true }).waitFor();
  assert.deepEqual(ruleActions.at(-1), { id: 'fan-1', action: 'pause' });
  await page.getByRole('button', { name: 'Resume automatic control', exact: true }).click();
  await page.getByRole('button', { name: 'Pause rule', exact: true }).waitFor();
  assert.deepEqual(ruleActions.at(-1), { id: 'fan-1', action: 'resume' });

  const rulesBeforeUnits = structuredClone(config.rules);
  await navigate(page, 'Settings', true);
  await page.getByLabel('Temperature units', { exact: false }).selectOption('F');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.equal(config.temperatureUnit, 'F');
  assert.deepEqual(config.rules, rulesBeforeUnits, 'Changing only units must preserve all rule values');
  await page.reload();
  await page.getByText('Connected', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Temperature units', { exact: false }).inputValue(), 'F');
  await navigate(page, 'Overview', true);
  await page.getByLabel('Current temperature 70.7°F', { exact: true }).waitFor();
  assert.match(await page.locator('#schedule-preview').innerText(), /69.8°F/);
  await navigate(page, 'Sensors & fans', true);
  await page.locator('#source-list').getByText('68.2°F', { exact: true }).waitFor();
  await navigate(page, 'Climate rules', false);
  await page.getByRole('tab', { name: 'Temperature', exact: false }).click();
  assert.equal(await page.getByLabel('Desired room temperature (°F)', { exact: true }).inputValue(), '71.6');
  assert.equal(await page.getByLabel('Maximum target adjustment (°F)', { exact: true }).inputValue(), '2.7');
  await page.getByLabel('Rule name', { exact: true }).fill('Fahrenheit group');
  await page.getByLabel('Desired room temperature (°F)', { exact: true }).fill('96');
  const beforeInvalid = saves.length;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.equal(await page.getByLabel('Desired room temperature (°F)', { exact: true }).evaluate((input) => input.validity.valid), false);
  assert.equal(saves.length, beforeInvalid, 'Out-of-range Fahrenheit input must block saving');
  await page.getByLabel('Desired room temperature (°F)', { exact: true }).fill('70.5');
  await page.getByLabel('Maximum target adjustment (°F)', { exact: true }).fill('1.8');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.ok(Math.abs(config.rules.temperature[0].desiredTemperature - (70.5 - 32) / 1.8) < 1e-9);
  assert.equal(config.rules.temperature[0].maximumOffset, 1);
  await page.getByRole('tab', { name: 'Room fans', exact: false }).click();
  assert.equal(await page.getByLabel('Above temperature (°F)', { exact: true }).inputValue(), '75.2');
  assert.equal(await page.getByLabel('Turn-off gap (°F)', { exact: true }).inputValue(), '1.8');
  await page.getByLabel('Above temperature (°F)', { exact: true }).fill('77');
  await page.getByLabel('Turn-off gap (°F)', { exact: true }).fill('3.6');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.equal(config.rules.fans[0].threshold, 25);
  assert.equal(config.rules.fans[0].hysteresis, 2);
  const rulesAfterEditing = structuredClone(config.rules);
  await navigate(page, 'Settings', true);
  await page.getByLabel('Temperature units', { exact: false }).selectOption('C');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.equal(await page.getByLabel('Temperature units', { exact: false }).inputValue(), 'F');
  await page.getByLabel('Temperature units', { exact: false }).selectOption('C');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.deepEqual(config.rules, rulesAfterEditing, 'Unit round trips must not rewrite fractional Celsius values');
  await navigate(page, 'Climate rules', false);
  await page.getByRole('tab', { name: 'Room fans', exact: false }).click();
  assert.equal(await page.getByLabel('Above temperature (°C)', { exact: true }).inputValue(), '25');
  assert.equal(await page.getByLabel('Turn-off gap (°C)', { exact: true }).inputValue(), '2');
  assert.equal(commands.length, 0, 'Dashboard unit preferences must never send Nest commands');
  await navigate(page, 'Overview', true);
  await Promise.all([page.waitForResponse((response) => response.url().endsWith('/api/command')), page.getByLabel('Turn Eco on for Living room').click()]);
  await page.getByLabel('Turn Eco off for Living room', { exact: true }).waitFor();
  assert.deepEqual(commands[0], { serial: 'T1', action: 'eco', value: true });
  ecoEnabled = false;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByLabel('Turn Eco on for Living room', { exact: true }).waitFor();
  await page.getByLabel('Temperature controlled by for Living room', { exact: true }).click();
  assert.match(await page.locator('.temperature-controller').first().innerText(), /Bedroom sensor/);
  assert.equal(await page.locator('.temperature-controller select, .temperature-controller button').count(), 0);
  assert.equal(commands.length, 1, 'Controller information must never send a sensor command');
  statusAvailable = false;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByText('Fixture bridge unavailable.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Turn Eco on for Living room').isDisabled(), true);
  statusAvailable = true;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByText('Connected', { exact: true }).waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await checkCompactNavigation(page, output, 'mobile');
  await page.locator('#climate-menu-toggle').click();
  assert.equal(await page.locator('#sign-out').isVisible(), true, 'Mobile menu retains sign out');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => !document.body.classList.contains('compact-navigation'));
  assert.equal(await page.locator('#climate-sidebar').isVisible(), true);
  assert.equal(await page.locator('#climate-menu-toggle').isVisible(), false);
  assert.equal(await page.locator('#navigation a').count(), 5);
  await navigate(page, 'Accounts & web access');
  assert.equal(await page.locator('#connection-form').count(), 0, 'Standalone web access must not expose credential editors');
  await page.getByText('Manage Nest/Google credentials and web access in Homebridge', { exact: false }).waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForFunction(() => document.body.classList.contains('compact-navigation'));
  assert.equal(await page.locator('#climate-menu-panel').isVisible(), false);
  for (const [name, pageName] of [['Overview', 'overview'], ['Sensors & fans', 'sources'], ['Climate rules', 'rules'], ['Settings', 'settings']]) {
    await navigate(page, name, pageName !== 'rules');
    if (pageName === 'overview') {
      const firstControl = await page.getByLabel('Turn Eco on for Living room').boundingBox();
      assert.ok(firstControl.y + firstControl.height <= page.viewportSize().height, 'First thermostat controls must be visible without scrolling on a phone');
    }
    if (pageName === 'rules') {
      await page.getByLabel('Rule name', { exact: true }).fill('Cooler evenings upstairs');
      await page.setViewportSize({ width: 1440, height: 1000 });
      assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'Cooler evenings upstairs');
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'Cooler evenings upstairs');
      assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isVisible(), true);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, pageName + ' must fit at 360px');
    const undersizedTargets = await page.locator('button.icon-button').evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden').map((button) => ({ name: button.getAttribute('aria-label'), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })).filter((button) => button.width < 44 || button.height < 44));
    assert.deepEqual(undersizedTargets, [], pageName + ' phone icon buttons must have 44px hit targets');
    const bottomContentVisible = await page.evaluate(() => {
      document.activeElement?.blur(); window.scrollTo(0, document.documentElement.scrollHeight);
      const bottom = document.querySelector('[data-section]:not([hidden])').getBoundingClientRect().bottom;
      const saveBar = document.getElementById('save-bar');
      const unobscuredBottom = saveBar.hidden ? innerHeight : saveBar.getBoundingClientRect().top;
      return bottom <= unobscuredBottom;
    });
    assert.equal(bottomContentVisible, true, pageName + ' final content must clear navigation and the save bar');
    await capture(pageName + '-mobile.png');
    if (pageName === 'rules') {
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('save-bar').hidden);
    }
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await navigate(page, 'Overview', true);
  await checkTextContrast();
  await capture('overview-mobile-dark.png');
  await checkCompactNavigation(page, output, 'mobile-dark');
  const manifest = await (await page.request.get(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  for (const asset of ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) assert.equal((await page.request.get(base + '/' + asset)).status(), 200);
  const apple = await (await page.request.get(base + '/apple-touch-icon.png')).body();
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
  await navigate(page, 'Climate rules', false);
  await page.locator('[data-kind="presence"]').click();
  const nestInput = page.locator('.pick-source').filter({ hasText: 'Nest Home/Away' });
  assert.equal(await nestInput.count(), 1);
  assert.equal(await nestInput.locator('input').isChecked(), true);
  assert.equal(await page.locator('.pick-source').filter({ hasText: 'Combined output' }).count(), 0);
  assert.ok(config.rules.occupancy[0].sourceIds.includes('nest-home-copy'));
  await nestInput.locator('input').uncheck();
  await nestInput.locator('input').check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.ok(config.rules.occupancy[0].sourceIds.includes('nest:home-away'));
  assert.equal(config.rules.occupancy[0].sourceIds.includes('nest-home-copy'), false);
  await checkRuleWindows(page, output, 'standalone', () => config);
  assert.deepEqual(errors, []);
  assert.deepEqual(cspErrors, []);
  console.log('PASS standalone dashboard: login, live controls, preview isolation, opt-in execution, pause/resume, durable config payload, preserved custom durations, revision conflicts, offline controls, 360px layout, mobile save workflow, text contrast, phone hit targets, dark mode, CSP, iOS icons');
  console.log('Screenshots:', output);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}



