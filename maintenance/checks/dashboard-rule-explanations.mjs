import assert from 'node:assert/strict';
import path from 'node:path';
import { navigate } from './dashboard-navigation.mjs';

export async function checkRuleExplanations(page, output, label) {
  let mode = 'hold';
  const requests = [];
  const record = (request) => { if (request.method() !== 'GET') requests.push(request.url()); };
  page.on('request', record);
  const handler = async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const now = Date.now();
    const evaluatedAt = mode === 'stale' ? now - 120000 : now;
    const sources = [25, 26].map((temperature, index) => ({ id: 'sensor-' + index,
      name: index ? 'Dining sensor' : 'Living sensor <script>', kind: 'temperature', available: true, temperature, lastReadAt: now }));
    const fan = { id: 'living-fan', name: 'Living room fan', available: true, running: true, speed: 50,
      lastReadAt: now, controllerId: 'fan-1', ownerId: 'fan-1', supportedSpeed: 50,
      pending: mode === 'pending', requested: { running: true, speed: 75 } };
    const thermostat = snapshot.devices.find((device) => device.type === 'Thermostat');
    if (thermostat) {
      thermostat.temperatureTarget = { available: true, source: 'native', mode: 'heat', fields: [] };
      let second = snapshot.devices.find((device) => device.type === 'Thermostat' && device !== thermostat);
      if (!second) {
        second = { ...structuredClone(thermostat), serial: 'T-ALIGN', id: 'alignment' };
        snapshot.devices.push(second);
      }
      second.data.description = 'Upstairs — Dining room with a longer thermostat name';
      second.temperatureTarget = { available: true, source: 'room', mode: 'heat', ruleId: 'alignment', desired: 21,
        reportedTarget: 19, fields: [{ key: 'value', value: 21, label: 'Desired room temperature' }] };
    }
    snapshot.automation = { available: true, rules: [
      { id: 'fan-1', kind: 'fan', name: 'Warm rooms', enabled: true, phase: 'active', reason: 'Run condition is met.',
        explanation: { evaluatedAt, sources, average: 25.5, fans: [fan],
          thermostat: {}, condition: { action: 'temperature', demand: true, threshold: 24, stopThreshold: 23 },
          speed: { mode: 'curve', comfort: 22, startsAt: 23, fullAt: 27, minimum: 25, maximum: 75, calculated: 56.25 } } },
      { id: 'fan-low', kind: 'fan', name: 'Heating fan', enabled: true, phase: 'standby', reason: 'A higher-priority rule controls the fan.',
        explanation: { evaluatedAt, sources: [], fans: [fan] } },
      { id: 'presence-1', kind: 'presence', name: 'Home presence', enabled: true,
        home: mode !== 'override', fault: mode === 'unavailable', phase: mode === 'override' ? 'override' : mode === 'away-delay' ? 'waiting' : 'active',
        reason: mode === 'away-delay' ? 'Waiting for the Away delay.' : 'Home condition is met.',
        explanation: { evaluatedAt,
          sources: [
            { id: 'motion', name: 'Hallway motion', kind: 'motion', available: mode !== 'unavailable',
              detected: mode === 'unavailable' ? null : false, effective: mode === 'unavailable' ? null : mode !== 'away-delay',
              lastDetectedAt: now - 300000, holdUntil: mode === 'away-delay' ? null : now + 300000, lastReadAt: now },
            { id: 'occupancy', name: 'Room occupancy', kind: 'occupancy', available: true, detected: false, effective: false, lastReadAt: now },
          ], presence: { logic: 'any', holdMinutes: 10, awayDelayMinutes: 20,
            awayAt: mode === 'away-delay' ? now + 900000 : null, awaySince: now - 300000,
            overrideUntil: mode === 'override' ? now + 3600000 : null } } },
      { id: 'temperature-1', kind: 'temperature', name: 'Living balance', thermostatId: 'T1', enabled: true,
        temperatureControl: 'interval', phase: 'waiting', reason: 'Waiting for the minimum heating-target update interval.',
        nestTarget: 23, lastAction: { value: 23, status: 'confirmed' },
        explanation: { evaluatedAt, sources, average: 25.5,
          heating: { desired: 22, physical: 27.5, rawOffset: 2, maximumOffset: 1.5, calculatedTarget: 23.5,
            targetSource: 'rule', minimumIntervalMinutes: 5, nextEligibleAt: now + 60000 } } },
    ] };
    if (mode.startsWith('mapped')) {
      const active = snapshot.automation.rules[0];
      Object.assign(active.explanation.speed, { minimum: 14, maximum: 60, calculated: 42.75 });
      fan.supportedSpeed = 42;
      if (mode === 'mapped-paused') { active.paused = true; fan.override = 'Manual fan change'; }
      if (mode === 'mapped-off') { fan.running = false; fan.controllerId = null; fan.ownerId = null; active.explanation.condition.demand = false; }
      if (mode === 'mapped-unknown') { active.explanation.average = null; fan.available = false; }
      if (mode === 'mapped-hot') active.explanation.average = 32;
    }
    if (mode === 'fixed-speed' || mode === 'last-speed') snapshot.automation.rules[0].explanation.speed.mode =
      mode === 'fixed-speed' ? 'fixed' : 'last';
    if (mode === 'recovering') {
      Object.assign(snapshot.automation.rules.find((rule) => rule.kind === 'temperature'), {
        temperatureControl: 'recovering', phase: 'recovering', targetSource: 'schedule',
        reason: 'Recovering scheduled heating feedback. Control will resume automatically after confirmation.',
        feedback: { kind: 'schedule', expected: 19, since: now - 180000, automaticRecovery: true,
          recovering: true, nextRefreshAt: now + 60000 },
      });
    }
    if (mode === 'no-presence') snapshot.automation.rules = snapshot.automation.rules.filter((rule) => rule.kind !== 'presence');
    if (mode === 'no-engine' || mode === 'no-rules') snapshot.automation = { available: mode === 'no-rules', rules: [] };
    await route.fulfill({ response, json: snapshot });
  };
  const sourceHandler = async (route) => {
    const response = await route.fetch(); const data = await response.json(); const now = Date.now();
    const living = data.sources.find((source) => source.id === 'living-fan');
    Object.assign(living, { name: 'Living room fan', running: mode !== 'source-off' && mode !== 'mapped-off',
      available: mode !== 'mapped-unknown', speed: 50, speedAvailable: true, canSetSpeed: true, lastReadAt: now,
      speedCapabilities: { min: 0, max: 100, step: mode.startsWith('mapped') ? 1 : 25,
        values: mode.startsWith('mapped') ? Array.from({ length: 101 }, (_, index) => index) : [0, 25, 50, 75, 100] } });
    data.sources.push(
      { id: 'guest-fan', kind: 'fan', name: 'Guest fan', running: false, available: true, lastReadAt: now },
      { id: 'office-fan', kind: 'fan', name: 'Office fan', running: true, speed: 71, speedAvailable: true, available: true, lastReadAt: now },
      { id: 'stale-fan', kind: 'fan', name: 'Stale fan', running: true, available: true, lastReadAt: now - 120000 },
    );
    if (mode === 'missing-fan') data.sources = data.sources.filter((source) => source.id !== 'office-fan');
    await route.fulfill({ response, json: data });
  };
  const configHandler = async (route) => {
    const response = await route.fetch(); const data = await response.json();
    data.config.fanMappings = [{ sourceId: 'office-fan', ranges: [{ label: 'Speed 5', min: 65, max: 78 }] }];
    if (mode.startsWith('mapped')) data.config.fanMappings.push({ sourceId: 'living-fan',
      ranges: [[1, 21], [22, 35], [36, 49], [50, 64], [65, 78], [79, 92], [93, 100]]
        .map(([min, max], index) => ({ min, max, label: 'Speed ' + (index + 1) })) });
    if (mode === 'mapped-fahrenheit') data.config.temperatureUnit = 'F';
    if (mode === 'no-presence' || mode === 'no-rules') data.config.rules.occupancy = [];
    if (mode === 'no-rules') data.config.rules.fans = [];
    await route.fulfill({ response, json: data });
  };
  await page.route('**/api/status', handler);
  await page.route('**/api/sources', sourceHandler);
  await page.route('**/api/config', configHandler);
  const card = (id) => page.locator('#overview-fans .automation-card[data-source-id="' + id + '"]');
  const refresh = async () => {
    await page.locator('#refresh-status').click();
    await page.waitForFunction(() => !document.getElementById('refresh-status').disabled);
  };
  try {
    await page.reload();
    await page.getByRole('heading', { name: 'Your thermostats', exact: true }).waitFor();
    await refresh();
    const aligned = await page.locator('#thermostats .thermostat-card').evaluateAll((cards) => cards.slice(0, 2).map((card) =>
      ['.current-temperature', '.device-facts', '.thermostat-controls'].map((selector) => card.querySelector(selector).getBoundingClientRect().y)));
    assert.equal(aligned.length, 2);
    for (let index = 0; index < 3; index++) assert.ok(Math.abs(aligned[0][index] - aligned[1][index]) <= 1, 'Adjacent thermostat rows align');
    await card('living-fan').getByRole('heading', { name: 'Living room fan', exact: true }).waitFor();
    assert.equal(await card('living-fan').count(), 1, 'Discovery and rules share one fan card');
    assert.equal(await card('living-fan').locator('.device-symbol[data-icon="fan"] svg').count(), 1);
    assert.equal(await page.locator('#overview-presence .device-symbol[data-icon="user"] svg').count(), 1);
    assert.equal(await card('guest-fan').locator('.status-pill').innerText(), 'Off');
    assert.match(await card('guest-fan').textContent(), /No fan rule assigned/);
    assert.equal(await card('office-fan').locator('.status-pill').innerText(), 'On · Speed 5 · 71%');
    assert.equal(await card('stale-fan').locator('.status-pill').innerText(), 'Unavailable');
    const thermostatWidth = (await page.locator('#thermostats .thermostat-card').first().boundingBox()).width;
    assert.ok((await card('living-fan').boundingBox()).width <= thermostatWidth + 1);
    assert.ok((await page.locator('#overview-presence .automation-card').boundingBox()).width <= thermostatWidth + 1,
      'A single presence card keeps the thermostat card width');
    const graph = () => card('living-fan').locator('.fan-curve-graph svg');
    await graph().waitFor();
    assert.equal(await card('guest-fan').locator('.fan-curve-figure').count(), 0);
    assert.equal(await card('office-fan').locator('.fan-curve-figure').count(), 0);
    assert.equal(await graph().locator('.fan-curve-current').getAttribute('data-speed'), '56.25');
    assert.equal(await graph().locator('.fan-curve-reported').getAttribute('data-speed'), '50');
    assert.match(await card('living-fan').locator('.fan-curve-key').innerText(), /56.3% → fan setting 50%/);
    await page.screenshot({ path: path.join(output, label + '-compact-overview.png'), fullPage: true });
    await card('living-fan').locator('summary').click();
    await page.locator('#overview-presence summary').click();
    await page.locator('.temperature-controller').first().locator('summary').click();
    const fanText = () => card('living-fan').textContent();
    assert.match(await fanText(), /On · 50%/);
    assert.match(await fanText(), /Equal average:.*25\.0.*26\.0.*25\.5/);
    assert.match(await fanText(), /56\.3%.*Supported fan setting: 50%/);
    assert.match(await fanText(), /Heating fan · standby/);
    assert.equal(await page.locator('#overview-fans script').count(), 0, 'Sensor names are rendered as text');
    assert.match(await page.locator('#overview-presence').textContent(), /No motion now · still counts as Home/);
    assert.match(await page.locator('#overview-presence').textContent(), /5 min before this check/);
    assert.match(await page.locator('#overview-presence').textContent(), /Room occupancy.*Not occupied \/ Away/s);
    assert.match(await page.locator('.temperature-controller').first().textContent(), /Allowed adjustment: ±1\.5/);
    await page.screenshot({ path: path.join(output, label + '-overview-explanations.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, label + '-overview-explanations-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const [nextMode, selector, pattern] of [
      ['away-delay', '#overview-presence', /Away countdown started/],
      ['override', '#overview-presence', /Manual Away override until/],
      ['unavailable', '#overview-presence', /Unavailable sources cannot confirm Away/],
      ['pending', '#overview-fans', /Command awaiting device feedback: on · speed setting 75%/],
      ['stale', '#overview-fans', /Current automation status is unavailable/],
    ]) {
      mode = nextMode; await refresh();
      assert.match(await page.locator(selector).textContent(), pattern);
      assert.equal(await page.locator(selector + ' details').first().getAttribute('open') !== null, true,
        'Open explanations survive status refreshes');
      if (mode === 'stale') assert.equal(await graph().locator('.fan-curve-current, .fan-curve-reported').count(), 0,
        'Stale automation has no current-position marker');
      if (mode === 'pending') assert.match(await card('living-fan').locator('.fan-curve-status').innerText(), /Awaiting fan feedback/);
    }
    mode = 'recovering'; await refresh();
    const recovering = page.locator('.temperature-controller').first();
    assert.match(await recovering.textContent(), /Recovering feedback/);
    assert.match(await recovering.textContent(), /Pending Nest schedule target:.*19\.0/s);
    assert.match(await recovering.textContent(), /Automatic recovery is enabled/);
    assert.match(await recovering.textContent(), /Confirmation wait started/);
    assert.equal(await recovering.getAttribute('open') !== null, true);
    await page.screenshot({ path: path.join(output, label + '-temperature-recovery.png'), fullPage: true });
    mode = 'mapped'; await page.reload(); await refresh(); await graph().waitFor();
    const labels = await graph().locator('.fan-curve-axis').allTextContents();
    for (const speed of [1, 2, 3, 4]) assert.ok(labels.some((value) => value.startsWith('Speed ' + speed)));
    for (const speed of [5, 6, 7]) assert.ok(!labels.some((value) => value.startsWith('Speed ' + speed)));
    assert.equal(await graph().locator('.fan-curve-current').getAttribute('data-speed'), '42');
    assert.equal(await graph().locator('.fan-curve-reported').getAttribute('data-speed'), '57');
    assert.match(await card('living-fan').locator('.fan-curve-key').innerText(), /Curve setting: Speed 3 · 42%/);
    assert.match(await card('living-fan').locator('.fan-curve-key').innerText(), /Reported: Speed 4 · 50%/);
    await page.screenshot({ path: path.join(output, label + '-fan-curve-mapped.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const chart = document.querySelector('#overview-fans .fan-curve-graph');
      return chart && Math.abs(chart.clientWidth - chart.querySelector('svg').viewBox.baseVal.width) < 1;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await card('living-fan').screenshot({ path: path.join(output, label + '-fan-curve-mobile.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await card('living-fan').screenshot({ path: path.join(output, label + '-fan-curve-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const nextMode of ['mapped-paused', 'mapped-off', 'mapped-unknown', 'mapped-hot', 'mapped-fahrenheit']) {
      mode = nextMode; await page.reload(); await refresh(); await graph().waitFor();
      const status = await card('living-fan').locator('.fan-curve-status').innerText();
      if (mode === 'mapped-paused') assert.match(status, /Preview · automatic control paused/);
      if (mode === 'mapped-off') {
        assert.match(status, /Preview · rule is not requesting this fan/);
        assert.equal(await graph().locator('.fan-curve-reported').count(), 0);
        assert.match(await card('living-fan').locator('.fan-curve-key').innerText(), /Reported: Off/);
      }
      if (mode === 'mapped-unknown') assert.equal(await graph().locator('.fan-curve-current, .fan-curve-reported').count(), 0);
      if (mode === 'mapped-hot') assert.equal(await graph().locator('.fan-curve-current').getAttribute('data-speed'), '57');
      if (mode === 'mapped-fahrenheit') {
        assert.match(await graph().getAttribute('aria-label'), /77.9°F/);
        await card('living-fan').screenshot({ path: path.join(output, label + '-fan-curve-fahrenheit.png') });
      }
    }
    for (const nextMode of ['fixed-speed', 'last-speed']) {
      mode = nextMode; await page.reload(); await refresh();
      assert.equal(await card('living-fan').locator('.fan-curve-figure').count(), 0);
    }
    mode = 'missing-fan'; await refresh();
    assert.equal(await card('office-fan').locator('.status-pill').innerText(), 'Unavailable', 'A missing bridge retains a known fan as unavailable');
    mode = 'source-off';
    await navigate(page, 'Sensors & fans');
    await page.getByRole('button', { name: 'Discover sources', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('refresh-sources').disabled);
    await navigate(page, 'Overview');
    assert.equal(await card('living-fan').locator('.status-pill').innerText(), 'Off', 'A source refresh updates Overview independently of rule evaluation');
    assert.equal(await card('office-fan').locator('.status-pill').innerText(), 'On · Speed 5 · 71%');
    for (const nextMode of ['no-presence', 'no-engine', 'no-rules']) {
      mode = nextMode; await page.reload();
      await page.getByRole('heading', { name: 'Your thermostats', exact: true }).waitFor(); await refresh();
      assert.equal(await page.locator('#overview-presence-section').isVisible(), mode === 'no-engine',
        'Presence is shown only for saved presence rules, including disabled rules while the engine is unavailable');
      assert.equal(await card('guest-fan').locator('.status-pill').innerText(), 'Off');
      assert.equal(await card('office-fan').locator('.status-pill').innerText(), 'On · Speed 5 · 71%');
      if (mode === 'no-rules') assert.match(await card('living-fan').textContent(), /No fan rule assigned/);
    }
    assert.equal(requests.length, 0, 'Overview inspection never sends a control or configuration request');
  } finally {
    page.off('request', record);
    await page.unroute('**/api/status', handler);
    await page.unroute('**/api/sources', sourceHandler);
    await page.unroute('**/api/config', configHandler);
    await page.reload();
    await page.getByRole('heading', { name: 'Your thermostats', exact: true }).waitFor();
    await refresh();
  }
}
