import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { HeatingResponse, HEATING_PROFILES } from '../src/heating-response.js';
import { ClimateAutomation } from '../src/climate-automation.js';
import { WebDashboardConfig } from '../src/web-dashboard-config.js';

const MINUTE = 60000;
const DAY = 86400000;
const epoch = Date.parse('2026-10-01T10:00:00Z');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-response-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let now = epoch;
  const history = new HeatingResponse({ directory, now: () => now });
  await history.start();
  const rule = {
    id: 'rooms',
    name: 'Rooms',
    kind: 'temperature',
    thermostatId: 'T',
    sourceIds: ['a', 'b'],
    targetIds: [],
    aggregation: 'average',
    desiredTemperature: 21,
    maximumOffset: 1.5,
    minimumIntervalMinutes: 5,
    enabled: false,
  };
  const options = { serialNumber: 'T', heatingType: 'forcedAir', heatingResponseEnabled: true, scheduleTimeZone: 'UTC' };
  const sample = (time, room, heating, extra = {}) => {
    now = time;
    history.observe([rule], [options], new Map([[rule.id, { valid: true, room, physical: room + 1, target: 22, heating, ...extra }]]));
  };
  const cycle = (start, offset = 1, change = {}) => {
    sample(start, 20, false, { physical: 20 + offset });
    for (let i = 1; i <= 30; i++) {
      const room = 20 + (i - 1) * 0.04;
      sample(start + i * MINUTE, room, true, { physical: room + offset, ...change });
    }
    for (let i = 31; i <= 50; i++) {
      const room = 21.2 + Math.min(0.12, (i - 31) * 0.04);
      sample(start + i * MINUTE, room, false, { physical: room + offset, ...change });
    }
  };
  const train = (days = 3, offset = 1) => {
    for (let d = 0; d < days; d++) {
      cycle(epoch + d * DAY, offset);
      cycle(epoch + d * DAY + 2 * 60 * MINUTE, offset);
    }
  };
  return {
    history,
    directory,
    rule,
    options,
    sample,
    cycle,
    train,
    now: () => now,
    view: () => history.snapshot([rule], [options]).rules[0],
  };
}

test('starting guidance is provisional, needs a known type and never changes the saved rule', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.rule);
  for (const [type, profile] of Object.entries(HEATING_PROFILES)) {
    f.options.heatingType = type;
    const view = f.view();
    assert.equal(view.starting.minimumIntervalMinutes, profile.minimumIntervalMinutes);
    assert.equal(view.starting.maximumOffset, profile.maximumOffset);
    assert.equal(view.starting.confidence, 'Provisional');
    assert.equal(view.learned, null);
  }
  for (const type of ['unknown', 'toString', undefined]) {
    f.options.heatingType = type;
    assert.equal(f.view().starting, null);
  }
  assert.deepEqual(f.rule, before);
});

test('complete cycles across multiple days produce evidence and bounded learned guidance', async (t) => {
  const f = await fixture(t);
  f.cycle(epoch);
  assert.equal(f.view().evidence.cycles, 1);
  assert.equal(f.view().learned, null);
  f.train();
  const view = f.view();
  assert.equal(view.evidence.cycles, 7);
  assert.equal(view.evidence.days, 3);
  assert.ok(view.evidence.spanDays >= 2);
  assert.equal(view.evidence.nestMinusRoomC, 1);
  assert.ok(view.evidence.responseDelayMinutes > 0);
  assert.ok(view.evidence.coastRiseC > 0);
  assert.ok(view.evidence.warmingRateCPerHour > 0);
  assert.ok(view.evidence.overshootC > 0);
  assert.equal(view.learned.confidence, 'Moderate');
  assert.ok(view.learned.minimumIntervalMinutes >= 5 && view.learned.minimumIntervalMinutes <= 60);
  assert.ok(view.learned.maximumOffset >= 0.5 && view.learned.maximumOffset <= 1.5);
  assert.equal(f.rule.maximumOffset, 1.5);
  assert.equal(f.rule.enabled, false);
});

