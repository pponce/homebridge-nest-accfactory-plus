// Browser-only thermostat feedback fixtures; no physical devices are contacted.
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkTemperatureEditor(browser, base, output) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; const writes = [];
  let source = 'room'; let desired = 22; let heat = 24; let cool = 27; let mode = 'heat';
  let unit = 'C'; let reject = false; let unavailable = false; let disconnected = false; let drop = false;
  let stage = 'room target';
  const model = () => unavailable ? { available: false, reason: 'Turn Eco off to change the temperature.' } : {
    available: true, source, mode, ruleId: source === 'room' ? 'rooms' : undefined, ruleName: 'Upstairs Zone',
    expected: JSON.stringify([source, mode, source === 'room' ? desired : [heat, cool]]), minimum: 9, maximum: 32,
    minimumGap: mode === 'range' ? 1.5 : 0,
    note: source === 'room' ? 'The selected sensors stay active.' : 'The climate rule is paused. This changes Nest directly and leaves the rule paused.',
    fields: source === 'room' ? [{ key: 'value', label: 'Desired room temperature', value: desired }] :
      mode === 'range' ? [{ key: 'target_temperature_low', label: 'Heat to', value: heat }, { key: 'target_temperature_high', label: 'Cool to', value: cool }] :
        [{ key: mode === 'cool' ? 'target_temperature_high' : 'target_temperature_low', label: mode === 'cool' ? 'Cool to' : 'Heat to', value: mode === 'cool' ? cool : heat }],
  };
  const responseFor = (endpoint) => {
    if (endpoint === '/session') return { authenticated: true, username: 'fixture', csrfToken: 'fixture' };
    if (endpoint === '/config') return { revision: '1', config: { temperatureUnit: unit, options: {}, devices: [], rules: { temperature: [], fans: [], occupancy: [] } }, accounts: [], web: {} };
    if (endpoint === '/heating-response') return { revision: '1', rules: [] };
    if (endpoint === '/sources') return { sources: [], bridges: [] };
    if (endpoint === '/status') return { generatedAt: Date.now(), accounts: [{ id: 'A', authorised: true, observing: true }],
      devices: [{ serial: 'T', id: 'T', account: 'A', type: 'Thermostat', temperatureTarget: model(), lastUpdate: Date.now(),
        data: { description: 'Dining room', model: 'Learning Thermostat (3rd gen)', online: true, current_temperature: 23, current_humidity: 60,
          target_temperature: mode === 'cool' ? cool : heat, target_temperature_low: heat, target_temperature_high: cool,
          hvac_mode: mode, hvac_state: 'off', eco_mode: unavailable, active_rcs_sensor: '' } }],
      automation: { available: true, rules: [{ id: 'rooms', kind: 'temperature', thermostatId: 'T', name: 'Upstairs Zone', enabled: true,
        paused: source !== 'room', temperatureControl: source === 'room' ? 'interval' : 'paused', desiredTemperature: desired }] } };
    throw new Error('Unexpected fixture endpoint: ' + endpoint);
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: Date.now() });
  await page.route(base + '/api/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.slice(4);
    if (endpoint === '/temperature-target') {
      const request = route.request().postDataJSON(); writes.push(request);
      if (drop) { await route.abort('failed'); return; }
      if (!reject && source === 'room') desired = request.values.value;
      await route.fulfill({ status: reject ? 409 : 200, contentType: 'application/json',
        body: JSON.stringify(reject ? { error: 'Temperature control changed.' } : { accepted: true, source }) });
      return;
    }
    await route.fulfill({ status: endpoint === '/status' && disconnected ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(endpoint === '/status' && disconnected ? { error: 'Connection unavailable.' } : responseFor(endpoint)) });
  });
  const edit = () => page.locator('.target-edit-button');
  const form = () => page.locator('.target-editor');
  const refresh = async () => {
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('refresh-status').disabled);
  };
  const apply = async () => {
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/temperature-target')),
      form().getByRole('button', { name: 'Apply', exact: true }).click()]);
  };
  try {
    await page.goto(base); await edit().waitFor();
    assert.match(await edit().innerText(), /22.0°C.*Desired room/s);
    assert.match(await page.locator('.adjusted-target').innerText(), /24.0°C/);
    await edit().click();
    await form().getByRole('button', { name: 'Increase desired room temperature' }).click();
    assert.equal(await form().getByLabel('Desired room temperature (°C)', { exact: true }).inputValue(), '22.5');
    await refresh();
    assert.equal(await form().getByLabel('Desired room temperature (°C)', { exact: true }).inputValue(), '22.5', 'polling preserves edits');
    await page.screenshot({ path: path.join(output, 'temperature-room-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await apply();
    await page.waitForFunction(() => !document.querySelector('.target-editor'));
    await page.clock.runFor(2100);
    assert.equal(desired, 22.5);
    assert.equal(writes[0].values.value, 22.5);
    assert.equal(heat, 24, 'desired room edit does not write the adjusted Nest target');
    await edit().click();
    await form().getByLabel('Desired room temperature (°C)', { exact: true }).fill('25');
    await form().getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(writes.length, 1, 'Cancel sends nothing');

    stage = 'stale controller';
    await edit().click(); source = 'nest'; await refresh();
    assert.equal(await form().getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true);
    await form().getByRole('button', { name: 'Cancel', exact: true }).click();
    stage = 'native optimistic confirmation';
    await edit().click(); await form().getByLabel('Heat to (°C)', { exact: true }).fill('25'); await apply();
    assert.match(await edit().innerText(), /25.0°C/);
    assert.match(await page.locator('.target-feedback').innerText(), /Waiting for Nest/);
    await refresh(); assert.match(await edit().innerText(), /25.0°C/);
    heat = 25; await page.clock.runFor(2100);
    await page.locator('.target-feedback').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.target-feedback').count(), 0);
    stage = 'rejected command';
    reject = true; await edit().click(); await form().getByLabel('Heat to (°C)', { exact: true }).fill('26'); await apply();
    await page.getByText(/Temperature change could not be confirmed/).waitFor();
    assert.match(await edit().innerText(), /25.0°C/); reject = false;
    await page.locator('.target-feedback').getByRole('button', { name: 'Dismiss' }).click();
    stage = 'timeout';
    await edit().click(); await form().getByLabel('Heat to (°C)', { exact: true }).fill('26'); await apply();
    const count = writes.length; await page.clock.runFor(30100);
    await page.getByText(/within 30 seconds/).waitFor();
    assert.match(await edit().innerText(), /25.0°C/); assert.equal(writes.length, count);
    heat = 26; await refresh(); assert.equal(await page.locator('.target-feedback').count(), 0);
    stage = 'cancel confirmation';
    await edit().click(); await form().getByLabel('Heat to (°C)', { exact: true }).fill('27'); await apply();
    await page.getByRole('button', { name: 'Stop waiting', exact: true }).click();
    assert.match(await edit().innerText(), /26.0°C/);
    stage = 'lost response';
    drop = true; await edit().click(); await form().getByLabel('Heat to (°C)', { exact: true }).fill('27');
    await form().getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByText(/Connection interrupted/).waitFor(); drop = false; heat = 27;
    await page.clock.runFor(2100); await page.locator('.target-feedback').waitFor({ state: 'detached' });
    stage = 'range validation';
    mode = 'range'; heat = 21; cool = 25; await refresh(); await edit().click();
    await form().getByLabel('Heat to (°C)', { exact: true }).fill('24.5');
    assert.equal(await form().getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true);
    await form().getByLabel('Heat to (°C)', { exact: true }).fill('22'); await apply();
    assert.deepEqual(writes.at(-1).values, { target_temperature_low: 22, target_temperature_high: 25 });
    heat = 22; await page.clock.runFor(2100);
    stage = 'Fahrenheit and cool';
    unit = 'F'; mode = 'cool'; cool = 25; await page.reload(); await edit().waitFor(); await edit().click();
    await form().getByRole('button', { name: 'Increase cool to' }).click();
    assert.equal(await form().getByLabel('Cool to (°F)', { exact: true }).inputValue(), '78');
    await apply(); assert.ok(Math.abs(writes.at(-1).values.target_temperature_high - 25.5555555556) < 1e-8);
    await page.getByRole('button', { name: 'Stop waiting', exact: true }).click();
    unavailable = true; await refresh(); assert.equal(await edit().isDisabled(), true);
    unavailable = false; disconnected = true; await refresh(); assert.equal(await edit().isDisabled(), true);
    disconnected = false;
    await page.setViewportSize({ width: 1440, height: 1000 }); source = 'room'; mode = 'heat';
    await refresh(); await edit().click(); await page.screenshot({ path: path.join(output, 'temperature-room-desktop.png'), fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: path.join(output, 'temperature-room-dark.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Temperature editor: room/native targets, C/F, range validation, polling drafts, stale controller, confirmation, timeout, rejection, lost response, cancellation and mobile layout passed.');
  } catch (error) { throw new Error('Temperature editor [' + stage + ']: ' + error.message.replaceAll('\n', ' ') + ' ' + JSON.stringify({ actual: error.actual, expected: error.expected }), { cause: error }); }
  finally { await page.close(); }

  // The Homebridge host renders the shared overview without temperature command controls.
  const embedded = await browser.newPage();
  try {
    await embedded.addInitScript(() => { window.climateHost = { initialConfigured: true, loadSetup: async () => ({ configured: true, blocks: [], revision: 'fixture' }), connect() {}, request: (route) => fetch('/api' + route).then((r) => r.json()) }; });
    await embedded.route(base + '/api/**', async (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(responseFor(new URL(route.request().url()).pathname.slice(4))) }));
    await embedded.goto(base); await embedded.locator('.thermostat-card').waitFor();
    assert.equal(await embedded.locator('.target-edit-button, .target-editor').count(), 0);
  } finally { await embedded.close(); }
}
