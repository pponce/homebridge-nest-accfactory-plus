// Synthetic browser feedback only; these checks never contact physical thermostats.
import assert from 'node:assert/strict';
import path from 'node:path';
import { navigate } from './dashboard-navigation.mjs';

export async function checkScheduleOverview(browser, base, output) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; const writes = [];
  let mode = 'heat'; let control = 'interval'; let eco = false; let offline = false;
  const rule = () => ({ id: 'rooms', kind: 'temperature', name: 'Living room average', thermostatId: 'T1',
    enabled: true, temperatureControl: control, desiredTemperature: 21, roomTemperature: 20.5 });
  const responseFor = (endpoint) => {
    if (endpoint === '/session') return { authenticated: true, username: 'fixture', csrfToken: 'fixture' };
    if (endpoint === '/config') return { revision: '1', config: { temperatureUnit: 'F', options: {}, devices: [],
      rules: { temperature: [], fans: [], occupancy: [] } }, accounts: [], web: {} };
    if (endpoint === '/sources') return { sources: [], bridges: [] };
    if (endpoint === '/heating-response') return { revision: '1', rules: [] };
    if (endpoint === '/status') return { generatedAt: Date.now(), accounts: [{ id: 'A', authorised: true, observing: true }],
      automation: { available: true, rules: [rule()] }, devices: ['T1', 'T2'].map((serial, index) => ({
        serial, id: serial, type: 'Thermostat', account: 'A', lastUpdate: Date.now(), runtime: [], data: {
          description: index ? 'Upstairs' : 'Living room', online: true, hvac_mode: mode, hvac_state: 'off', eco_mode: eco,
          active_rcs_sensor: '', current_temperature: 21, physical_temperature: 21, target_temperature: 22,
          schedule_time_zone: 'America/Los_Angeles', schedules: {
            0: { morning: { time: 24300, 'temp-min': 20.5, 'temp-max': 32 } },
            3: { evening: { time: 73800, 'temp-min': 20.5, 'temp-max': 32 } },
            4: { morning: { time: 25200, 'temp-min': 19, 'temp-max': 32 } },
          },
        },
      })) };
    throw new Error('Unexpected schedule fixture endpoint: ' + endpoint);
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-11-13T00:00:00Z') });
  await page.route(base + '/api/**', async (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    const endpoint = new URL(route.request().url()).pathname.slice(4);
    await route.fulfill({ status: offline && endpoint === '/status' ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(offline && endpoint === '/status' ? { error: 'Fixture offline.' } : responseFor(endpoint)) });
  });
  const refresh = async () => {
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('refresh-status').disabled);
  };
  try {
    await page.goto(base);
    await page.locator('#schedule-thermostat').getByText('Living room', { exact: true }).waitFor();
    assert.equal(await page.locator('#schedule-mode').innerText(), 'Heat mode');
    assert.match(await page.locator('#schedule-preview').innerText(), /Thu · 20:30[\s\S]*Fri · 07:00[\s\S]*Mon · 06:45/);
    assert.match(await page.locator('#schedule-preview').innerText(), /Heat 68.9°F/);
    assert.doesNotMatch(await page.locator('#schedule-preview').innerText(), /Cool|89.6/);
    assert.match(await page.locator('#schedule-control').innerText(), /Living room average[\s\S]*Active · between updates/);
    assert.match(await page.locator('#schedule-control').innerText(), /confirmed Nest heating target becomes its desired room temperature/);
    await page.locator('.schedule-panel').screenshot({ path: path.join(output, 'schedule-active-desktop.png') });
    await page.locator('#runtime-device').selectOption('T2');
    assert.equal(await page.locator('#schedule-thermostat').innerText(), 'Upstairs');
    assert.match(await page.locator('#schedule-control').innerText(), /built-in temperature sensor/);
    assert.doesNotMatch(await page.locator('#schedule-control').innerText(), /Living room average/);
    await refresh();
    assert.equal(await page.locator('#runtime-device').inputValue(), 'T2', 'Refresh preserves the selected thermostat');
    await page.locator('#runtime-device').selectOption('T1');
    control = 'paused'; await refresh();
    assert.match(await page.locator('#schedule-control').innerText(), /Climate rules inactive[\s\S]*Living room average · Paused/);
    for (const current of ['cool', 'range', 'off']) {
      mode = current; await refresh();
      const text = await page.locator('#schedule-preview').innerText();
      if (current === 'cool') {
        assert.match(text, /Cool 89.6°F/); assert.doesNotMatch(text, /Heat 68.9/);
      } else if (current === 'range') {
        assert.match(text, /Heat 68.9°F[\s\S]*Cool 89.6°F/);
      } else {
        assert.equal(text, ''); assert.match(await page.locator('#schedule-next').innerText(), /thermostat is off/);
      }
    }
    mode = 'heat'; eco = true; await refresh();
    assert.match(await page.locator('#schedule-mode').innerText(), /Eco on/);
    assert.match(await page.locator('#schedule-control').innerText(), /Eco can prevent/);
    eco = false; control = 'interval'; await refresh();
    const help = page.getByRole('button', { name: 'Help for Nest temperature schedule', exact: true });
    await help.focus(); await page.getByRole('tooltip').waitFor();
    assert.match(await page.getByRole('tooltip').innerText(), /Built-in sensor only[\s\S]*Active climate temperature rule/);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    assert.equal(await help.evaluate((node) => node === document.activeElement), true);
    await help.hover(); await page.getByRole('tooltip').waitFor();
    await page.locator('#schedule-thermostat').click();
    assert.equal(await page.getByRole('tooltip').count(), 0);
    assert.equal(await page.locator('#save-bar').isVisible(), false);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('.schedule-panel').screenshot({ path: path.join(output, 'schedule-active-mobile-dark.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await help.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    await help.click(); await page.getByRole('tooltip').waitFor();
    const tip = await page.getByRole('tooltip').boundingBox();
    assert.ok(tip.x >= 0 && tip.x + tip.width <= 360 && tip.y >= 0 && tip.y + tip.height <= 800);
    await page.screenshot({ path: path.join(output, 'schedule-help-mobile-dark.png') });
    await help.click();
    assert.equal(await page.getByRole('tooltip').count(), 0);
    assert.equal(await page.locator('#page-overview #download-sensor-diagnostics').count(), 0);
    await navigate(page, 'Settings', true);
    await page.getByRole('heading', { name: 'Diagnostics & troubleshooting', exact: true }).waitFor();
    await page.getByText('Diagnose Nest sensor selection', { exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download sensor diagnostics', exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^nest-sensor-diagnostics-\d+\.json$/);
    await page.locator('[aria-labelledby="diagnostics-heading"]').screenshot({ path: path.join(output, 'diagnostics-settings-mobile.png') });
    await navigate(page, 'Overview', true);
    offline = true; await refresh();
    assert.match(await page.locator('#schedule-mode').innerText(), /Last reported/);
    assert.match(await page.locator('#schedule-control').innerText(), /Control status unavailable/);
    assert.deepEqual(writes, [], 'Reading schedules, help and diagnostics never writes to a thermostat or configuration');
    assert.deepEqual(errors, []);
    console.log('PASS schedule overview: thermostat scope, modes, upcoming order, rule impact, help, mobile, offline and Settings diagnostics');
  } finally {
    await page.close();
  }
}