test('many cycles in one day do not bypass the observation period', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) {
    f.cycle(epoch + i * 60 * MINUTE);
  }
  assert.equal(f.view().evidence.cycles, 8);
  assert.equal(f.view().learned, null);
});

test('consistent long histories increase confidence; inconsistent room offsets withhold learned guidance', async (t) => {
  const f = await fixture(t);
  f.train(6);
  assert.equal(f.view().learned.confidence, 'Higher');
  f.rule.sourceIds = ['new'];
  for (let d = 0; d < 3; d++) {
    f.cycle(epoch + (6 + d) * DAY, 1.5);
    f.cycle(epoch + (6 + d) * DAY + 2 * 60 * MINUTE, -1.5);
  }
  assert.equal(f.view().learned, null);
  assert.match(f.view().reason, /vary too much/);
});

test('reordering sensors keeps history; changing sensors, targets or heating type starts again', async (t) => {
  const f = await fixture(t);
  f.train();
  f.rule.sourceIds.reverse();
  assert.ok(f.view().learned);
  f.rule.sourceIds = ['a', 'c'];
  assert.equal(f.view().learned, null);
  f.sample(f.now() + MINUTE, 21, false);
  assert.equal(f.view().evidence.cycles, 0);
  f.rule.sourceIds = ['a', 'b'];
  assert.equal(f.view().evidence.cycles, 0);
  f.cycle(epoch + 3 * DAY);
  assert.equal(f.view().evidence.cycles, 1);
  f.rule.desiredTemperature = 22;
  assert.equal(f.view().evidence.cycles, 0);
  f.cycle(epoch + 4 * DAY);
  f.options.heatingType = 'radiantFloor';
  assert.equal(f.view().evidence.cycles, 0);
});

test('missing data, time gaps, clock reversal, invalid samples and setpoint changes exclude partial cycles', async (t) => {
  const f = await fixture(t);
  for (const extra of [{ valid: false }, { target: 24 }, { physical: NaN }, { room: 1000 }]) {
    const start = f.now() + DAY;
    f.sample(start, 20, false);
    f.sample(start + MINUTE, 20, true);
    f.sample(start + 2 * MINUTE, 20.4, true, extra);
    for (let i = 3; i < 40; i++) {
      f.sample(start + i * MINUTE, 21, i < 20);
    }
  }
  for (const gap of [5 * MINUTE, -MINUTE]) {
    const start = f.now() + DAY;
    f.sample(start, 20, false);
    f.sample(start + MINUTE, 20, true);
    f.sample(start + MINUTE + gap, 21, true);
    for (let i = 1; i < 40; i++) {
      f.sample(start + MINUTE + gap + i * MINUTE, 21, i < 20);
    }
  }
  assert.equal(f.view().evidence.cycles, 0);
  f.cycle(f.now() + DAY);
  assert.equal(f.view().evidence.cycles, 1);
});

test('coast must settle and cycles need measured warming near the desired temperature', async (t) => {
  const f = await fixture(t);
  f.sample(epoch, 20, false);
  for (let i = 1; i < 50; i++) {
    f.sample(epoch + i * MINUTE, 20, i < 30);
  }
  assert.equal(f.view().evidence.cycles, 0);
  f.cycle(epoch + DAY);
  const record = f.history.records.get('rooms');
  record.previous[4] = 1;
  record.active = { start: f.now() - 13 * 60 * MINUTE, setpoint: 22 };
  f.sample(f.now() + MINUTE, 21, true);
  assert.match(record.status, /too long/);
  record.active = {
    start: f.now() - 4 * 60 * MINUTE,
    stop: f.now() - 181 * MINUTE,
    room: 20,
    stopRoom: 21,
    peak: 21,
    peakAt: f.now(),
    rate: 0.1,
    setpoint: 22,
    offsets: [],
  };
  f.sample(f.now() + MINUTE, 21, false);
  assert.match(record.status, /three hours/);
});

