// Exercise raw Google thermostat data through mapping, dashboard guards and rule recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importSource } from './helpers/import-source.js';
import { DATA_SOURCE } from '../src/consts.js';
import { ClimateDashboard } from '../src/climate-dashboard.js';
import { ClimateAutomation } from '../src/climate-automation.js';
import { nativeSensorAllowsHeating } from '../src/temperature-sensor-setup.js';
import { temperatureControlView } from '../homebridge-ui/public/climate-utils.js';

const location = new URL('../src/plugins/thermostat.js', import.meta.url);
const parent = 'data:text/javascript,' + encodeURIComponent('export default class { static makeValidHKName(name) { return name; } }');
const source = (await fs.readFile(location, 'utf8')).replace(/from '([^']+)'/g, (match, specifier) =>
  'from ' + JSON.stringify(specifier === '../HomeKitDevice.js' ? parent : new URL(specifier, location).href),
);
const { processRawData } = await importSource(location, source);
const backplate = { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' };
const remote = { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: 'SENSOR' } };

function fixture() {
  const raw = {
    HOME: { source: DATA_SOURCE.GOOGLE, value: {} },
    DEVICE_THERMOSTAT: { source: DATA_SOURCE.GOOGLE, value: {
      device_identity: { serialNumber: 'T', softwareVersion: '6.2' },
      device_info: { typeName: 'nest.resource.NestLearningThermostat3Resource', pairerId: { resourceId: 'HOME' } },
      configuration_done: { deviceReady: true }, label: { label: 'Dining Room' },
      display_settings: { temperatureScale: 'TEMPERATURE_SCALE_F' },
      liveness: { status: 'LIVENESS_DEVICE_STATUS_ONLINE' },
      current_temperature: { temperatureValue: { temperature: { value: 23 } } },
      hvac_equipment_capabilities: { hasStage1Heat: true },
      hvac_control: { hvacState: {} }, eco_mode_state: { ecoMode: 'ECO_MODE_INACTIVE' },
      target_temperature_settings: { enabled: { value: true },
        targetTemperature: { setpointType: 'SET_POINT_TYPE_HEAT', heatingTarget: { value: 20.5 } } },
      remote_comfort_sensing_settings: { activeRcsSelection: backplate },
    } },
  };
  const map = () => {
    const mapped = processRawData(undefined, raw, { options: {} }, undefined,
      new Map([['DEVICE_THERMOSTAT', { fields: new Set(Object.keys(raw.DEVICE_THERMOSTAT.value)) }]]));
    assert.equal(mapped.T.full, true);
    return mapped.T.data;
  };
  return { raw, map };
}

test('raw backplate feedback survives mapping with or without optional sensor metadata', () => {
  const f = fixture();
  for (const metadata of [{}, { rcsControlMode: 'RCS_CONTROL_MODE_HOLD', associatedRcsSensors: [] },
    { rcsControlMode: 'RCS_CONTROL_MODE_SCHEDULE', associatedRcsSensors: [{ deviceId: { resourceId: 'SENSOR' } }] }]) {
    f.raw.DEVICE_THERMOSTAT.value.remote_comfort_sensing_settings = { ...metadata, activeRcsSelection: backplate };
    const data = f.map();
    assert.equal(data.active_rcs_sensor, '', 'the built-in sensor marker must survive the generic mapper');
    assert.equal(nativeSensorAllowsHeating(data), true);
    assert.equal(data.hvac_mode, 'heat');
    assert.equal(data.eco_mode, false);
  }
});

test('remote, built-in and unknown transitions reach the dashboard without retaining an old selection', () => {
  const f = fixture();
  const dashboard = new ClimateDashboard('/unused-sensor-feedback', { accounts: () => [] });
  for (const [selection, expected] of [[remote, 'SENSOR'], [backplate, ''], [{}, undefined], [backplate, '']]) {
    f.raw.DEVICE_THERMOSTAT.value.remote_comfort_sensing_settings = { activeRcsSelection: selection };
    dashboard.update('T', 'Thermostat', f.map(), 'A');
    const data = dashboard.devices.get('T').data;
    assert.equal(data.active_rcs_sensor, expected);
    assert.equal(nativeSensorAllowsHeating(data), expected === '');
  }
  delete f.raw.DEVICE_THERMOSTAT.value.remote_comfort_sensing_settings;
  dashboard.update('T', 'Thermostat', f.map(), 'A');
  assert.equal(dashboard.devices.get('T').data.active_rcs_sensor, undefined);
  assert.equal(nativeSensorAllowsHeating(dashboard.devices.get('T').data), false);
});

test('mapped third-generation backplate data runs a mixed room group and recovers after restart', async (t) => {
  const f = fixture();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mapped-climate-'));
  const engines = [];
  t.after(async () => {
    for (const engine of engines) {
      if (!engine.stopping) {
        await engine.stop();
      }
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const commands = [];
  const dashboard = new ClimateDashboard(directory, {
    accounts: () => [{ id: 'A', authorised: true, observing: true }],
    command: async (id, values, origin) => {
      assert.equal(origin.guard(), true);
      assert.equal(id, 'DEVICE_THERMOSTAT');
      assert.deepEqual(Object.keys(values), ['target_temperature_low']);
      commands.push(values);
      f.raw.DEVICE_THERMOSTAT.value.target_temperature_settings.targetTemperature.heatingTarget.value = values.target_temperature_low;
      dashboard.update('T', 'Thermostat', f.map(), 'A');
    },
  });
  dashboard.update('T', 'Thermostat', f.map(), 'A');
  const rule = { id: 'rooms', kind: 'temperature', name: 'Room group', enabled: true, thermostatId: 'T',
    sourceIds: ['nest:DEVICE_THERMOSTAT', 'room'], targetIds: [], aggregation: 'average', desiredTemperature: 22,
    maximumOffset: 1.5, minimumIntervalMinutes: 5 };
  const config = { snapshot: async () => ({ config: { options: {}, devices: [],
    rules: { temperature: [rule], fans: [], occupancy: [] } } }) };
  const access = { start: async () => {}, close() {}, refresh: async () => ({ sources: [
    { id: 'room', kind: 'temperature', available: true, temperature: 21, lastReadAt: Date.now() },
  ], bridges: [] }) };
  const start = async () => {
    const engine = new ClimateAutomation({ directory, dashboard, config, accessFactory: () => access });
    engines.push(engine);
    await engine.start({ schedule: false });
    return engine;
  };
  const engine = await start();
  assert.equal(commands.length, 1, 'the real mapper output must pass the target write guard');
  await engine.tick();
  assert.equal(engine.snapshot().rules[0].temperatureControl, 'active');
  assert.equal(dashboard.devices.get('T').data.hvac_state, 'off');
  await engine.stop();
  const count = commands.length;
  const restarted = await start();
  const state = restarted.snapshot().rules[0];
  assert.equal(state.paused, false);
  assert.equal(state.temperatureControl, 'interval');
  assert.equal(state.desiredTemperature, 22);
  assert.equal(commands.length, count, 'restart must retain the minimum update interval');
  const snapshot = dashboard.snapshot();
  assert.equal(temperatureControlView(snapshot.devices[0], snapshot).title, 'Climate rule · Room group');
  f.raw.DEVICE_THERMOSTAT.value.remote_comfort_sensing_settings = { activeRcsSelection: remote };
  dashboard.update('T', 'Thermostat', f.map(), 'A');
  await restarted.tick();
  assert.equal(restarted.snapshot().rules[0].paused, true);
  assert.equal(commands.length, count, 'native room-sensor selection must stop compensation');
});
