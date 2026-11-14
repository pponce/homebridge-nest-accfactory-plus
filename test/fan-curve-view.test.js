import test from 'node:test';
import assert from 'node:assert/strict';
import { fanCurveView } from '../homebridge-ui/public/fan-curve.js';
import { fanRulePlan, supportedSpeed, speedCapabilities } from '../homebridge-ui/public/fan-speed.js';

const rule = { speedMode: 'curve', desiredTemperature: 22, startGap: 1, fullSpeedGap: 5,
  minimumSpeed: 14, maximumSpeed: 60 };
const source = { canSetSpeed: true, speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'], minStep: 1 }),
  speedMapping: [[1, 21], [22, 35], [36, 49], [50, 64], [65, 78], [79, 92], [93, 100]]
    .map(([min, max], index) => ({ min, max, label: 'Speed ' + (index + 1) })) };

test('overview curve follows physical settings inside limits and distinguishes reported feedback', () => {
  const view = fanCurveView(rule, source, 25, 60);
  assert.equal(view.mapped, true);
  assert.deepEqual(view.levels.map((level) => level.label), ['Speed 1', 'Speed 2', 'Speed 3', 'Speed 4']);
  assert.equal(view.settingLabel, 'Speed 3');
  assert.equal(view.current, 42);
  assert.equal(view.reported, 57, 'A different reported percentage in one mapped setting shares its plotted level');
  assert.ok(view.points.every(([, value]) => value >= 14 && value <= 60));
  for (let temperature = 20; temperature < 31; temperature += 0.037) {
    const point = fanCurveView(rule, source, temperature, null);
    const planned = fanRulePlan({ ...rule, action: 'cooling' }, { temperature, hvacState: 'cooling' });
    assert.equal(point.current, supportedSpeed(source, planned.speed, 14, 60));
    const segment = point.points.findIndex(([at]) => at >= temperature);
    assert.ok(segment > 0);
    assert.equal(point.points[segment - 1][1], point.current, 'Marker lies on the actual mapped step');
  }
  assert.equal(fanCurveView(rule, source, 25, 71).reportedOutside, true);
  assert.equal(fanCurveView(rule, source, 25, 71).reported, null);
});

test('curve endpoints clamp with cold/hot rooms, missing readings and a single reachable speed', () => {
  for (const [temperature, expected] of [[5, 14], [35, 57]]) {
    const view = fanCurveView(rule, source, temperature, null);
    assert.equal(view.current, expected);
    assert.ok(view.low < temperature && view.high > temperature);
  }
  const unavailable = fanCurveView(rule, source, null, 42);
  assert.equal(unavailable.average, null);
  assert.equal(unavailable.current, null);
  assert.equal(unavailable.setting, null);
  assert.equal(unavailable.levels.length, 4);
  const fixedRange = fanCurveView({ ...rule, minimumSpeed: 36, maximumSpeed: 49 }, source, 26, 42);
  assert.equal(fixedRange.levels.length, 1);
  assert.ok(fixedRange.points.every(([, value]) => value === 42));
  const single = fanCurveView({ ...rule, minimumSpeed: 14, maximumSpeed: 14 }, source, 26, 14);
  assert.equal(single.current, 14);
  assert.equal(single.minimum, single.maximum);
});

test('unmapped curves keep percentage requests distinct from native supported fan settings', () => {
  const native = { canSetSpeed: true, speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 }) };
  const view = fanCurveView({ ...rule, minimumSpeed: 25, maximumSpeed: 75 }, native, 25.5, 50);
  assert.equal(view.mapped, false);
  assert.equal(view.current, 56.25);
  assert.equal(view.setting, 50);
  assert.equal(view.reported, 50);
  assert.equal(view.reportedOutside, false);
  assert.equal(fanCurveView(rule, undefined, 25, null).setting, null);
  assert.equal(fanCurveView({ ...rule, maximumSpeed: 10 }, source, 25, null), null);
  assert.equal(fanCurveView({ ...rule, speedMode: 'fixed' }, source, 25, null), null);
  assert.equal(fanCurveView({ ...rule, speedMode: 'last' }, source, 25, null), null);
});

test('larger mappings retain their actual transitions with at most ten axis labels', () => {
  const many = { ...source, speedMapping: Array.from({ length: 20 }, (_, i) => ({
    min: i * 5 + 1, max: i * 5 + 5, label: 'Setting ' + (i + 1),
  })) };
  const view = fanCurveView({ ...rule, minimumSpeed: 1, maximumSpeed: 100 }, many, 25, 49);
  assert.equal(view.levels.length, 10);
  assert.equal(view.levels[0].label, 'Setting 1');
  assert.equal(view.levels.at(-1).label, 'Setting 20');
  assert.equal(view.points.length, 40);
  assert.equal(view.reported, 48);
});