test('history survives restart without joining partial cycles; retention and collection off are enforced', async (t) => {
  const f = await fixture(t);
  f.train();
  await f.history.persist(true);
  assert.equal((await fs.stat(f.history.file)).mode & 0o777, 0o600);
  const restored = new HeatingResponse({ directory: f.directory, now: f.now });
  await restored.start();
  assert.equal(restored.snapshot([f.rule], [f.options]).rules[0].evidence.cycles, 6);
  assert.equal(restored.records.get('rooms').active, undefined);
  assert.ok(restored.records.get('rooms').samples.every((sample) => sample[0] >= f.now() - 2 * DAY));
  f.sample(f.now() + 31 * DAY, 21, false);
  assert.equal(f.view().evidence.cycles, 0);
  f.options.heatingResponseEnabled = false;
  f.sample(f.now() + MINUTE, 21, false);
  await f.history.persist(true);
  assert.equal(f.history.records.size, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(f.history.file, 'utf8')).records, []);
});

test('sampling and retained records remain bounded; stable sub-minute reads are not duplicated', async (t) => {
  const f = await fixture(t);
  f.sample(epoch, 21, false);
  f.sample(epoch + 1000, 21, false);
  assert.equal(f.history.records.get('rooms').samples.length, 1);
  for (let i = 1; i <= 3000; i++) {
    f.sample(epoch + i * MINUTE, 21, false);
  }
  assert.equal(f.history.records.get('rooms').samples.length, 2880);
  const record = f.history.records.get('rooms');
  const entry = { start: f.now(), end: f.now(), delay: 5, rate: 0.05, coastMinutes: 5, coastRise: 0.1, offset: 1, overshoot: 0.1 };
  record.cycles = Array.from({ length: 128 }, () => ({ ...entry }));
  f.cycle(f.now() + 60 * MINUTE);
  assert.equal(record.cycles.length, 128);
});

test('storage failure is visible and recoverable; malformed history starts a new observation period', async (t) => {
  const f = await fixture(t);
  f.cycle(epoch);
  const file = f.history.file;
  f.history.file = path.join(f.directory, 'missing', 'history.json');
  await f.history.persist(true);
  assert.match(f.history.error, /could not be saved/);
  f.history.file = file;
  await f.history.persist(true);
  assert.equal(f.history.error, null);
  for (const data of ['broken', JSON.stringify({ version: 2, records: [] }), JSON.stringify({ version: 1, records: [{}] })]) {
    await fs.writeFile(file, data);
    const restored = new HeatingResponse({ directory: f.directory, now: f.now });
    await restored.start();
    assert.equal(restored.records.size, 0);
    assert.match(restored.error, /could not be read/);
  }
});

test('learned suggestions cap slow response and reduce adjustment for overshoot', async (t) => {
  const f = await fixture(t);
  f.train();
  const record = f.history.records.get('rooms');
  const normal = f.view().learned;
  for (const cycle of record.cycles) {
    cycle.delay = 70;
    cycle.overshoot = 2;
  }
  const limited = f.view().learned;
  assert.equal(limited.minimumIntervalMinutes, 60);
  assert.equal(limited.limitReached, true);
  assert.ok(limited.maximumOffset < normal.maximumOffset);
  f.options.scheduleTimeZone = 'invalid';
  record.signature = f.history.records.get('rooms').signature;
  assert.doesNotThrow(() => f.view());
});

