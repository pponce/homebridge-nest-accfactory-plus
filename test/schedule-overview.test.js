import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleOverview, upcomingSetpoints } from '../homebridge-ui/public/climate-utils.js';

const now = new Date('2026-11-13T00:00:00Z'); // Thursday 16:00 in Los Angeles.
function fixture() {
  const point = (time, heat = 20.5) => ({ time, 'temp-min': heat, 'temp-max': 32 });
  const device = { serial: 'T1', data: {
    description: 'Living room', hvac_mode: 'heat', eco_mode: false, active_rcs_sensor: '',
    schedule_time_zone: 'America/Los_Angeles', schedules: {
      0: { morning: point(24300), afternoon: point(56700, 19) },
      3: { evening: point(73800) }, 4: { morning: point(25200) },
    },
  } };
  const rule = { id: 'rooms', kind: 'temperature', thermostatId: 'T1', name: 'Room average', enabled: true,
    temperatureControl: 'active', desiredTemperature: 21, roomTemperature: 20 };
  const snapshot = { devices: [device], automation: { available: true, rules: [rule] } };
  return { device, snapshot, rule, view: (live = true) => scheduleOverview(device, snapshot, {}, live, now) };
}

test('upcoming rows stay chronological across the week boundary and ignore invalid times', () => {
  const f = fixture();
  assert.deepEqual(f.view().points.map(({ day, time }) => [day, time]), [[3, 73800], [4, 25200], [0, 24300]]);
  const entries = [{ day: 0, time: 3600 }, { day: 6, time: 7200 }, { day: 7, time: 0 }, { day: 0, time: NaN }];
  assert.deepEqual(upcomingSetpoints(entries, 'UTC', new Date('2026-11-15T01:00:00Z')).map((p) => p.day), [6, 0]);
  assert.deepEqual(upcomingSetpoints(entries, 'bad/zone', now), []);
  assert.deepEqual(upcomingSetpoints(entries, null, now), []);
});

test('schedule targets follow Heat, Cool and range mode without exposing unused fields', () => {
  const f = fixture();
  assert.equal(f.view().modeLabel, 'Heat mode');
  assert.deepEqual(f.view().points[0].targets, [{ label: 'Heat', value: 20.5 }]);
  f.device.data.hvac_mode = 'cool';
  assert.equal(f.view().modeLabel, 'Cool mode');
  assert.deepEqual(f.view().points[0].targets, [{ label: 'Cool', value: 32 }]);
  for (const mode of ['range', 'heatcool']) {
    f.device.data.hvac_mode = mode;
    assert.equal(f.view().modeLabel, 'Heat / Cool mode');
    assert.deepEqual(f.view().points[0].targets, [{ label: 'Heat', value: 20.5 }, { label: 'Cool', value: 32 }]);
  }
  f.device.data.hvac_mode = 'heat';
  f.device.data.schedules[3].evening.type = 'COOL';
  assert.equal(f.view().points[0].day, 4, 'A mismatched cached schedule entry is not shown as a heating change');
});

test('off, unknown mode, missing thermostat and missing time zone do not invent upcoming changes', () => {
  const f = fixture();
  f.device.data.hvac_mode = 'off';
  assert.deepEqual(f.view().points, []);
  assert.match(f.view().empty, /thermostat is off/);
  f.device.data.hvac_mode = undefined;
  assert.deepEqual(f.view().points, []);
  f.device.data.hvac_mode = 'heat';
  delete f.device.data.schedule_time_zone;
  assert.deepEqual(f.view().points, []);
  assert.match(f.view().empty, /time zone/);
  assert.equal(scheduleOverview(null, { devices: [] }).name, 'No thermostat selected');
});

test('only a confirmed controller on the selected thermostat explains adoption of scheduled room targets', () => {
  const f = fixture();
  for (const status of ['active', 'interval']) {
    f.rule.temperatureControl = status;
    assert.equal(f.view().control.title, 'Climate rule · Room average');
    assert.match(f.view().control.detail, /confirmed Nest heating target becomes its desired room temperature/);
    assert.match(f.view().control.detail, /still controlling heating/);
    assert.equal(f.view().control.runtime.desiredTemperature, 21);
  }
  f.rule.thermostatId = 'T2';
  assert.equal(f.view().control.title, 'Nest sensor control');
  assert.deepEqual(f.view().control.rules, []);
  assert.match(f.view().control.detail, /built-in temperature sensor/);
  f.device.data.active_rcs_sensor = 'S1';
  assert.match(f.view().control.detail, /selected temperature sensor/);
  assert.doesNotMatch(f.view().control.detail, /built-in/);
});

test('paused, waiting, disabled and scheduled rules are identified without claiming active control', () => {
  const f = fixture();
  for (const status of ['paused', 'waiting', 'disabled', 'scheduled', 'standby']) {
    f.rule.temperatureControl = status;
    assert.equal(f.view().control.title, 'Climate rules inactive');
    assert.equal(f.view().control.rules[0].status, status);
    assert.equal(f.view().control.runtime, null);
  }
  f.rule.temperatureControl = 'active';
  f.rule.enabled = false;
  assert.equal(f.view().control.title, 'Climate rules inactive');
});

test('confirmation waits, restoration, Eco and disconnected feedback keep their distinct meaning', () => {
  const f = fixture();
  f.rule.temperatureControl = 'updating';
  f.rule.reason = 'Waiting for Nest to report its scheduled target.';
  assert.equal(f.view().control.label, 'Confirming target');
  assert.match(f.view().control.detail, /Waiting for Nest to report/);
  f.rule.temperatureControl = 'restoring';
  assert.match(f.view().control.detail, /returning its previous heating target/);
  assert.doesNotMatch(f.view().control.detail, /becomes its desired/);
  f.rule.temperatureControl = 'active';
  f.device.data.eco_mode = true;
  assert.equal(f.view().eco, true);
  assert.equal(f.view().control.runtime, null);
  assert.match(f.view().control.detail, /Eco can prevent/);
  assert.equal(f.view(false).control.title, 'Control status unavailable');
  assert.equal(f.view(false).live, false);
});

test('unknown or conflicting engine feedback cannot present a rule as the current controller', () => {
  const f = fixture();
  f.snapshot.automation.rules.push({ ...f.rule, id: 'conflict' });
  assert.equal(f.view().control.title, 'Control status unavailable');
  f.snapshot.automation.rules.pop();
  f.snapshot.automation.available = false;
  assert.equal(f.view().control.title, 'Control status unavailable');
  delete f.snapshot.automation;
  assert.equal(f.view().control.title, 'Control status unavailable');
});
