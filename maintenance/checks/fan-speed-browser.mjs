// Real dashboard and persistence with synthetic room/fan feedback; no device access.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebDashboard } from '../../src/web-dashboard.js';
import { ClimateAutomation } from '../../src/climate-automation.js';
import { fanState, speedCapabilities } from '../../homebridge-ui/public/fan-speed.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.REVIEW_OUTPUT_DIR || path.join(project, 'maintenance/review/fan-speed');
await fs.mkdir(output, { recursive: true });
const storage = await fs.mkdtemp(path.join(output, 'fan-fixture-'));
const configPath = path.join(storage, 'config.json');
const rule = { id: 'fans', name: 'Living room comfort', kind: 'fan', enabled: false, sourceIds: ['room'], targetIds: ['fan'],
  action: 'temperature', threshold: 24, hysteresis: 1 };
const block = { platform: 'NestClimateCntrl', dashboardTemperatureUnit: 'F',
  webDashboard: { enabled: true, protocol: 'http', host: '127.0.0.1' },
  climateRuleDrafts: { temperature: [], occupancy: [], fans: [rule] } };
await fs.writeFile(configPath, JSON.stringify({ platforms: [block] }));
let temperature = (73 - 32) / 1.8;
const fan = { id: 'fan', name: 'Living room fan', kind: 'fan', available: true, canControl: true,
  running: false, speed: 100, canSetSpeed: true, speedAvailable: true,
  speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 }) };
const commands = [];
const access = { start: async () => {}, close() {}, refresh: async () => ({ bridges: [], sources: [
  { id: 'room', name: 'Living room temperature', kind: 'temperature', available: true, temperature, lastReadAt: Date.now() },
  { ...fan, lastReadAt: Date.now() },
  { id: 'fixed-fan', name: 'Fixed speed fan', kind: 'fan', available: true, canControl: true, running: false, lastReadAt: Date.now() },
] }),
setFanSpeed: async (id, speed, expected) => { assert.deepEqual(fanState(fan), expected); commands.push({ speed }); fan.speed = speed; },
setFan: async (id, running, expected) => { assert.deepEqual(fanState(fan), expected); commands.push({ running }); fan.running = running; } };
let engine;
const dashboard = { devices: new Map(), snapshot: () => ({ generatedAt: Date.now(), devices: [], accounts: [], automation: engine?.snapshot() }) };
const server = new WebDashboard({ storage, configPath, platformConfig: block, dashboard, accessFactory: () => access });
let browser;
try {
  await server.setupAccount({ username: 'admin', password: 'fixture-password' });
  server.options.port = 0; await server.start(); server.options.port = server.server.address().port;
  engine = new ClimateAutomation({ directory: server.directory, dashboard, config: server.config, accessFactory: () => access });
  await engine.start({ schedule: false });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.options.port + '/#rules');
  await page.getByLabel('Username').fill('admin'); await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.getByRole('tab', { name: /Room fans/ }).click();
  await page.getByLabel('Run condition').selectOption('temperature-speed');
  assert.equal(Number(await page.getByLabel('Comfort target (°F)', { exact: true }).inputValue()), 72);
  assert.equal(Number(await page.getByLabel('Start above target by (°F)', { exact: true }).inputValue()), 2);
  assert.equal(Number(await page.getByLabel('Stop above target by (°F)', { exact: true }).inputValue()), 0.5);
  assert.equal(Number(await page.getByLabel('Reach maximum speed above target by (°F)', { exact: true }).inputValue()), 6);
  assert.match(await page.locator('#fan-curve').innerText(), /74.0°F.*Start/s);
  assert.match(await page.locator('#fan-curve').innerText(), /76.0°F.*Halfway/s);
  assert.match(await page.locator('#fan-curve').innerText(), /78.0°F.*Maximum/s);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.equal(commands.length, 0, 'Disabled drafts send no commands');
  await page.getByRole('switch', { name: 'Enable automatic execution', exact: false }).check();
  await page.getByLabel('Stop above target by (°F)', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.match(await page.locator('#notice').innerText(), /stop gap must be smaller/);
  assert.equal(commands.length, 0);
  await page.getByLabel('Stop above target by (°F)', { exact: true }).fill('0.5');
  await page.getByLabel('Maximum fan speed (%)', { exact: true }).fill('70');
  assert.match(await page.locator('#fan-curve tbody tr').last().innerText(), /70%\s+50%/);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  const stored = (await server.config.snapshot()).config.rules.fans[0];
  assert.equal(stored.action, 'temperature-speed'); assert.equal(stored.maximumSpeed, 70);
  assert.ok(Math.abs(stored.desiredTemperature - (72 - 32) / 1.8) < 1e-6);
  assert.equal(commands.length, 0, '73F must not start the fan');
  temperature = (78 - 32) / 1.8;
  await engine.tick(); assert.deepEqual(commands, [{ speed: 50 }]);
  await engine.tick(); await engine.tick(); assert.deepEqual(commands.at(-1), { running: true });
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('rule-runtime').textContent.includes('current 50%'));
  await page.getByLabel('Rule name', { exact: true }).fill('Draft name stays');
  await page.getByLabel('Rule name', { exact: true }).focus();
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  assert.equal(await page.getByLabel('Rule name', { exact: true }).inputValue(), 'Draft name stays');
  assert.equal(await page.evaluate(() => document.activeElement.parentElement.textContent.startsWith('Rule name')), true);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  fan.speed = 25;
  await engine.tick(); assert.equal(engine.snapshot().rules[0].paused, true);
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByRole('button', { name: 'Resume automatic control', exact: true }).waitFor();
  const beforeUnits = (await server.config.snapshot()).config.rules;
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Temperature units', { exact: false }).selectOption('C');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('save-bar').hidden);
  assert.deepEqual((await server.config.snapshot()).config.rules, beforeUnits);
  await page.getByRole('link', { name: 'Climate rules', exact: true }).click();
  await page.getByRole('tab', { name: /Room fans/ }).click();
  assert.ok(Math.abs(Number(await page.getByLabel('Comfort target (°C)', { exact: true }).inputValue()) - (72 - 32) / 1.8) < 1e-6);
  await page.locator('.pick-source').filter({ hasText: 'Fixed speed fan' }).getByRole('checkbox').check();
  assert.match(await page.locator('#rule-preview').innerText(), /Speed control needs attention/);
  await page.screenshot({ path: path.join(output, 'fan-speed-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(output, 'fan-speed-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Fan speed browser checks passed: F/C settings, curve, caps, persistence, draft safety, manual override and mobile layout.');
} finally {
  await browser?.close(); await engine?.stop(); await server.stop(); await fs.rm(storage, { recursive: true, force: true });
}
