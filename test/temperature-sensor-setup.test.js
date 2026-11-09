import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClimateAutomation } from '../src/climate-automation.js';
import { ClimateDashboard } from '../src/climate-dashboard.js';
import { sensorControlState, sensorControlUpdate } from '../src/nest-sensor-control.js';
import { nativeSensorAllowsHeating, TemperatureSensorSetup } from '../src/temperature-sensor-setup.js';

const minute = 60000;
const schedule = () => ({
  rcsControlMode: 'RCS_CONTROL_MODE_SCHEDULE',
  activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: 'S' } },
  associatedRcsSensors: [{ deviceId: { resourceId: 'S' } }],
  rcsControlSchedule: {
    intervals: {
      0: {
        rcsSelection: {
          rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR',
          activeRcsSensor: { resourceId: 'S' },
        },
        startSecondsInDay: 0,
        endSecondsInDay: 3600,
      },
    },
  },
});
const rule = () => ({
  id: 'mixed',
  name: 'Mixed rooms',
  kind: 'temperature',
  enabled: true,
  thermostatId: 'T',
  sourceIds: ['nest:S', 'room'],
  targetIds: [],
  aggregation: 'average',
  desiredTemperature: 21,
  maximumOffset: 1.5,
  minimumIntervalMinutes: 5,
});

async function fixture(t, initial = schedule()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sensor-setup-'));
  let now = Date.now();
  let native = structuredClone(initial);
  let acknowledgeTarget = true;
  let failure = false;
  const commands = [];
  const rules = { temperature: [rule()], fans: [], occupancy: [] };
  const accounts = [{ id: 'A', authorised: true, observing: true }];
  const dashboard = new ClimateDashboard(directory, {
    accounts: () => accounts,
    command: async (id, values, origin) => {
      assert.equal(origin.automation, true);
      assert.equal(origin.guard(), true);
      commands.push({ id, ...values });
      if (failure) {
        throw new Error('unavailable');
      }
      if (values.native_sensor_control) {
        sensorControlUpdate(native, values.native_sensor_control);
      }
      if (acknowledgeTarget && Number.isFinite(values.target_temperature_low)) {
        dashboard.update('T', 'Thermostat', { target_temperature_low: values.target_temperature_low }, 'A');
      }
    },
  });
  dashboard.update(
    'T',
    'Thermostat',
    {
      nest_google_device_uuid: 'thermostat',
      online: true,
      description: 'Downstairs',
      physical_temperature: 22,
      target_temperature_low: 19,
      temperature_scale: 'C',
      hvac_mode: 'heat',
      hvac_state: 'off',
      can_heat: true,
      eco_mode: false,
      schedules: {},
      linked_rcs_sensors: ['S'],
      active_rcs_sensor: initial.activeRcsSelection?.rcsSourceType === 'RCS_SOURCE_TYPE_BACKPLATE' ? '' : 'S',
      native_sensor_control: sensorControlState(native),
    },
    'A',
  );
  dashboard.update('S', 'TemperatureSensor', { nest_google_device_uuid: 'S', current_temperature: 20, online: true }, 'A');
  const config = { snapshot: async () => ({ config: { rules: structuredClone(rules), devices: [] } }) };
  const access = {
    start: async () => {},
    close() {},
    refresh: async () => ({
      sources: [{ id: 'room', kind: 'temperature', temperature: 20, available: true, lastReadAt: now }],
      bridges: [],
    }),
  };
  const engine = new ClimateAutomation({ directory, dashboard, config, accessFactory: () => access, now: () => now });
  const snapshot = dashboard.snapshot.bind(dashboard);
  dashboard.snapshot = () => ({ ...snapshot(), generatedAt: now });
  t.after(async () => {
    await engine.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await engine.start({ schedule: false });
  const observe = (settings) => {
    native = structuredClone(settings);
    const state = sensorControlState(native);
    dashboard.update(
      'T',
      'Thermostat',
      {
        native_sensor_control: state,
        active_rcs_sensor: state.source === 'thermostat' ? '' : state.source === 'remote' ? state.sensorId : undefined,
      },
      'A',
    );
  };
  return {
    engine, dashboard, directory, rules, accounts, commands, observe,
    status: () => engine.snapshot().rules.find((entry) => entry.id === 'mixed')?.sensorSetup,
    action: (action) => engine.control({
      id: 'mixed',
      action,
      confirmation: engine.snapshot().rules.find((entry) => entry.id === 'mixed').sensorSetup.confirmation,
    }),
    acknowledge: () => {
      const command = commands.filter((entry) => entry.native_sensor_control).at(-1);
      observe(sensorControlUpdate(native, command.native_sensor_control));
    },
    targetFeedback: (value) => dashboard.update('T', 'Thermostat', { target_temperature_low: value }, 'A'),
    targetAck: (value) => {
      acknowledgeTarget = value;
    },
    fail: (value) => {
      failure = value;
    },
    advance: async (ms = 15000) => {
      now += ms;
      await engine.tick();
    },
  };
}

test('saving an enabled mixed group waits for explicit current confirmation without sensor or heat writes', async (t) => {
  const f = await fixture(t);
  assert.equal(f.status().phase, 'required');
  assert.equal(f.status().canPrepare, true);
  assert.equal(f.commands.length, 0);
  await assert.rejects(f.engine.control({ id: 'mixed', action: 'prepareSensors' }), /changed/);
  await assert.rejects(f.engine.control({ id: 'mixed', action: 'prepareSensors', confirmation: 'stale' }), /changed/);
  assert.equal(f.commands.length, 0);
  f.rules.temperature[0].enabled = false;
  await f.advance();
  assert.equal(f.status().canPrepare, false);
});

test('preparation preserves the native schedule and waits for a fresh exact cloud echo before heating', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].native_sensor_control.action, 'hold');
  assert.equal(f.status().phase, 'preparing');
  f.targetFeedback(19);
  await f.advance();
  assert.equal(f.commands.length, 1);
  const held = sensorControlUpdate(schedule(), f.commands[0].native_sensor_control);
  assert.deepEqual(held.rcsControlSchedule, schedule().rcsControlSchedule);
  f.dashboard.devices.get('T').data.native_sensor_control = sensorControlState(held);
  f.dashboard.devices.get('T').data.active_rcs_sensor = '';
  await f.advance();
  assert.equal(f.commands.length, 1, 'unchanged observation revision cannot acknowledge a write');
  f.observe(held);
  await f.advance();
  assert.equal(f.status().phase, 'held');
  assert.equal(f.status().canRestore, true);
  assert.equal(f.commands.length, 2);
  assert.equal(f.commands[1].target_temperature_low, 22.5);
});

