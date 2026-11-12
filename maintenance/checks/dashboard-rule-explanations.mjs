import assert from 'node:assert/strict';
import path from 'node:path';

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
    await route.fulfill({ response, json: snapshot });
  };
  await page.route('**/api/status', handler);
  const refresh = async () => {
    await page.locator('#refresh-status').click();
    await page.waitForTimeout(200);
  };
  try {
    await refresh();
    await page.getByRole('heading', { name: 'Living room fan', exact: true }).waitFor();
    await page.locator('#overview-fans summary').click();
    await page.locator('#overview-presence summary').click();
    await page.locator('.temperature-controller').first().locator('summary').click();
    const fanText = () => page.locator('#overview-fans').textContent();
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
    }
    assert.equal(requests.length, 0, 'Overview inspection never sends a control or configuration request');
  } finally {
    page.off('request', record);
    await page.unroute('**/api/status', handler);
    await refresh();
  }
}
