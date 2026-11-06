// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../../homebridge-ui/public/', import.meta.url);
const server = http.createServer(async (request, response) => {
  const name = request.url === '/' ? 'index.html' : request.url.slice(1);
  if (!['index.html', 'index.js', 'climate-utils.js', 'sensor-preview.js', 'room-preview.js', 'styles.css', 'nest-climate-cntrl-icon-512.png'].includes(name)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(await fs.readFile(new URL(name, root)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.saved = []; window.commands = []; window.available = true;
    const status = { accounts: [{ id: 'A', name: 'Google', authorised: true, observing: true }], devices: [
      { serial: 'T', id: 'THERMOSTAT', type: 'Thermostat', account: 'A', lastUpdate: Date.now(),
        data: { description: 'Living room', online: true, hvac_state: 'heating', hvac_mode: 'heat', current_temperature: 21, physical_temperature: 21,
          target_temperature: 22, temperature_scale: 'C', has_fan: true, eco_mode: false, linked_rcs_sensors: ['S'], active_rcs_sensor: '', schedules: {} }, runtime: [] },
      { serial: 'S', id: 'S', type: 'TemperatureSensor', account: 'A', data: { description: 'Bedroom', current_temperature: 20 } },
    ] };
    window.homebridge = {
      getPluginConfig: async () => [{ platform: 'NestClimateCntrl', accounts: [{ name: 'Google', type: 'google', refreshToken: 'fixture-secret', authMethod: 'refreshToken' }], devices: { T: { fanDuration: '30m', custom: 'preserved' } }, custom: 'untouched' }],
      updatePluginConfig: async (data) => window.saved.push(data),
      showSchemaForm: () => { window.schemaShown = true; },
      request: async (path, data) => {
        if (!window.available) { throw new Error('Fixture offline'); }
        if (path === '/sources') { return { bridges: [], sources: [{ id: 'external', provider: 'homebridge', kind: 'temperature', name: 'Office sensor', bridgeName: 'Rooms', available: true, temperature: 19, lastReadAt: Date.now(), measuredAt: null }] }; }
        if (path === '/status') { return structuredClone(status); }
        window.commands.push(data); return { accepted: true, message: 'Accepted' };
      },
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByText('Bridge connected', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Legacy refresh token', exact: true }).getAttribute('type'), 'password');
  await page.getByLabel('Eco switch in Apple Home').check();
  await page.waitForFunction(() => window.saved.length > 0);
  const config = await page.evaluate(() => window.saved.at(-1)[0]);
  assert.equal(config.devices[0].ecoSwitch, true);
  assert.equal(config.devices[0].custom, 'preserved');
  assert.equal(config.custom, 'untouched');
  assert.equal(config.accounts[0].refreshToken, 'fixture-secret');
  await page.getByRole('button', { name: 'Discover / refresh Homebridge sources' }).click();
  await page.getByLabel('Office sensor', { exact: false }).check();
  await page.getByText('Illustrative Nest target:', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.commands.length), 0);
  await page.getByLabel('Temperature controlled by').selectOption('S');
  await page.getByRole('button', { name: 'Use selected sensor' }).click();
  await page.waitForFunction(() => window.commands.length === 1);
  assert.deepEqual(await page.evaluate(() => window.commands[0]), { serial: 'T', action: 'sensor', value: 'S' });
  await page.evaluate(() => { window.available = false; });
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await page.getByText('Bridge unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Turn Eco on' }).isDisabled(), true);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByText('Advanced troubleshooting', { exact: true }).click();
  await page.getByRole('button', { name: 'Open full configuration form' }).click();
  assert.equal(await page.evaluate(() => window.schemaShown), true);
  assert.deepEqual(errors, []);
  console.log('PASS dashboard: masked credentials, preserved config, sensor command, stale-state controls, mobile layout, schema fallback');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
