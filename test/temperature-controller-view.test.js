import test from 'node:test';
import assert from 'node:assert/strict';
import { temperatureControlView } from '../homebridge-ui/public/climate-utils.js';
import { sensorControlState } from '../src/nest-sensor-control.js';

function fixture() {
  const device = { serial: 'T', data: {
    native_sensor_control: sensorControlState({
      rcsControlMode: 'RCS_CONTROL_MODE_HOLD', activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
    }),
  } };
  const snapshot = { devices: [device], automation: { available: true, rules: [] } };
  const rule = { id: 'rooms', kind: 'temperature', name: 'Room average', thermostatId: 'T', enabled: true };
  return { device, snapshot, rule, view: (live = true) => temperatureControlView(device, snapshot, live) };
}

test('a known built-in sensor is displayed without a paired-sensor list or automatic-setup support', () => {
  const f = fixture();
  assert.equal(f.device.data.native_sensor_control.supported, false);
  assert.equal(f.view().title, 'Thermostat sensor');
  assert.equal(f.view().label, 'Native Nest control');
  assert.equal(f.view().sensors.length, 1);
  assert.equal(f.view().sensors[0].label, 'Selected by Nest');
  assert.deepEqual(f.view().rules, []);
});

test('only paired or reported selected Nest sensors and this thermostat’s temperature rules are listed', () => {
  const f = fixture();
  f.device.data.linked_rcs_sensors = ['S', 'S'];
  f.snapshot.devices.push({ type: 'TemperatureSensor', id: 'S', data: { description: 'Bedroom Nest sensor' } });
  f.snapshot.devices.push({ type: 'TemperatureSensor', id: 'other', data: { description: 'Unpaired sensor' } });
  f.snapshot.automation.rules = [
    { ...f.rule, temperatureControl: 'active' },
    { ...f.rule, id: 'another', thermostatId: 'U', temperatureControl: 'active' },
    { ...f.rule, id: 'fan', kind: 'fan', temperatureControl: 'active' },
    { ...f.rule, id: 'home', kind: 'presence', temperatureControl: 'active' },
    { ...f.rule, id: 'draft', enabled: false },
  ];
  assert.deepEqual(f.view().sensors.map((entry) => entry.name), ['Thermostat sensor', 'Bedroom Nest sensor']);
  assert.deepEqual(f.view().rules.map((entry) => entry.id), ['rooms', 'draft']);
  assert.equal(f.view().title, 'Climate rule · Room average');
  assert.equal(f.view().sensors[0].label, 'Nest sensor in use');
  f.device.data.native_sensor_control.selection = { source: 'remote', sensorId: 'other' };
  f.snapshot.automation.rules = [];
  assert.equal(f.view().title, 'Unpaired sensor', 'A reported selection remains readable independently of its association list');
});

test('applied rules remain distinguishable from feedback waits, restoration and merely enabled rules', () => {
  const f = fixture();
  for (const status of ['active', 'interval', 'updating', 'restoring', 'paused', 'disabled', 'waiting', 'unavailable']) {
    f.snapshot.automation.rules = [{ ...f.rule, temperatureControl: status }];
    const view = f.view();
    assert.equal(view.rules[0].status, status);
    if (['active', 'interval', 'updating', 'restoring'].includes(status)) {
      assert.equal(view.title, 'Climate rule · Room average');
      assert.equal(view.tone === 'good', ['active', 'interval'].includes(status));
    } else {
      assert.equal(view.title, status === 'unavailable' ? 'Control status unavailable' : 'Thermostat sensor');
    }
  }
  f.snapshot.automation.rules = [{ ...f.rule, temperatureControl: 'active', paused: true }];
  assert.equal(f.view().title, 'Thermostat sensor');
  assert.equal(f.view().rules[0].label, 'Paused');
  f.snapshot.automation.rules = [{ ...f.rule, enabled: false, temperatureControl: 'active' }];
  assert.equal(f.view().rules[0].label, 'Disabled');
  f.snapshot.automation.rules = [{ ...f.rule }];
  assert.equal(f.view().title, 'Control status unavailable', 'Enablement alone is not evidence of control');
});

test('missing selection, disconnection, engine failure and ambiguous controllers are never shown as active', () => {
  const f = fixture();
  f.device.data.native_sensor_control.selection = { source: 'unknown' };
  assert.equal(f.view().title, 'Current sensor not reported');
  assert.ok(f.view().sensors.every((entry) => entry.label === 'Not selected'));
  f.snapshot.automation.rules = [{ ...f.rule, temperatureControl: 'active' }];
  assert.equal(f.view(false).title, 'Control status unavailable');
  f.snapshot.automation.error = 'Checks failed';
  assert.equal(f.view().title, 'Control status unavailable');
  f.snapshot.automation.error = null;
  f.snapshot.automation.available = false;
  assert.equal(f.view().title, 'Control status unavailable');
  f.snapshot.automation.available = true;
  f.snapshot.automation.rules.push({ ...f.rule, id: 'conflict', temperatureControl: 'active' });
  assert.equal(f.view().title, 'Control status unavailable');
});
