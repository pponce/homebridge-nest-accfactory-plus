import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fanCurve, fanCurveError, fanRulePlan, fanSpeedError, normalizeFanRule, speedCapabilities, supportedSpeed,
  fanManualHoldUntil, fanManualHoldError,
} from '../homebridge-ui/public/fan-speed.js';
import { validateRuleDrafts } from '../src/web-dashboard-config.js';

const celsius = (value) => (value - 32) / 1.8;

test('manual fan holds validate optional policy without changing existing rules', () => {
  assert.equal(fanManualHoldUntil(undefined, 1), null);
  assert.equal(fanManualHoldUntil({ mode: 'manual' }, 1), null);
  assert.equal(fanManualHoldUntil({ mode: 'duration', minutes: 120 }, 1), 7200001);
  for (const policy of [null, {}, { mode: 'never' }, { mode: 'duration', minutes: 0 },
    { mode: 'duration', minutes: 1.5 }, { mode: 'duration', minutes: 10081 },
    { mode: 'manual', time: '08:00' }, { mode: 'time', time: '24:00', timeZone: 'UTC' },
    { mode: 'time', time: '08:00', timeZone: 'bad/zone' }]) {
    assert.ok(fanManualHoldError(policy));
  }
  assert.ok(fanManualHoldError({ mode: 'manual' }, 'temperature'));
  const rule = { id: 'fan', name: 'Fan', kind: 'fan', manualOverride: { mode: 'duration', minutes: 60 } };
  assert.deepEqual(validateRuleDrafts({ fans: [rule] }).fans[0].manualOverride, rule.manualOverride);
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...rule, kind: 'temperature' }] }), /fan rules/);
  assert.throws(() => validateRuleDrafts({ fans: [{ ...rule, manualOverride: { mode: 'duration', minutes: -1 } }] }), /manual hold/);
});

test('daily fan holds select the next actual local time through midnight and DST', () => {
  const next = (time, after) => new Date(fanManualHoldUntil({ mode: 'time', time, timeZone: 'America/Los_Angeles' },
    Date.parse(after))).toISOString();
  assert.equal(next('08:00', '2026-11-14T05:00:00Z'), '2026-11-14T16:00:00.000Z');
  assert.equal(next('08:00', '2026-11-14T16:00:00Z'), '2026-11-15T16:00:00.000Z');
  assert.equal(next('02:30', '2026-03-08T09:00:00Z'), '2026-03-09T09:30:00.000Z', 'Skip nonexistent spring time');
  assert.equal(next('01:30', '2026-11-01T08:45:00Z'), '2026-11-01T09:30:00.000Z', 'Use second autumn occurrence');
  assert.equal(fanManualHoldUntil({ mode: 'time', time: '00:00', timeZone: 'UTC' }, Date.parse('2026-11-14T23:59:10Z')),
    Date.parse('2026-11-15T00:00:00Z'));
});
const curve = { desiredTemperature: celsius(72), startGap: 2 / 1.8, stopGap: 0.5 / 1.8, fullSpeedGap: 6 / 1.8,
  minimumSpeed: 25, maximumSpeed: 75 };

test('all three speed choices are independent of each of the three run conditions', () => {
  for (const action of ['temperature', 'heating', 'cooling']) {
    for (const speedMode of ['last', 'fixed', 'curve']) {
      const rule = { ...curve, action, speedMode, threshold: celsius(74), hysteresis: 1, fixedSpeed: 60 };
      const active = fanRulePlan(rule, { temperature: celsius(76), hvacState: action });
      assert.equal(active.demand, true);
      assert.ok(Math.abs((active.speed ?? 0) - ({ last: 0, fixed: 60, curve: 50 }[speedMode])) < 1e-8);
      assert.equal(fanRulePlan(rule, { temperature: celsius(71), hvacState: 'off' }).demand, false);
      assert.equal(fanRulePlan(rule).demand, undefined);
      if (action !== 'temperature') {
        const cold = fanRulePlan(rule, { temperature: celsius(60), hvacState: action });
        assert.equal(cold.demand, true);
        assert.equal(cold.speed, { last: null, fixed: 60, curve: 25 }[speedMode]);
        assert.equal(fanRulePlan(rule, { hvacState: action }).demand, speedMode === 'curve' ? undefined : true);
      }
    }
  }
  assert.equal(fanRulePlan({ action: 'temperature', threshold: 24 }, { temperature: 24 }).demand, false);
  assert.equal(fanRulePlan({ action: 'temperature', threshold: 24 }, { temperature: 23.5, previousDemand: true }).demand, true);
});

