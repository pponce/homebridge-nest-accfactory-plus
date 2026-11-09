import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { DATA_SOURCE } from '../src/consts.js';
import { sensorControlState, sensorControlUpdate } from '../src/nest-sensor-control.js';

const source = await fs.readFile(new URL('../src/system.js', import.meta.url), 'utf8');
const begin = source.indexOf('  async #set(');
const end = source.indexOf('  async #get(', begin);
function setup() {
  const calls = [];
  const raw = {
    T: {
      source: DATA_SOURCE.GOOGLE,
      value: {
        eco_mode_state: { ecoMode: 'ECO_MODE_INACTIVE' },
        remote_comfort_sensing_settings: {
          associatedRcsSensors: [{ deviceId: { resourceId: 'S' } }],
          activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
        },
        fan_control_settings: { timerSpeed: 'FAN_SPEED_SETTING_STAGE1' },
      },
    },
  };
  const connection = {
    authorised: true,
    grpcTransport: {
      command: async (...args) => {
        calls.push(args);
        return { status: 0, data: [{ traitOperations: [{ progress: 'COMPLETE' }] }] };
      },
    },
  };
  const host = new Function(
    'connection',
    'raw',
    'crypto',
    'DATA_SOURCE',
    'sensorControlUpdate',
    'return new class { #connections = new Map([["A",connection]]); #rawData = raw; climateWrites = new Map();' +
      'run(values, origin) { return this.#set("A","T",values, origin); }' +
      source.slice(begin, end) +
      '};',
  )(connection, raw, crypto, DATA_SOURCE, sensorControlUpdate);
  return { calls, raw, connection, host };
}
test('Eco uses per-device resource commands with explicit manual/inactive modes', async () => {
  const f = setup();
  for (const value of [true, false]) {
    await f.host.run({ eco_mode: value });
  }
  assert.equal(f.calls[0][2], 'SendCommand');
  assert.equal(f.calls[0][3].resourceCommands[0].command.value.ecoMode, 'ECO_MODE_MANUAL_ECO');
  assert.equal(f.calls[1][3].resourceCommands[0].command.value.ecoMode, 'ECO_MODE_INACTIVE');
  assert.equal(f.calls[0][3].resourceCommands[0].command.value.setAll, false);
  assert.equal(f.raw.T.value.eco_mode_state.ecoMode, 'ECO_MODE_INACTIVE');
});
test('sensor selection writes the associated thermostat and preserves other settings', async () => {
  const f = setup();
  await f.host.run({ temperature_sensor: 'S' });
  const update = f.calls[0][3].batchUpdateStateRequest[0];
  assert.equal(update.traitRequest.resourceId, 'T');
  assert.equal(update.state.value.activeRcsSelection.activeRcsSensor.resourceId, 'S');
  assert.equal(update.state.value.associatedRcsSensors.length, 1);
  await f.host.run({ temperature_sensor: '' });
  assert.deepEqual(f.calls[1][3].batchUpdateStateRequest[0].state.value.activeRcsSelection, { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' });
  await assert.rejects(f.host.run({ temperature_sensor: 'FOREIGN' }), AggregateError);
  assert.equal(f.calls.length, 2);
});
test('native sensor hold is one guarded trait write and does not optimistically modify observed state', async () => {
  const f = setup();
  const settings = f.raw.T.value.remote_comfort_sensing_settings;
  settings.rcsControlMode = 'RCS_CONTROL_MODE_SCHEDULE';
  settings.activeRcsSelection = { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: 'S' } };
  settings.rcsControlSchedule = { intervals: { 0: { rcsSelection: structuredClone(settings.activeRcsSelection), startSecondsInDay: 0 } } };
  const before = structuredClone(settings);
  const state = sensorControlState(settings);
  await f.host.run({ native_sensor_control: { action: 'hold', expected: state.signature } }, { automation: true });
  assert.equal(f.calls.length, 1);
  const updates = f.calls[0][3].batchUpdateStateRequest;
  assert.equal(updates.length, 1);
  assert.equal(updates[0].traitRequest.resourceId, 'T');
  assert.equal(updates[0].traitRequest.traitLabel, 'remote_comfort_sensing_settings');
  const held = updates[0].state.value;
  assert.equal(held.rcsControlMode, 'RCS_CONTROL_MODE_HOLD');
  assert.deepEqual(held.rcsControlSchedule, before.rcsControlSchedule);
  assert.deepEqual(held.associatedRcsSensors, before.associatedRcsSensors);
  assert.deepEqual(settings, before);
  // A later cloud observation, not command acceptance, supplies the held state.
  f.raw.T.value.remote_comfort_sensing_settings = structuredClone(held);
  await f.host.run(
    { native_sensor_control: { action: 'restore', expected: state.holdSignature, control: state.control } },
    { automation: true },
  );
  assert.deepEqual(f.calls[1][3].batchUpdateStateRequest[0].state.value, before);
});
test('native sensor changes reject concurrent settings edits and API denial', async () => {
  const f = setup();
  const settings = f.raw.T.value.remote_comfort_sensing_settings;
  settings.rcsControlMode = 'RCS_CONTROL_MODE_SCHEDULE';
  const state = sensorControlState(settings);
  settings.rcsControlSchedule = { intervals: {} };
  await assert.rejects(f.host.run({ native_sensor_control: { action: 'hold', expected: state.signature } }), AggregateError);
  assert.equal(f.calls.length, 0);
  f.connection.grpcTransport.command = async () => ({ status: 7, data: [] });
  await assert.rejects(
    f.host.run({ native_sensor_control: { action: 'hold', expected: sensorControlState(settings).signature } }),
    AggregateError,
  );
  assert.equal(settings.rcsControlMode, 'RCS_CONTROL_MODE_SCHEDULE');
});
test('native sensor control requires Google and preserves manual thermostat precedence', async () => {
  const f = setup();
  f.raw.T.value.remote_comfort_sensing_settings.rcsControlMode = 'RCS_CONTROL_MODE_HOLD';
  let manual = 0;
  f.host.automation = { manualThermostat: async () => {
    manual += 1;
  } };
  const command = {
    native_sensor_control: { action: 'hold', expected: sensorControlState(f.raw.T.value.remote_comfort_sensing_settings).signature },
  };
  await f.host.run(command, { automation: true });
  assert.equal(manual, 0);
  await f.host.run(command);
  assert.equal(manual, 1);
  f.raw.T.source = DATA_SOURCE.NEST;
  await assert.rejects(f.host.run(command, { automation: true }), AggregateError);
  assert.equal(f.calls.length, 2);
});
test('Eco rejects unavailable capability, malformed values and API denial', async () => {
  const f = setup();
  await assert.rejects(f.host.run({ eco_mode: 'yes' }), AggregateError);
  f.connection.grpcTransport.command = async () => ({ status: 7, data: [] });
  await assert.rejects(f.host.run({ eco_mode: true }), AggregateError);
  delete f.raw.T.value.eco_mode_state;
  await assert.rejects(f.host.run({ eco_mode: true }), AggregateError);
});
test('fan timer writes a future deadline even for a running fan', async () => {
  const f = setup();
  f.raw.T.value.fan_control_settings.timerEnd = { seconds: 1 };
  const now = Date.now();
  await f.host.run({ fan_state: true, fan_duration: 900, fan_timer_speed: 1 });
  const value = f.calls[0][3].batchUpdateStateRequest[0].state.value;
  assert.ok(value.timerEnd.seconds >= Math.floor(now / 1000) + 900);
  assert.equal(value.timerSpeed, 'FAN_SPEED_SETTING_STAGE1');
  await f.host.run({ fan_state: true, fan_preset_duration: 1800, fan_duration: 900, fan_timer_speed: 1 });
  assert.ok(f.calls[1][3].batchUpdateStateRequest[0].state.value.timerEnd.seconds >= Math.floor(now / 1000) + 1800);
});
const thermostat = await fs.readFile(new URL('../src/plugins/thermostat.js', import.meta.url), 'utf8');
const methods = thermostat.slice(thermostat.indexOf('  setupClimateSwitches('), thermostat.indexOf('  onRemove() {'));
function switches(data) {
  const serviceType = 'Switch';
  const characteristic = 'On';
  const services = new Map();
  const timers = [];
  const device = new Function('setTimeout', 'clearTimeout', 'return new class {' + methods + '};')(
    (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    () => {},
  );
  Object.assign(device, {
    deviceData: { description: 'Nest', nest_google_device_uuid: 'T', ...data },
    presetServices: new Map(),
    presetTimers: new Map(),
    hap: { Service: { Switch: serviceType }, Characteristic: { On: characteristic } },
    accessory: { getServiceById: (_, id) => services.get(id) },
    addService: (_, name, id) => {
      if (!services.has(id)) {
        services.set(id, {
          name,
          updateCharacteristic: (_, value) => {
            services.get(id).value = value;
          },
        });
      }
      return services.get(id);
    },
    addCharacteristic: (service, _, options) => Object.assign(service, options),
    removeService: (service) => {
      for (const [key, value] of services) {
        if (service === value) {
          services.delete(key);
        }
      }
    },
    set: async (values) => {
      device.lastSet = values;
    },
  });
  return { device, services, timers };
}
test('optional switches are absent by default, stable on repeated setup and removed when disabled', () => {
  const f = switches({ eco_mode: false, has_fan: true });
  f.device.setupClimateSwitches();
  assert.equal(f.services.size, 0);
  f.device.deviceData.ecoSwitch = true;
  f.device.deviceData.fanPresetSwitches = true;
  f.device.setupClimateSwitches();
  const eco = f.services.get('climate-eco');
  assert.equal(f.services.size, 4);
  f.device.setupClimateSwitches();
  assert.equal(f.services.get('climate-eco'), eco);
  f.device.deviceData.ecoSwitch = false;
  f.device.deviceData.has_fan = false;
  f.device.setupClimateSwitches();
  assert.equal(f.services.size, 0);
});
test('preset switch awaits command, resets after acceptance, and propagates errors', async () => {
  const f = switches({ has_fan: true, fanPresetSwitches: true, fan_timer_speed: 2 });
  f.device.setupClimateSwitches();
  const service = f.services.get('climate-fan-30');
  await service.onSet(true);
  assert.equal(f.device.lastSet.fan_preset_duration, 1800);
  assert.equal(Object.hasOwn(f.device.lastSet, 'fan_duration'), false);
  assert.equal(f.device.lastSet.fan_timer_speed, 2);
  f.timers[0]();
  assert.equal(service.value, false);
  f.device.set = async () => {
    throw new Error('failed');
  };
  await assert.rejects(service.onSet(true), /failed/);
  await assert.rejects(f.device.runFanPreset(999));
});

