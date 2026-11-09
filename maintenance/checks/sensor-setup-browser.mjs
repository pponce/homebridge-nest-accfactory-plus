// Real dashboard UI with explicit synthetic API feedback; no thermostat access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sensorControlState } from '../../src/nest-sensor-control.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = new Map([
  ['/', ['homebridge-ui/dashboard/index.html', 'text/html']],
  ['/app.js', ['homebridge-ui/dashboard/app.js', 'text/javascript']],
  ['/styles.css', ['homebridge-ui/dashboard/styles.css', 'text/css']],
  ...['climate-utils', 'time-zone-picker', 'sensor-preview', 'fan-speed'].map((name) =>
    ['/shared/' + name + '.js', ['homebridge-ui/public/' + name + '.js', 'text/javascript']]),
]);
const rule = { id: 'mixed', name: 'Downstairs comfort', kind: 'temperature', enabled: false,
  thermostatId: 'T', sourceIds: ['nest:S', 'room'], targetIds: [], aggregation: 'average',
  desiredTemperature: 21, maximumOffset: 1.5, minimumIntervalMinutes: 5 };
let config = { name: 'Climate fixture', temperatureUnit: 'C', options: {}, devices: [],
  rules: { temperature: [structuredClone(rule)], fans: [], occupancy: [] } };
let revision = 1;
let phase = 'required';
let owned = false;
let rejectNext = false;
const requests = [];
const errors = [];
let diagnosticStates;
let failStatus = false;
const requestMethods = [];
const descriptions = {
  required: 'Prepare Nest before this mixed temperature group can control heating.',
  preparing: 'Waiting for fresh Nest feedback to confirm the built-in sensor and sensor hold.',
  held: 'Nest confirmed the built-in sensor and native sensor schedule hold.',
  restoring: 'Waiting for Nest to confirm restored native sensor settings.',
  unsupported: 'Automatic sensor setup is unavailable for this multi-sensor configuration. Review it in Nest.',
};
const setup = () => ({ mixed: true, phase, reason: descriptions[phase],
  canPrepare: phase === 'required' && config.rules.temperature[0]?.enabled === true,
  canRestore: phase === 'held', confirmation: 'confirmed-native-' + phase,
  thermostatId: 'T', thermostatName: 'Downstairs Nest' });
const automation = () => ({ available: true, pendingRestorations: 0,
  rules: config.rules.temperature.map((entry) => ({ ...entry, phase: entry.enabled ? 'waiting' : 'disabled',
    paused: true, reason: entry.enabled ? 'Waiting for sensor setup.' : 'Rule is disabled.', sensorSetup: setup() })),
  sensorSetups: owned ? [{ id: 'mixed', name: rule.name, ...setup() }] : [] });