test('a rule edit invalidates confirmation and a ready native hold needs no setup command', async (t) => {
  const f = await fixture(t);
  const confirmation = f.status().confirmation;
  f.rules.temperature[0].desiredTemperature = 20;
  await assert.rejects(f.engine.control({ id: 'mixed', action: 'prepareSensors', confirmation }), /changed/);
  assert.equal(f.commands.length, 0);
  const held = {
    ...schedule(),
    rcsControlMode: 'RCS_CONTROL_MODE_HOLD',
    activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
  };
  f.observe(held);
  await f.advance();
  assert.equal(f.status().phase, 'ready');
  assert.equal(f.status().canPrepare, false);
  assert.equal(f.commands.length, 1);
  assert.ok(Number.isFinite(f.commands[0].target_temperature_low));
});

test('unknown native averaging never appears as a ready built-in sensor', async (t) => {
  const f = await fixture(t, {
    ...schedule(),
    sensorSelection: { isThermostatSelected: true, sensorsWithWeaveIds: [{ resourceId: 'S' }] },
  });
  f.dashboard.devices.get('T').data.active_rcs_sensor = '';
  await f.advance();
  assert.equal(f.status().phase, 'unsupported');
  assert.equal(f.status().canPrepare, false);
  assert.equal(f.commands.length, 0);
  assert.equal(nativeSensorAllowsHeating(f.dashboard.devices.get('T').data), false);
  assert.equal(nativeSensorAllowsHeating({ active_rcs_sensor: '', native_sensor_control: { reported: false } }), true);
  assert.equal(nativeSensorAllowsHeating({ active_rcs_sensor: undefined }), false);
});

test('manual controls during preparation keep the group paused after sensor acknowledgement', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  await f.engine.manualThermostat('thermostat');
  f.acknowledge();
  await f.advance();
  assert.equal(f.status().phase, 'held');
  assert.equal(f.engine.states.get('mixed').paused, true);
  assert.equal(f.commands.length, 1);
});

test('native changes during preparation reject stale restoration and never overwrite the new choice', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.observe({ ...schedule(), rcsControlMode: 'RCS_CONTROL_MODE_SCHEDULE_OVERRIDE' });
  await f.advance();
  assert.equal(f.status().phase, 'changed');
  assert.equal(f.status().canRestore, false);
  await assert.rejects(f.action('restoreSensors'), /changed/);
  assert.equal(f.commands.length, 1);
});

