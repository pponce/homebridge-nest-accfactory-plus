// Mocked Nest feedback only; never sends commands to physical equipment.
import assert from 'node:assert/strict';

export async function checkEcoFeedback(browser, base) {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  const writes = [];
  const reported = { T1: true, T2: true };
  let reject = false;
  let disconnected = false;
  let networkFailure = false;
  let commandHold;
  let statusReads = 0;
  let stage = 'initial request';
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: Date.now() });
  await page.route(base + '/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    let status = 200;
    let body = {};
    if (endpoint === '/api/session') body = { authenticated: true, username: 'fixture', csrfToken: 'fixture' };
    else if (endpoint === '/api/heating-response') body = { revision: '1', rules: [] };
    else if (endpoint === '/api/config') body = { revision: '1', config: { options: {}, devices: [], rules: { temperature: [], fans: [], occupancy: [] } }, accounts: [], web: {} };
    else if (endpoint === '/api/sources') body = { bridges: [], sources: [] };
    else if (endpoint === '/api/status') {
      statusReads++;
      status = disconnected ? 503 : 200;
      body = disconnected ? { error: 'Fixture connection unavailable.' } : {
        generatedAt: Date.now(), accounts: [{ id: 'A', authorised: true, observing: true }],
        devices: Object.entries(reported).map(([serial, eco]) => ({ serial, id: serial, type: 'Thermostat', account: 'A',
          data: { description: serial === 'T1' ? 'Dining room' : 'Bedroom', online: true, eco_mode: eco,
            hvac_mode: 'heat', hvac_state: 'off', current_temperature: 23, target_temperature: 21, active_rcs_sensor: '' } })),
      };
    } else if (endpoint === '/api/command') {
      writes.push(request.postDataJSON());
      if (commandHold) await commandHold;
      if (networkFailure) { await route.abort('failed'); return; }
      status = reject ? 503 : 200;
      body = reject ? { error: 'Fixture command rejected.' } : { accepted: true };
    } else if (endpoint === '/api/logout') body = { authenticated: false };
    else throw new Error('Unexpected Eco fixture endpoint: ' + endpoint);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const card = (name) => page.locator('.thermostat-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const dining = card('Dining room');
  const bedroom = card('Bedroom');
  const pending = (name, value) => page.getByRole('button', { name: 'Eco ' + (value ? 'on' : 'off') + ' requested for ' + name, exact: true });
  const toggle = (name, value) => page.getByRole('button', { name: 'Turn Eco ' + (value ? 'on' : 'off') + ' for ' + name, exact: true });
  const refresh = async () => {
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('refresh-status').disabled);
  };
  const send = async (name, value) => {
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/api/command')), toggle(name, value).click()]);
  };
  try {
    await page.goto(base);
    await toggle('Dining room', false).waitFor();
    await page.waitForFunction(() => !document.getElementById('refresh-sources').disabled);
    await send('Dining room', false);
    assert.equal(await pending('Dining room', false).isDisabled(), true);
    assert.equal(await pending('Dining room', false).getAttribute('aria-pressed'), 'false');
    assert.match(await dining.locator('.eco-feedback').innerText(), /Waiting for Nest/);
    assert.match(await dining.locator('.card-top > .status-pill').innerText(), /Eco off.*pending/);
    assert.equal(await toggle('Bedroom', false).isEnabled(), true, 'each thermostat keeps independent feedback');
    await refresh();
    assert.equal(await pending('Dining room', false).isDisabled(), true, 'old reported state cannot undo the requested display');
    assert.equal(writes.length, 1, 'polling and refresh never resend an Eco request');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'pending feedback fits a phone');

    stage = 'separate thermostats';
    await send('Bedroom', false);
    reported.T1 = false;
    await page.clock.runFor(2100);
    await toggle('Dining room', true).waitFor();
    assert.equal(await dining.locator('.eco-feedback').count(), 0);
    assert.equal(await pending('Bedroom', false).isDisabled(), true, 'one acknowledgement does not finish another thermostat');
    reported.T2 = false;
    await page.clock.runFor(2100);
    await toggle('Bedroom', true).waitFor();

    stage = 'rejected request';
    reject = true;
    await send('Dining room', true);
    await dining.getByText(/Fixture command rejected/).waitFor();
    assert.equal(await toggle('Dining room', true).isEnabled(), true);
    assert.equal(await toggle('Dining room', true).getAttribute('aria-pressed'), 'false');
    stage = 'timeout';
    reject = false;
    await send('Dining room', true);
    const sentBeforeTimeout = writes.length;
    await page.clock.runFor(30100);
    await dining.getByText(/within 30 seconds/).waitFor();
    assert.equal(await toggle('Dining room', true).getAttribute('aria-pressed'), 'false');
    assert.equal(writes.length, sentBeforeTimeout, 'timeout does not retry or undo a cloud command');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'timeout feedback fits a phone');
    stage = 'late confirmation';
    reported.T1 = true;
    await refresh();
    assert.equal(await toggle('Dining room', false).isEnabled(), true, 'late feedback is still displayed');
    assert.equal(await dining.locator('.eco-feedback').count(), 0);

    stage = 'disconnection';
    await send('Dining room', false);
    disconnected = true;
    await page.clock.runFor(2100);
    await page.getByText('Fixture connection unavailable.', { exact: true }).waitFor();
    assert.equal(await pending('Dining room', false).getAttribute('aria-pressed'), 'false');
    await page.clock.runFor(30100);
    await dining.getByText(/within 30 seconds/).waitFor();
    assert.equal(await toggle('Dining room', false).isDisabled(), true, 'an unavailable thermostat stays disabled after timeout');
    disconnected = false;
    await refresh();
    await page.getByRole('button', { name: 'Dismiss Eco update notice for Dining room' }).click();
    assert.equal(await dining.locator('.eco-feedback').count(), 0);

    stage = 'lost HTTP response';
    networkFailure = true;
    await toggle('Dining room', false).click();
    await dining.getByText(/Connection interrupted/).waitFor();
    networkFailure = false;
    reported.T1 = false;
    await page.clock.runFor(2100);
    await toggle('Dining room', true).waitFor();
    assert.equal(await dining.locator('.eco-feedback').count(), 0, 'a lost HTTP response can still be confirmed by Nest state');

    stage = 'logout';
    await page.setViewportSize({ width: 1440, height: 1100 });
    let release;
    commandHold = new Promise((resolve) => { release = resolve; });
    await toggle('Dining room', true).click();
    await pending('Dining room', true).waitFor();
    const sentBeforeLogout = writes.length;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('#login-screen').waitFor({ state: 'visible' });
    const readsBeforeLogout = statusReads;
    release(); commandHold = undefined;
    await page.clock.runFor(60000);
    assert.equal(statusReads, readsBeforeLogout, 'logout stops confirmation polling');
    assert.equal(writes.length, sentBeforeLogout);
    assert.equal(await page.locator('#app').isHidden(), true, 'late command acceptance cannot reopen the dashboard');
    assert.deepEqual(errors, []);
    console.log('PASS Eco feedback: optimistic display, stale reads, separate thermostats, delayed confirmation, rejection, timeout, late success, connection loss, mobile layout and logout');
  } catch (error) {
    throw new Error('Eco check ' + stage + ': ' + error.message.replace(/\s+/g, ' ').slice(0, 500), { cause: error });
  } finally { await page.close(); }
}