const status = () => {
  const snapshot = { generatedAt: Date.now(), accounts: [{ id: 'A', authorised: true, observing: true }],
  devices: [{ id: 'T', serial: 'T', type: 'Thermostat', account: 'A', lastUpdate: Date.now(), data: {
    description: 'Downstairs Nest', model: 'Nest Learning Thermostat', online: true, hvac_mode: 'heat', hvac_state: 'off',
    eco_mode: false, current_temperature: 22, physical_temperature: 22, target_temperature: 21,
    active_rcs_sensor: phase === 'required' ? 'S' : '', linked_rcs_sensors: ['S'], schedules: {},
    native_sensor_control: { reported: true, supported: phase !== 'unsupported', source: phase === 'unsupported' ? 'unknown' : phase === 'required' ? 'remote' : 'thermostat' },
  } }, { id: 'S', serial: 'S', type: 'TemperatureSensor', account: 'A', lastUpdate: Date.now(),
    data: { description: 'Nest living room', current_temperature: 20, online: true } }], automation: automation() };
  if (diagnosticStates) {
    const template = snapshot.devices[0];
    snapshot.devices = diagnosticStates.map((settings, index) => ({ ...template, serial: 'PRIVATE-THERMOSTAT-' + index,
      data: { ...template.data, description: index ? 'Upstairs Nest' : 'Downstairs Nest', linked_rcs_sensors: ['PRIVATE-SENSOR-ID'],
        native_sensor_control: { ...sensorControlState(settings), privateExtra: 'PRIVATE-TOKEN', control: { secret: 'PRIVATE-CONTROL' } } } }));
    snapshot.devices.push({ ...template, type: 'TemperatureSensor', id: 'PRIVATE-SENSOR-ID', data: { description: 'Bedroom sensor' } });
  }
  return snapshot;
};
const envelope = () => ({ revision: String(revision), config: structuredClone(config), accounts: [], restartRequired: false });
const server = http.createServer(async (request, response) => {
  try {
    const entry = assets.get(new URL(request.url, 'http://localhost').pathname);
    if (!entry) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', entry[1]); response.end(await fs.readFile(path.join(root, entry[0])));
  } catch { response.writeHead(500).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    requestMethods.push(request.method());
    let body = {}; let code = 200;
    if (pathname === '/api/session') body = { authenticated: true, username: 'fixture', csrfToken: 'fixture-csrf' };
    else if (pathname === '/api/config') {
      if (request.method() === 'PUT') { config = structuredClone(request.postDataJSON().config); revision++; }
      body = envelope();
    } else if (pathname === '/api/status') {
      body = failStatus ? { error: 'Status unavailable' } : status(); code = failStatus ? 503 : 200;
    }
    else if (pathname === '/api/sources') body = { bridges: [], sources: [{ id: 'room', name: 'Dining room temperature', kind: 'temperature', available: true, temperature: 22, lastReadAt: Date.now() }] };
    else if (pathname === '/api/heating-response') body = { revision: String(revision), rules: [], devices: [] };
    else if (pathname === '/api/rules/command') {
      const payload = request.postDataJSON(); requests.push(payload);
      if (rejectNext) { rejectNext = false; code = 409; body = { error: 'Nest sensor settings changed. Refresh and review the new setup.' }; }
      else {
        if (payload.action === 'prepareSensors') { phase = 'preparing'; owned = true; }
        if (payload.action === 'restoreSensors') phase = 'restoring';
        body = automation();
      }
    } else { code = 404; body = { error: 'Unknown fixture endpoint' }; }
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/#rules');
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).waitFor();
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /saved sensor schedule is kept/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-cancel');
  await dialog.getByRole('button', { name: 'Keep current settings', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('confirm-dialog').open && document.getElementById('save').disabled);
  assert.equal(requests.length, 0, 'Cancelling setup must send no sensor command');
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  assert.equal(await dialog.isVisible(), false, 'Polling must not reopen the confirmation');
  await page.locator('#rule-runtime').getByRole('button', { name: 'Prepare Nest for group', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(requests.length, 0, 'Escape cancels without a sensor write');
  await page.getByRole('button', { name: 'Resume automatic control', exact: true }).click();
  await dialog.getByRole('button', { name: 'Prepare thermostat', exact: true }).click();
  await page.locator('#rule-runtime').getByText(descriptions.preparing, { exact: true }).waitFor();
  assert.deepEqual(requests, [{ id: 'mixed', action: 'prepareSensors', confirmation: 'confirmed-native-required' }]);
  assert.equal(await page.locator('#rule-runtime').getByRole('button', { name: 'Prepare Nest for group', exact: true }).count(), 0);
  phase = 'held';
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.locator('#rule-runtime').getByRole('button', { name: 'Restore Nest sensor settings', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep current settings', exact: true }).click();
  assert.equal(requests.length, 1, 'Cancelling restoration must send no command');
  await page.getByLabel('Rule name', { exact: true }).fill('Unsaved name');
  assert.equal(await page.locator('#rule-runtime').getByRole('button', { name: 'Restore Nest sensor settings', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).uncheck();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.equal(await dialog.isVisible(), false);
  await page.locator('#rule-runtime').getByRole('button', { name: 'Restore Nest sensor settings', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete rule', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.locator('#thermostats').getByRole('button', { name: 'Restore Nest sensor settings', exact: true }).click();
  assert.match(await dialog.innerText(), /heating target.*restored first/s);
  await dialog.getByRole('button', { name: 'Restore sensor settings', exact: true }).click();
  await page.locator('#thermostats').getByText(descriptions.restoring, { exact: true }).waitFor();
  assert.deepEqual(requests.at(-1), { id: 'mixed', action: 'restoreSensors', confirmation: 'confirmed-native-held' });
  config.rules.temperature = [{ ...rule, enabled: true }]; phase = 'unsupported'; owned = false;
  await page.goto('http://127.0.0.1:' + server.address().port + '/#rules'); await page.reload();
  await page.locator('#rule-runtime').getByText(descriptions.unsupported, { exact: true }).waitFor();
  assert.equal(await page.locator('#rule-runtime').getByRole('button', { name: 'Prepare Nest for group', exact: true }).count(), 0);
  assert.match(await page.locator('#rule-preview').innerText(), /confirmed built-in Nest temperature source/);
  phase = 'required'; rejectNext = true;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.locator('#rule-runtime').getByRole('button', { name: 'Prepare Nest for group', exact: true }).click();
  await dialog.getByRole('button', { name: 'Prepare thermostat', exact: true }).click();
  await page.locator('#notice').getByText('Nest sensor settings changed. Refresh and review the new setup.', { exact: true }).waitFor();
  assert.equal(requests.length, 3, 'A stale confirmation must not cause an automatic retry');

  const builtin = { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' };
  const remote = { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: 'PRIVATE-SENSOR-ID' } };
  const settings = { rcsControlMode: 'RCS_CONTROL_MODE_HOLD', activeRcsSelection: builtin,
    associatedRcsSensors: [{ deviceId: { resourceId: 'PRIVATE-SENSOR-ID' } }] };
  diagnosticStates = [{ ...settings, rcsControlMode: undefined },
    { ...settings, rcsControlMode: 'RCS_CONTROL_MODE_UNSPECIFIED', activeRcsSelection: remote }];
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  const downstairs = page.getByRole('combobox', { name: 'Temperature controlled by for Downstairs Nest', exact: true });
  const upstairs = page.getByRole('combobox', { name: 'Temperature controlled by for Upstairs Nest', exact: true });
  assert.equal(await downstairs.locator('option:checked').textContent(), 'Thermostat sensor');
  assert.equal(await upstairs.locator('option:checked').textContent(), 'Bedroom sensor');
  assert.equal(await downstairs.isDisabled(), true);
  assert.equal(await upstairs.isDisabled(), true);
  assert.match(await page.locator('#thermostats').innerText(), /has not reported its sensor scheduling mode/);
  assert.match(await page.locator('#thermostats').innerText(), /scheduling mode that automatic setup does not recognize/);
  await page.getByText('Diagnose Nest sensor selection', { exact: true }).click();
  const methodsBefore = requestMethods.length;
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sensor diagnostics', exact: true }).click();
  const download = await downloadPromise;
  const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString(); const report = JSON.parse(text);
  assert.match(download.suggestedFilename(), /^nest-sensor-diagnostics-\d+\.json$/);
  assert.equal(report.thermostats.length, 2);
  assert.deepEqual(report.thermostats.map((entry) => entry.currentSensor), ['Thermostat sensor', 'Bedroom sensor']);
  assert.deepEqual(report.thermostats.map((entry) => entry.checks.issues[0].code), ['mode_missing', 'mode_unknown']);
  assert.doesNotMatch(text, /PRIVATE-|fixture-csrf|resourceId|signature|rcsControlSchedule/);
  assert.ok(requestMethods.slice(methodsBefore).every((method) => method === 'GET'), 'Diagnostic download must only read status');
  diagnosticStates = [{ ...settings, associatedRcsSensors: undefined }, { ...settings, activeRcsSelection: undefined }];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  assert.equal(await downstairs.locator('option:checked').textContent(), 'Thermostat sensor');
  assert.equal(await upstairs.locator('option:checked').textContent(), 'Current sensor not reported');
  diagnosticStates = [settings, { ...settings, activeRcsSelection: remote, associatedRcsSensors: [] }];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  assert.equal(await downstairs.isDisabled(), false, 'Supported native selection remains usable');
  assert.equal(await upstairs.isDisabled(), true, 'An unassociated selection never enables writes');
  diagnosticStates = [{ ...settings, sensorSelection: {} }, { ...settings, multiSensorSettings: { multiSensorEnabled: true } }];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  assert.equal(await downstairs.locator('option:checked').textContent(), 'Current sensor not reported');
  assert.equal(await upstairs.locator('option:checked').textContent(), 'Current sensor not reported');
  diagnosticStates = [{ ...settings, rcsControlMode: undefined }, { ...settings, activeRcsSelection: remote, rcsControlMode: undefined }];
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const output = process.env.REVIEW_OUTPUT_DIR || path.join(root, 'maintenance/review/sensor-selection');
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'sensor-selection-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: path.join(output, 'sensor-selection-desktop.png'), fullPage: true });
  failStatus = true;
  await page.getByRole('button', { name: 'Download sensor diagnostics', exact: true }).click();
  await page.getByText('Refresh the dashboard connection before downloading sensor diagnostics.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Download sensor diagnostics', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Sensor setup browser checks passed: consent, restoration, independent sensor display, specific reasons, read-only diagnostic export, privacy, disconnected states and mobile layout.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
}