test('legacy fan curves preserve their start, stop and speed boundaries after normalization', () => {
  const legacy = { ...curve, action: 'temperature-speed' };
  const normalized = normalizeFanRule(legacy);
  assert.equal(normalized.action, 'temperature');
  assert.equal(normalized.speedMode, 'curve');
  assert.equal(normalized.priority, 0);
  for (const temperature of [72, 72.5, 73, 74, 76, 78, 90]) {
    for (const previousDemand of [false, true]) {
      const before = fanCurve(legacy, celsius(temperature), previousDemand);
      const after = fanRulePlan(normalized, { temperature: celsius(temperature), previousDemand });
      assert.equal(after.demand, before.demand);
      assert.ok(Math.abs((after.speed ?? 0) - before.speed) < 1e-8);
    }
  }
  assert.equal(normalizeFanRule({ action: 'temperature-speed' }).threshold, undefined);
  assert.deepEqual(normalizeFanRule(normalized), normalized);
});

test('fan configuration validates priority overlap and independent trigger and speed settings', () => {
  const rule = { ...curve, id: 'fan', name: 'Comfort', kind: 'fan', enabled: true,
    action: 'heating', thermostatId: 'T', sourceIds: ['room'], targetIds: ['fan'], speedMode: 'fixed', fixedSpeed: 50, priority: 20 };
  const validate = (change) => validateRuleDrafts({ fans: [{ ...rule, ...change }] }).fans[0];
  assert.equal(validate({ sourceIds: [] }).fixedSpeed, 50);
  assert.equal(validate({ speedMode: 'last', sourceIds: [] }).speedMode, 'last');
  assert.equal(validate({ speedMode: 'curve', startGap: 0 }).startGap, 0);
  for (const change of [{ priority: -1 }, { priority: 101 }, { priority: 1.5 }, { thresholdInclusive: 'yes' },
    { fixedSpeed: undefined }, { fixedSpeed: 0 }, { fixedSpeed: 101 }, { speedMode: 'invalid' }, { thermostatId: '' },
    { speedMode: 'curve', sourceIds: [] }, { speedMode: 'curve', fullSpeedGap: curve.startGap },
    { speedMode: 'curve', minimumSpeed: 90 }, { action: 'temperature', threshold: 24, sourceIds: [] },
    { action: 'temperature' }]) {
    assert.throws(() => validate(change));
  }
  assert.ok(fanSpeedError({ speedMode: 'curve' }));
  const other = { ...rule, id: 'other', priority: 30 };
  assert.equal(validateRuleDrafts({ fans: [rule, other] }).fans.length, 2);
  assert.throws(() => validateRuleDrafts({ fans: [rule, { ...other, priority: 20 }] }), /different priorities/);
  assert.equal(validateRuleDrafts({ fans: [rule, { ...other, priority: 20, enabled: false }] }).fans.length, 2);
  assert.equal(validateRuleDrafts({ fans: [rule, { ...other, priority: 20, targetIds: ['other-fan'] }] }).fans.length, 2);
});

test('comfort curve uses a start threshold, linear speeds, cap and a separate stop threshold', () => {
  for (const [temperature, running, demand, speed] of [
    [73, false, false, 0], [74, false, true, 25], [76, false, true, 50], [78, false, true, 75],
    [90, false, true, 75], [73, true, true, 25], [72.5, true, false, 0], [72, true, false, 0],
  ]) {
    const actual = fanCurve(curve, celsius(temperature), running);
    assert.equal(actual.demand, demand);
    assert.ok(Math.abs(actual.speed - speed) < 1e-8);
  }
  assert.equal(fanCurve(curve, null), null);
  assert.equal(fanCurve({ ...curve, startGap: NaN }, 25), null);
});

test('curve validation rejects inverted gaps, missing targets, invalid ranges and inverted speeds', () => {
  const rule = { ...curve, id: 'fan', kind: 'fan', name: 'Comfort', enabled: true, sourceIds: ['room'], targetIds: ['fan'],
    action: 'temperature-speed' };
  assert.equal(validateRuleDrafts({ fans: [rule] }).fans[0].maximumSpeed, 75);
  for (const change of [{ startGap: 0 }, { startGap: curve.stopGap }, { fullSpeedGap: curve.startGap },
    { minimumSpeed: 76 }, { maximumSpeed: 101 }, { desiredTemperature: undefined }, { stopGap: -1 }]) {
    assert.ok(fanCurveError({ ...rule, ...change }));
    assert.throws(() => validateRuleDrafts({ fans: [{ ...rule, ...change }] }));
  }
  assert.throws(() => validateRuleDrafts({ fans: [{ ...rule, sourceIds: [] }] }), /sources/);
  const draft = { id: 'fan', kind: 'fan', name: 'Draft', action: 'temperature-speed' };
  assert.equal(validateRuleDrafts({ fans: [draft] }).fans[0].enabled, false);
});

