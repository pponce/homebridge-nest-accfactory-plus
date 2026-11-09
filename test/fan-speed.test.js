import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fanCurve, fanCurveError, fanRulePlan, fanSpeedError, normalizeFanRule, speedCapabilities, supportedSpeed,
} from '../homebridge-ui/public/fan-speed.js';
import { validateRuleDrafts } from '../src/web-dashboard-config.js';

const celsius = (value) => (value - 32) / 1.8;
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