test('failed and timed-out preparation has no automatic retry and retains recovery state', async (t) => {
  const f = await fixture(t);
  f.fail(true);
  await f.action('prepareSensors');
  assert.equal(f.status().phase, 'uncertain');
  await f.advance(3 * minute);
  assert.equal(f.commands.length, 1);
  f.fail(false);
  f.acknowledge();
  await f.advance();
  assert.equal(f.status().phase, 'held');
  assert.equal(f.engine.states.get('mixed').paused, true);
  const g = await fixture(t);
  await g.action('prepareSensors');
  await g.advance(3 * minute);
  assert.equal(g.status().phase, 'uncertain');
  assert.equal(g.commands.length, 1);
});

test('deleting a group during preparation retains its recovery record and restoration remains available', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.rules.temperature = [];
  await f.advance();
  assert.equal(f.engine.states.has('mixed'), true);
  f.acknowledge();
  await f.advance();
  assert.equal(f.commands.length, 1);
  assert.equal(f.engine.snapshot().sensorSetups[0].canRestore, true);
  await f.action('restoreSensors');
  assert.equal(f.commands[1].native_sensor_control.action, 'restore');
  assert.equal(f.status().phase, 'restoring');
  f.acknowledge();
  await f.advance();
  assert.equal(f.engine.sensorSetup.leases.size, 0);
  assert.equal(f.engine.states.has('mixed'), false);
});

test('native restoration waits until the compensated heating target is confirmed restored', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.acknowledge();
  await f.advance();
  await f.advance();
  f.targetAck(false);
  await f.action('restoreSensors');
  assert.equal(f.status().phase, 'restore_wait');
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  assert.equal(f.commands.filter((entry) => entry.native_sensor_control).length, 1);
  await f.advance();
  assert.equal(f.commands.filter((entry) => entry.native_sensor_control).length, 1);
  f.targetFeedback(19);
  await f.advance();
  assert.equal(f.commands.at(-1).native_sensor_control.action, 'restore');
  f.acknowledge();
  await f.advance();
  assert.equal(f.engine.sensorSetup.leases.size, 0);
  assert.equal(f.engine.states.get('mixed').paused, true);
});

test('a later native schedule change relinquishes heating ownership and blocks old restoration', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.acknowledge();
  await f.advance();
  const token = f.status().confirmation;
  const held = structuredClone(f.dashboard.devices.get('T').data.native_sensor_control.control);
  f.observe({ ...schedule(), rcsControlMode: held.mode, activeRcsSelection: held.selection, rcsControlSchedule: { intervals: {} } });
  await f.advance();
  assert.equal(f.status().phase, 'changed');
  assert.equal(f.status().canRestore, false);
  assert.equal(f.engine.leases.size, 0);
  await assert.rejects(f.engine.control({ id: 'mixed', action: 'restoreSensors', confirmation: token }), /changed/);
  assert.equal(f.commands.length, 2);
});

test('restoration failures do not retry and late readback can still finish recovery', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.rules.temperature[0].enabled = false;
  f.acknowledge();
  await f.advance();
  f.fail(true);
  await f.action('restoreSensors');
  assert.equal(f.status().phase, 'uncertain');
  await f.advance();
  assert.equal(f.commands.length, 2);
  f.fail(false);
  f.acknowledge();
  await f.advance();
  assert.equal(f.engine.sensorSetup.leases.size, 0);
});

test('restart preserves recovery information without replaying sensor commands', async (t) => {
  const f = await fixture(t);
  await f.action('prepareSensors');
  f.acknowledge();
  f.rules.temperature[0].enabled = false;
  await f.advance();
  const saved = JSON.parse(await fs.readFile(path.join(f.directory, 'automation.json'), 'utf8'));
  const restored = new TemperatureSensorSetup(f.engine);
  restored.load(saved.sensorSetups);
  assert.equal(restored.leases.get('T').beforeRevision, 0);
  f.engine.sensorSetup = restored;
  await f.advance();
  assert.equal(f.status().canRestore, true);
  assert.equal(f.commands.length, 1);
  restored.leases.get('T').phase = 'restore_wait';
  const again = new TemperatureSensorSetup(f.engine);
  again.load(restored.entries());
  assert.equal(again.leases.get('T').phase, 'held');
  assert.throws(() => again.load({}), /Invalid/);
  assert.throws(() => again.load([['T', {}]]), /Invalid/);
});

test('offline setup and changed thermostat assignments never gain another native lease', async (t) => {
  const f = await fixture(t);
  f.accounts[0].observing = false;
  await f.advance();
  assert.equal(f.status().canPrepare, false);
  assert.match(f.status().reason, /unavailable/);
  f.accounts[0].observing = true;
  await f.action('prepareSensors');
  f.rules.temperature[0].thermostatId = 'OTHER';
  await f.advance();
  assert.equal(f.status().canPrepare, false);
  f.acknowledge();
  await f.advance();
  assert.equal(f.status().canRestore, true);
  assert.equal(f.commands.length, 1);
});