test('supported fan steps never exceed the cap or fall below the minimum', () => {
  const make = (props) => ({ canSetSpeed: true, speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'], ...props }) });
  const discrete = make({ minStep: 25 });
  assert.equal(supportedSpeed(discrete, 70, 25, 70), 50);
  assert.equal(supportedSpeed(discrete, 37.5, 25, 75), 25);
  assert.equal(supportedSpeed(discrete, 10, 30, 75), 50);
  assert.equal(supportedSpeed(discrete, 50, 1, 20), null);
  assert.equal(supportedSpeed(make({ 'valid-values': [0, 33, 66, 100] }), 75, 25, 75), 66);
  assert.equal(supportedSpeed(make({ 'valid-values-range': [20, 80] }), 100, 1, 75), 75);
  assert.equal(supportedSpeed(make({ minValue: 10, minStep: 20 }), 49, 25, 70), 50);
  assert.equal(supportedSpeed({ canSetSpeed: false }, 50, 25, 75), null);
  assert.equal(supportedSpeed(discrete, 50, 0, 75), null);
});

test('unusable speed characteristics cannot enable speed commands', () => {
  for (const props of [{ perms: ['pr'] }, { perms: ['pw'] }, { perms: ['pr', 'pw', 'tw'] }, { perms: ['pr', 'pw', 'aa'] },
    { unit: 'rpm' }, { minStep: 0 }, { minStep: 0.001 }, { minValue: -1 }, { maxValue: 101 }, { minValue: 100 },
    { 'valid-values': [] }, { 'valid-values': [0] }, { 'valid-values': ['25'] }, { 'valid-values-range': [60, 20] },
    { 'valid-values-range': [20] }, { minStep: Infinity }]) {
    assert.equal(speedCapabilities({ perms: ['pr', 'pw'], ...props }), null);
  }
  assert.equal(speedCapabilities(undefined), null);
});


test('manual fan ranges select native commands within limits and compare physical settings', async () => {
  const { mappedSpeed, sameFanSpeed, sameFanState, speedWithinLimits } = await import('../homebridge-ui/public/fan-speed.js');
  const ranges = [[1, 21], [22, 35], [36, 49], [50, 64], [65, 78], [79, 92], [93, 100]]
    .map(([min, max], index) => ({ label: 'Speed ' + (index + 1), min, max }));
  const source = { canSetSpeed: true, speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'] }), speedMapping: ranges };
  for (const [index, range] of ranges.entries()) {
    for (const value of [range.min, range.max]) {
      assert.equal(mappedSpeed(ranges, value).label, 'Speed ' + (index + 1));
      assert.equal(Math.max(1, Math.round(value / 100 * 7)), index + 1);
    }
  }
  assert.equal(supportedSpeed(source, 75, 25, 75), 71);
  assert.equal(supportedSpeed(source, 75, 75, 75), 75);
  assert.equal(sameFanSpeed(75, 71, ranges), true);
  assert.equal(sameFanSpeed(75, 79, ranges), false);
  assert.equal(sameFanSpeed(75, 71), false);
  assert.equal(sameFanSpeed(null, 0, ranges), false);
  assert.equal(sameFanSpeed(0, 14, ranges), false);
  assert.equal(sameFanState({ running: false, speed: 71 }, { running: true, speed: 75 }, ranges), false);
  assert.equal(mappedSpeed(ranges, 21.5), null);
  assert.equal(speedWithinLimits(source, 78, 25, 75), true, 'Same physical setting as an allowed command');
  assert.equal(speedWithinLimits(source, 86, 25, 75), false);
  const partial = { ...source, speedMapping: [ranges[4]] };
  assert.equal(supportedSpeed(partial, 40, 25, 75), 40);
  assert.equal(supportedSpeed({ ...source, speedCapabilities: { values: [0, 25, 50, 75, 100] } }, 72, 25, 75), 75);
  assert.equal(supportedSpeed({ ...source, canSetSpeed: false }, 75, 25, 75), null);
});

test('manual fan mappings reject ambiguity, invalid bounds and malformed rows while allowing partial maps', async () => {
  const { fanMappingsError } = await import('../homebridge-ui/public/fan-speed.js');
  const row = { label: 'Speed 5', min: 65, max: 78 };
  const map = { sourceId: 'fan', ranges: [row] };
  assert.equal(fanMappingsError([]), null);
  assert.equal(fanMappingsError([{ sourceId: 'fan', ranges: [] }]), null);
  assert.equal(fanMappingsError([map]), null);
  for (const bad of [null, {}, [null], [map, map], [{ ...map, endpoint: 'forbidden' }], [{ ...map, sourceId: '' }],
    [{ ...map, ranges: [row, { label: 'Another', min: 78, max: 90 }] }],
    [{ ...map, ranges: [row, { label: ' speed 5 ', min: 79, max: 92 }] }],
    ...[{ min: 0 }, { max: 101 }, { min: 79 }, { min: 65.5 }, { min: null }, { label: '' }, { label: 'x'.repeat(41) }, { command: 71 }]
      .map((change) => [{ ...map, ranges: [{ ...row, ...change }] }])]) {
    assert.ok(fanMappingsError(bad), JSON.stringify(bad));
  }
});
