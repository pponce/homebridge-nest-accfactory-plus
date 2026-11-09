import test from 'node:test';
import assert from 'node:assert/strict';
import { fanCurve, fanCurveError, speedCapabilities, supportedSpeed } from '../homebridge-ui/public/fan-speed.js';
import { validateRuleDrafts } from '../src/web-dashboard-config.js';

const celsius = (value) => (value - 32) / 1.8;
const curve = { desiredTemperature: celsius(72), startGap: 2 / 1.8, stopGap: 0.5 / 1.8, fullSpeedGap: 6 / 1.8,
  minimumSpeed: 25, maximumSpeed: 75 };

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
