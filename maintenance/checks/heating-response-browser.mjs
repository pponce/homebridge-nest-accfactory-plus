// Real local dashboard/API with synthetic thermostat data; no equipment or cloud access.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebDashboard } from '../../src/web-dashboard.js';
import { ClimateAutomation } from '../../src/climate-automation.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.REVIEW_OUTPUT_DIR || path.join(project, 'maintenance/review/heating');
await fs.mkdir(output, { recursive: true });
const storage = await fs.mkdtemp(path.join(output, 'fixture-'));
const configPath = path.join(storage, 'config.json');
const rule = { id: 'rooms', name: 'Living room balance', kind: 'temperature', thermostatId: 'T', sourceIds: ['nest:T'],
  desiredTemperature: 21, maximumOffset: 1.5, minimumIntervalMinutes: 5, enabled: false, aggregation: 'average', targetIds: [] };
const block = { platform: 'NestClimateCntrl', webDashboard: { enabled: true, protocol: 'http', host: '127.0.0.1' },
  devices: [{ serialNumber: 'T' }], climateRuleDrafts: { temperature: [rule], occupancy: [], fans: [] } };
await fs.writeFile(configPath, JSON.stringify({ platforms: [block] }));
const commands = [];
const device = { id: 'T', serial: 'T', account: 'A', type: 'Thermostat', data: { description: 'Living room', online: true,
  physical_temperature: 21, current_temperature: 21, target_temperature_low: 22, hvac_state: 'off', hvac_mode: 'heat',
  eco_mode: false, active_rcs_sensor: '', can_heat: true, schedules: {} } };
const dashboard = { devices: new Map([['T', device]]), snapshot: () => ({ generatedAt: Date.now(), devices: [device],
  accounts: [{ id: 'A', authorised: true, observing: true }], automation: engine?.snapshot() }),
  control: async (payload) => { commands.push(payload); return {}; }, setAutomationTarget: async (...args) => commands.push(args) };
const server = new WebDashboard({ storage, configPath, platformConfig: block, dashboard,
  accessFactory: () => ({ start: async () => {}, refresh: async () => ({ sources: [], bridges: [] }), close() {} }) });
let engine;
let browser;
try {
  await server.setupAccount({ username: 'admin', password: 'fixture-password' });
  server.options.port = 0;
  await server.start();
  server.options.port = server.server.address().port;
  engine = new ClimateAutomation({ directory: server.directory, dashboard, config: server.config });
  await engine.start({ schedule: false });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.options.port + '/#settings');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.getByRole('heading', { name: 'Heating response & tuning', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Apply to this rule', exact: true }).count(), 0);
  await page.getByLabel('Heating type', { exact: true }).selectOption('radiantFloor');
  await page.getByRole('switch', { name: 'Observe heating response locally' }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.locator('#save-bar').waitFor({ state: 'hidden' });
  const starting = page.getByRole('region', { name: 'Starting recommendation' });
  const apply = starting.getByRole('button', { name: 'Apply to this rule' });
  await apply.waitFor();
  assert.match(await starting.innerText(), /30 min/);
  assert.match(await starting.innerText(), /0.5°C/);
  let saved = await server.config.snapshot();
  assert.equal(saved.config.rules.temperature[0].minimumIntervalMinutes, 5);
  assert.equal(saved.restartRequired, false);
  await page.getByLabel('Dashboard name', { exact: true }).fill('Unsaved name');
  assert.equal(await apply.isDisabled(), true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await apply.click();
  await page.getByText('Heating recommendation applied', { exact: true }).waitFor();
  saved = await server.config.snapshot();
  assert.deepEqual(saved.config.rules.temperature[0], { ...rule, minimumIntervalMinutes: 30, maximumOffset: 0.5 });
  assert.equal(commands.length, 0);

  // Feed complete cycles through the production observer to exercise learned guidance in the UI.
  const observer = engine.heatingResponse;
  let clock = Date.now() - 3 * 86400000;
  observer.now = () => clock;
  const current = saved.config.rules.temperature;
  const devices = saved.config.devices;
  const sample = (at, room, heating) => { clock = at; observer.observe(current, devices,
    new Map([['rooms', { valid: true, room, physical: room + 1, target: 22, heating }]])); };
  const begin = clock;
  for (let day = 0; day < 3; day++) {
    for (let cycle = 0; cycle < 2; cycle++) {
      const start = begin + day * 86400000 + cycle * 7200000;
      sample(start, 20, false);
      for (let i = 1; i <= 30; i++) sample(start + i * 60000, 20 + (i - 1) * 0.04, true);
      for (let i = 31; i <= 55; i++) sample(start + i * 60000, 21.2 + Math.min(0.12, (i - 31) * 0.04), false);
    }
  }
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  const learned = page.getByRole('region', { name: 'Learned recommendation' });
  await learned.waitFor();
  assert.match(await learned.innerText(), /Moderate confidence/);
  assert.match(await page.locator('.heating-evidence').innerText(), /Response delay/);
  await page.getByLabel('Temperature units', { exact: true }).selectOption('F');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.locator('#save-bar').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.heating-suggestion')?.textContent.includes('0.9°F'));
  assert.match(await learned.innerText(), /0.45°F/);
  const type = page.getByLabel('Heating type', { exact: true });
  await type.focus();
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/heating-response'),
    page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
  ]);
  await page.waitForFunction(() => !document.getElementById('refresh-status').disabled);
  assert.equal(await type.evaluate((element) => element === document.activeElement), true);
  await page.waitForFunction(() => document.getElementById('toast').hidden);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: path.join(output, 'heating-response-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'heating-response-mobile.png'), fullPage: true });
  assert.equal(commands.length, 0);
  assert.deepEqual(errors, []);
  process.stdout.write('Heating settings, explicit Apply, learned evidence, Fahrenheit, focus and mobile layout passed.\n');
} finally {
  await browser?.close();
  await engine?.stop();
  await server.stop();
  await fs.rm(storage, { recursive: true, force: true });
}