test('Apply saves only the requested rule limits with optimistic concurrency and never sends an equipment command', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.directory, 'config.json');
  const other = { ...f.rule, id: 'other', name: 'Other', thermostatId: 'OTHER' };
  const root = {
    platforms: [
      {
        platform: 'NestClimateCntrl',
        untouched: 'keep',
        devices: [f.options],
        climateRuleDrafts: { temperature: [f.rule, other], fans: [], occupancy: [] },
      },
    ],
  };
  await fs.writeFile(file, JSON.stringify(root));
  const config = new WebDashboardConfig(file, root.platforms[0]);
  const engine = new ClimateAutomation({ directory: f.directory, dashboard: {}, config, now: f.now });
  engine.heatingResponse = f.history;
  const view = await engine.heatingRecommendations();
  const payload = { id: f.rule.id, stage: 'starting', recommendationId: view.rules[0].starting.id, revision: view.revision };
  const saved = await engine.applyHeatingRecommendation(payload);
  assert.equal(saved.restartRequired, false);
  assert.deepEqual(saved.config.rules.temperature[0], { ...f.rule, minimumIntervalMinutes: 10, maximumOffset: 1 });
  assert.deepEqual(saved.config.rules.temperature[1], other);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).platforms[0].untouched, 'keep');
  await assert.rejects(engine.applyHeatingRecommendation(payload), { status: 409 });
  await assert.rejects(engine.applyHeatingRecommendation({ ...payload, revision: saved.revision, recommendationId: 'old' }), {
    status: 409,
  });
  await assert.rejects(engine.applyHeatingRecommendation({ ...payload, revision: saved.revision, extra: true }), { status: 400 });
  await assert.rejects(engine.applyHeatingRecommendation({ ...payload, revision: saved.revision, stage: 'learned' }), { status: 409 });
  f.train();
  const learned = await engine.heatingRecommendations();
  const learnedPayload = { ...payload, revision: learned.revision, stage: 'learned', recommendationId: learned.rules[0].learned.id };
  f.history.error = 'Storage unavailable';
  await assert.rejects(engine.applyHeatingRecommendation(learnedPayload), { status: 409 });
  f.history.error = null;
  assert.equal((await engine.applyHeatingRecommendation(learnedPayload)).config.rules.temperature[0].enabled, false);
  engine.stopping = true;
  await assert.rejects(engine.applyHeatingRecommendation(payload), { status: 400 });
});

test('heating settings are validated, preserved and applied without a bridge restart', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.directory, 'config.json');
  const block = { platform: 'NestClimateCntrl', devices: [{ serialNumber: 'T', custom: 'keep' }] };
  await fs.writeFile(file, JSON.stringify({ platforms: [block] }));
  const config = new WebDashboardConfig(file, block);
  let view = await config.snapshot();
  view = await config.save({ revision: view.revision, config: { devices: [f.options] } });
  assert.equal(view.restartRequired, false);
  assert.equal(view.config.devices[0].heatingType, 'forcedAir');
  assert.equal(view.config.devices[0].heatingResponseEnabled, true);
  for (const invalid of [{ heatingType: 'steam' }, { heatingResponseEnabled: 'true' }]) {
    await assert.rejects(config.save({ revision: view.revision, config: { devices: [{ serialNumber: 'T', ...invalid }] } }), {
      status: 400,
    });
  }
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).platforms[0].devices[0].custom, 'keep');
});

test('radiant response that begins after heating stops is measured through the settled peak', async (t) => {
  const f = await fixture(t);
  f.options.heatingType = 'radiantFloor';
  f.sample(epoch, 20.5, false);
  for (let i = 1; i <= 20; i++) {
    f.sample(epoch + i * MINUTE, 20.5, true);
  }
  for (let i = 21; i <= 65; i++) {
    f.sample(epoch + i * MINUTE, 20.5 + Math.min(0.6, (i - 21) * 0.04), false);
  }
  const evidence = f.view().evidence;
  assert.equal(evidence.cycles, 1);
  assert.ok(evidence.responseDelayMinutes >= 20);
  assert.ok(evidence.coastMinutes >= 10);
  assert.ok(evidence.coastRiseC >= 0.5);
});

test('a radiant room can first warm after the initial settling window without losing its cycle', async (t) => {
  const f = await fixture(t);
  f.options.heatingType = 'radiantFloor';
  f.sample(epoch, 20.5, false);
  for (let i = 1; i <= 80; i++) {
    const room = 20.5 + Math.min(0.6, Math.max(0, i - 45) * 0.04);
    f.sample(epoch + i * MINUTE, room, i <= 10);
  }
  assert.equal(f.view().evidence.cycles, 1);
  assert.ok(f.view().evidence.responseDelayMinutes >= 45);
});
