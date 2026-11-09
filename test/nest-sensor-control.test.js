import test from 'node:test';
import assert from 'node:assert/strict';
import { sensorControlState, sensorControlUpdate } from '../src/nest-sensor-control.js';

const sensor = (id) => ({ rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: id } });
const fixture = () => ({
  rcsControlMode: 'RCS_CONTROL_MODE_SCHEDULE',
  activeRcsSelection: sensor('bedroom'),
  rcsControlSchedule: { intervals: { 0: { rcsSelection: sensor('bedroom'), startSecondsInDay: 0, endSecondsInDay: 21600 } } },
  associatedRcsSensors: [{ deviceId: { resourceId: 'bedroom' }, vendorId: 1, productId: 2 }],
});

test('sensor hold and restoration preserve the full native schedule and sensor associations', () => {
  const original = fixture();
  const before = structuredClone(original);
  const state = sensorControlState(original);
  assert.equal(state.supported, true);
  assert.equal(state.mode, 'schedule');
  assert.equal(state.source, 'remote');
  assert.equal(state.sensorId, 'bedroom');
  assert.match(state.signature, /^[a-f0-9]{64}$/);
  const held = sensorControlUpdate(original, { action: 'hold', expected: state.signature });
  assert.equal(held.rcsControlMode, 'RCS_CONTROL_MODE_HOLD');
  assert.deepEqual(held.activeRcsSelection, { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' });
  assert.deepEqual(held.rcsControlSchedule, original.rcsControlSchedule);
  assert.deepEqual(held.associatedRcsSensors, original.associatedRcsSensors);
  assert.equal(sensorControlState(held).signature, state.holdSignature);
  const restored = sensorControlUpdate(held, { action: 'restore', expected: state.holdSignature, control: state.control });
  assert.deepEqual(restored, before);
  assert.deepEqual(original, before);
  assert.notEqual(held.rcsControlSchedule, original.rcsControlSchedule);
  assert.notEqual(restored.activeRcsSelection, state.control.selection);
});

test('signature is stable across object ordering but detects schedule or association edits', () => {
  const original = fixture();
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(sensorControlState(reordered).signature, sensorControlState(original).signature);
  const held = sensorControlUpdate(original, { action: 'hold', expected: sensorControlState(original).signature });
  const current = sensorControlState(held);
  held.rcsControlSchedule.intervals[0].endSecondsInDay = 43200;
  assert.notEqual(sensorControlState(held).signature, current.signature);
  assert.throws(
    () => sensorControlUpdate(held, { action: 'restore', expected: current.signature, control: sensorControlState(original).control }),
    /changed/,
  );
  const reassociated = structuredClone(original);
  reassociated.associatedRcsSensors.push({ deviceId: { resourceId: 'office' } });
  assert.notEqual(sensorControlState(reassociated).signature, sensorControlState(original).signature);
});

test('missing and unsupported native state cannot authorize an automatic sensor change', () => {
  const invalid = [
    undefined, null, [], {},
    { ...fixture(), rcsControlMode: 'RCS_CONTROL_MODE_UNSPECIFIED' },
    { ...fixture(), rcsControlMode: 'toString' },
    { ...fixture(), associatedRcsSensors: undefined },
    { ...fixture(), associatedRcsSensors: [{ deviceId: {} }] },
    { ...fixture(), associatedRcsSensors: [null] },
    { ...fixture(), associatedRcsSensors: [{ deviceId: { resourceId: '' } }] },
    { ...fixture(), activeRcsSelection: null },
    { ...fixture(), activeRcsSelection: {} },
    { ...fixture(), activeRcsSelection: sensor('foreign') },
    { ...fixture(), activeRcsSelection: { ...sensor('bedroom'), extra: true } },
    {
      ...fixture(),
      activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE', activeRcsSensor: { resourceId: 'bedroom' } },
    },
    { ...fixture(), activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_MULTI_SENSOR' } },
    { ...fixture(), activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: '' } } },
    {
      ...fixture(),
      activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: 'bedroom', extra: true } },
    },
    { ...fixture(), sensorSelection: { isThermostatSelected: true, sensorsWithWeaveIds: [] } },
    { ...fixture(), sensorSelection: {} },
    { ...fixture(), multiSensorSettings: null },
    { ...fixture(), multiSensorSettings: {} },
    { ...fixture(), multiSensorSettings: { multiSensorEnabled: true, multiSensorGroup: [] } },
    { ...fixture(), multiSensorSettings: { multiSensorEnabled: false, multiSensorGroup: ['bedroom'] } },
    { ...fixture(), multiSensorSettings: { multiSensorEnabled: false, multiSensorGroup: {} } },
  ];
  for (const settings of invalid) {
    const state = sensorControlState(settings);
    assert.equal(state.supported, false);
    assert.equal(state.source, 'unknown');
    assert.equal(state.control, null);
    assert.equal(state.holdSignature, null);
    assert.throws(() => sensorControlUpdate(settings, { action: 'hold', expected: state.signature }));
  }
  assert.equal(sensorControlState(undefined).reported, false);
  assert.equal(sensorControlState({}).reported, true);
});

test('explicitly disabled multi-sensor settings are retained without enabling native averaging', () => {
  for (const multiSensorSettings of [{ multiSensorEnabled: false }, { multiSensorEnabled: false, multiSensorGroup: [] }]) {
    const settings = { ...fixture(), multiSensorSettings };
    const state = sensorControlState(settings);
    assert.equal(state.supported, true);
    assert.deepEqual(sensorControlUpdate(settings, { action: 'hold', expected: state.signature }).multiSensorSettings, multiSensorSettings);
  }
});

test('malformed or stale commands cannot write replacement sensor settings', () => {
  const original = fixture();
  const state = sensorControlState(original);
  for (const command of [null, [], {}, { action: 'hold', expected: 1 }, { action: 'hold', expected: 'stale' },
    { action: 'unknown', expected: state.signature }, { action: 'hold', expected: state.signature, extra: true },
    { action: 'hold', expected: state.signature, control: state.control },
    { action: 'restore', expected: state.signature, control: state.control }]) {
    assert.throws(() => sensorControlUpdate(original, command));
  }
  const held = sensorControlUpdate(original, { action: 'hold', expected: state.signature });
  for (const control of [null, {}, { mode: 'RCS_CONTROL_MODE_UNSPECIFIED', selection: sensor('bedroom') },
    { ...state.control, extra: true }, { mode: state.control.mode, selection: sensor('foreign') }]) {
    assert.throws(() => sensorControlUpdate(held, { action: 'restore', expected: state.holdSignature, control }));
  }
});

test('known native hold and schedule-override modes round trip without altering saved schedules', () => {
  for (const mode of ['RCS_CONTROL_MODE_HOLD', 'RCS_CONTROL_MODE_SCHEDULE_OVERRIDE']) {
    const original = { ...fixture(), rcsControlMode: mode };
    const state = sensorControlState(original);
    assert.equal(state.supported, true);
    const held = sensorControlUpdate(original, { action: 'hold', expected: state.signature });
    assert.deepEqual(sensorControlUpdate(held, { action: 'restore', expected: state.holdSignature, control: state.control }), original);
  }
});
