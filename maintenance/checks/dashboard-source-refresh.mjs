// Browser regression fixtures use only mocked climate APIs and a controllable clock.
import assert from 'node:assert/strict';

export async function checkSourceRefresh(browser, base) {
  const page = await browser.newPage();
  let now = Date.now();
  let sourceReads = 0;
  let statusReads = 0;
  let failure = false;
  let temperature = 20;
  let hold;
  const writes = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const config = { name: 'Fixture', options: {}, devices: [], rules: {
    temperature: [{ id: 'group', kind: 'temperature', name: 'Room group', enabled: false,
      thermostatId: 'T', sourceIds: ['room'], aggregation: 'average', desiredTemperature: 22 }],
    fans: [], occupancy: [],
  } };
  await page.clock.install({ time: now });
  await page.route(base + '/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    let body = {};
    let status = 200;
    if (request.method() !== 'GET') writes.push(endpoint);
    if (endpoint === '/api/session') body = { authenticated: true, username: 'fixture', csrfToken: 'fixture' };
    else if (endpoint === '/api/heating-response') body = { revision: '1', rules: [] };
    else if (endpoint === '/api/config') body = { revision: '1', config, accounts: [], web: {} };
    else if (endpoint === '/api/status') {
      statusReads++;
      body = { generatedAt: now, accounts: [{ id: 'A', authorised: true, observing: true }], devices: [
        { serial: 'T', id: 'T', type: 'Thermostat', account: 'A', data: { description: 'Thermostat', online: true,
          physical_temperature: 21, current_temperature: 21, hvac_mode: 'heat', hvac_state: 'off', eco_mode: false, active_rcs_sensor: '' } },
      ] };
    } else if (endpoint === '/api/sources') {
      sourceReads++;
      if (hold) await hold;
      status = failure ? 503 : 200;
      body = failure ? { error: 'Fixture source disconnected.' } : { bridges: [], sources: [
        { id: 'room', name: 'Room fan temperature', kind: 'temperature', provider: 'homebridge', bridgeName: 'Fans',
          available: true, temperature, lastReadAt: now, measuredAt: null },
      ] };
    } else if (endpoint === '/api/logout') body = { authenticated: false };
    else throw new Error('Unexpected fixture request: ' + endpoint);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const row = page.locator('.pick-source').filter({ hasText: 'Room fan temperature' });
  const reading = row.locator('.pick-reading');
  const waitReading = async (value) => {
    await page.waitForFunction((expected) => [...document.querySelectorAll('.pick-source')]
      .some((node) => node.textContent.includes('Room fan temperature') && node.querySelector('.pick-reading').textContent === expected), value);
  };
  const advance = async (milliseconds) => { now += milliseconds; await page.clock.runFor(milliseconds); };
  const idle = async () => page.waitForFunction(() => !document.getElementById('refresh-status').disabled && !document.getElementById('refresh-sources').disabled);
  try {
    await page.goto(base + '/#rules');
    await waitReading('20.0°C');
    await idle();
    const target = page.getByRole('spinbutton', { name: 'Desired room temperature (°C)', exact: true });
    const search = page.getByRole('searchbox', { name: 'Find rule inputs' });
    await target.fill('23.5');
    await search.fill('Room fan');
    await row.getByRole('checkbox').uncheck();
    await row.getByRole('checkbox').check();
    await target.focus();
    const targetNode = await target.elementHandle();
    const checkboxNode = await row.getByRole('checkbox').elementHandle();
    const readsBefore = sourceReads;
    for (let cycle = 1; cycle <= 4; cycle++) {
      temperature = 20 + cycle;
      await advance(30000);
      await waitReading(temperature.toFixed(1) + '°C');
      await idle();
      assert.equal(await targetNode.evaluate((node) => node.isConnected && document.activeElement === node), true);
      assert.equal(await target.inputValue(), '23.5');
      assert.equal(await search.inputValue(), 'Room fan');
      assert.equal(await checkboxNode.evaluate((node) => node.isConnected && node.checked), true);
    }
    assert.equal(sourceReads, readsBefore + 4, 'visible dashboard polls external sources beyond the 90-second freshness window');
    assert.equal(await page.locator('#save-bar').isVisible(), true);

    failure = true;
    await advance(30000);
    await waitReading('Unavailable');
    await idle();
    assert.equal(await page.locator('#connection-state').textContent(), 'Connected', 'external failure does not invalidate Nest');
    failure = false;
    temperature = 25;
    await row.getByRole('checkbox').focus();
    await advance(30000);
    await waitReading('25.0°C');
    await idle();
    assert.equal(await checkboxNode.evaluate((node) => node.isConnected && document.activeElement === node), true);

    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenReads = [sourceReads, statusReads];
    await advance(120000);
    assert.deepEqual([sourceReads, statusReads], hiddenReads, 'background tabs do not poll');
    temperature = 26;
    await search.focus();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitReading('26.0°C');
    await idle();
    assert.equal(await search.evaluate((node) => document.activeElement === node), true);
    assert.equal(await search.inputValue(), 'Room fan');

    temperature = 27;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await waitReading('27.0°C');
    await idle();
    let release;
    hold = new Promise((resolve) => { release = resolve; });
    const heldReads = sourceReads;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    // Wait for the request without advancing the mocked timeout clock.
    for (let attempt = 0; sourceReads === heldReads && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sourceReads, heldReads + 1);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); document.getElementById('refresh-status').click(); });
    assert.equal(sourceReads, heldReads + 1, 'an in-flight read is not duplicated');
    release(); hold = undefined;
    await idle();

    assert.deepEqual(writes, [], 'refreshing never saves drafts or sends equipment commands');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard and sign out', exact: true }).click();
    await page.locator('#login-screen').waitFor({ state: 'visible' });
    const signedOutReads = [sourceReads, statusReads];
    await advance(60000);
    assert.deepEqual([sourceReads, statusReads], signedOutReads, 'signed-out dashboards do not poll');
    assert.deepEqual(errors, []);
    console.log('PASS source refresh: four polling cycles, draft and focus preservation, source failure/recovery, hidden-tab pause/resume, manual refresh, request deduplication, no writes and logout');
  } finally { await page.close(); }
}
