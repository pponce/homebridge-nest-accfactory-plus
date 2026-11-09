// Verify humidifier capability changes preserve automatic mode and existing service identity.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import hap from './helpers/homebridge-hap.js';
import test from 'node:test';
import { URL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { DATA_SOURCE } from '../src/consts.js';

let parent = 'data:text/javascript,' + encodeURIComponent('export default class { constructor(data) { this.deviceData = data; } }');
let location = new URL('../src/plugins/thermostat.js', import.meta.url);
let source = (await readFile(location, 'utf8')).replace(/from '([^']+)'/g, (match, specifier) => {
  return (
    'from ' +
    JSON.stringify(
      specifier === '../HomeKitDevice.js' ? parent : specifier.startsWith('.') === true ? new URL(specifier, location).href : specifier,
    )
  );
});
// Expose the existing setup boundary without changing its body or production visibility.
source = source.replaceAll('#setupHumidifierDehumidifier', 'setupHumidityForTest').replaceAll('#external', 'externalForTest');
let { default: Thermostat, processRawData } = await import('data:text/javascript,' + encodeURIComponent(source));

test('thermostat callbacks propagate asynchronous failures through the HAP write boundary', async () => {
  // Exercise the registered callback bodies without running unrelated accessory setup.
  let callbacks = [...source.matchAll(/onSet: \(value\) => \{\s*((?:return )?this\.(set\w+)\([^;]+\);)\s*\}/g)].filter((match) =>
    ['setDisplayUnit', 'setTemperature', 'setMode', 'setHumidifierDehumidifierThreshold'].includes(match[2]),
  );
  assert.equal(callbacks.length, 7);
  for (let [, body, method] of callbacks) {
    let pending = Promise.withResolvers();
    let target = { hap, [method]: () => pending.promise };
    let characteristic = new hap.Characteristic.TargetTemperature();
    let initial = characteristic.value;
    characteristic.onSet(new Function('value', body).bind(target));
    let rejected = assert.rejects(characteristic.handleSetRequest(25));
    pending.reject(new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
    await rejected;
    assert.equal(characteristic.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    assert.equal(characteristic.value, initial);
  }
});

for (let firstSource of [DATA_SOURCE.NEST, DATA_SOURCE.GOOGLE]) {
  test('thermostat mapper ignores REST with raw data arriving first from ' + firstSource, () => {
    let nest = ['device.nest', { source: DATA_SOURCE.NEST, value: { serial_number: 'SERIAL', backplate_temperature: 19 } }];
    let google = [
      'DEVICE_GOOGLE',
      {
        source: DATA_SOURCE.GOOGLE,
        value: {
          device_identity: { serialNumber: 'SERIAL' },
          device_info: { typeName: 'nest.resource.NestLearningThermostat3Resource', pairerId: { resourceId: 'STRUCTURE_HOME' } },
          configuration_done: { deviceReady: true },
          current_temperature: { temperatureValue: { temperature: { value: 21 } } },
        },
      },
    ];
    let raw = {
      ...Object.fromEntries(firstSource === DATA_SOURCE.NEST ? [nest, google] : [google, nest]),
      'track.SERIAL': { value: {} },
      'shared.SERIAL': { value: {} },
      'link.SERIAL': { value: { structure: 'structure.home' } },
      'where.home': { value: {} },
      STRUCTURE_HOME: { value: {} },
    };
    let mapped = processRawData(
      undefined,
      raw,
      { options: {} },
      undefined,
      new Map([['DEVICE_GOOGLE', { fields: new Set(['current_temperature']) }]]),
    );
    assert.equal(mapped.SERIAL.full, false);
    assert.equal(mapped.SERIAL.data.nest_google_device_uuid, 'DEVICE_GOOGLE');
    assert.equal(mapped.SERIAL.data.current_temperature, 21);
    assert.deepEqual(
      processRawData(
        undefined,
        raw,
        { options: {} },
        undefined,
        new Map([['device.nest', { fields: new Set(['backplate_temperature']) }]]),
      ),
      {},
    );
    delete raw.DEVICE_GOOGLE;
    assert.deepEqual(
      processRawData(
        undefined,
        raw,
        { options: {} },
        undefined,
        new Map([['device.nest', { fields: new Set(['backplate_temperature']) }]]),
      ),
      {},
    );
  });
}

function service() {
  let characteristics = new Map();
  return {
    addLinkedService() {},
    getCharacteristic(type) {
      if (characteristics.has(type) === false) {
        characteristics.set(type, {
          props: {},
          setProps(props) {
            this.props = { ...this.props, ...props };
          },
        });
      }
      return characteristics.get(type);
    },
    testCharacteristic: (type) => characteristics.has(type),
    updateCharacteristic(type, value) {
      this.getCharacteristic(type).value = value;
    },
    removeCharacteristic: (type) => characteristics.delete(type),
  };
}

for (let [previous, next, control, target] of [
  ['COOLING', 'HEATING', 'heat', 20],
  ['HEATING', 'COOLING', 'cool', 26],
]) {
  test('external ' + control + ' waits for off and completes before the thermostat update resolves', async () => {
    let device = new Thermostat({ hvac_state: previous });
    device.hap = hap;
    device.thermostatService = service();
    device.batteryService = service();
    device.history = () => {};
    let stopping = Promise.withResolvers();
    let starting = Promise.withResolvers();
    let calls = [];
    device.externalForTest = {
      off: () => {
        calls.push('off');
        return stopping.promise;
      },
      [control]: (temperature) => {
        calls.push([control, temperature]);
        return starting.promise;
      },
    };
    let finished = false;
    let update = device.onUpdate({ hvac_state: next, target_temperature_low: 20, target_temperature_high: 26 });
    update.then(() => {
      finished = true;
    });
    await setImmediate();
    assert.deepEqual(calls, ['off']);
    assert.equal(finished, false);
    stopping.resolve();
    await setImmediate();
    assert.deepEqual(calls, ['off', [control, target]]);
    assert.equal(finished, false);
    starting.resolve();
    await update;
    assert.equal(finished, true);

    let failure = new Error('External off failed');
    device.externalForTest.off = async () => {
      throw failure;
    };
    await assert.rejects(device.onUpdate({ hvac_state: next }), (error) => error === failure);
    assert.equal(calls.length, 2, 'a rejected off must not proceed to the new mode');
  });
}

test('initial and updated humidifier capabilities retain enum zero and reuse the service', async () => {
  let device = new Thermostat({ has_humidifier: true, has_dehumidifier: false });
  device.hap = hap;
  device.thermostatService = service();
  device.batteryService = service();
  device.addService = () => service();
  device.addCharacteristic = (target, type, options = {}) => {
    let characteristic = target.getCharacteristic(type);
    characteristic.setProps(options.props ?? {});
    characteristic.value = options.initialValue;
    characteristic.onGet = options.onGet;
  };
  device.removeCharacteristic = (target, type) => target.removeCharacteristic(type);
  device.log = { info() {}, debug() {} };
  device.history = () => {};
  let type = hap.Characteristic.TargetHumidifierDehumidifierState;
  for (let [humidifier, dehumidifier, expected] of [
    [true, false, [1]],
    [false, true, [2]],
    [true, true, [0, 1, 2]],
  ]) {
    device.deviceData = { has_humidifier: humidifier, has_dehumidifier: dehumidifier };
    device.setupHumidityForTest(humidifier, dehumidifier);
    let characteristic = device.humidifierDehumidifierService.getCharacteristic(type);
    assert.deepEqual(characteristic.props.validValues, expected);
    assert.equal(expected.includes(characteristic.value), true);
    assert.equal(expected.includes(characteristic.onGet()), true);
  }
  let existing = device.humidifierDehumidifierService;
  for (let [humidifier, dehumidifier, expected] of [
    [true, false, [1]],
    [true, true, [0, 1, 2]],
    [false, true, [2]],
  ]) {
    let data = { ...device.deviceData, has_humidifier: humidifier, has_dehumidifier: dehumidifier };
    await device.onUpdate(data);
    assert.equal(device.humidifierDehumidifierService, existing);
    assert.deepEqual(existing.getCharacteristic(type).props.validValues, expected);
    device.deviceData = data;
    assert.equal(expected.includes(existing.getCharacteristic(type).onGet()), true);
  }
});

test('HomeKit room display changes only current and desired temperatures and falls back to the same native service', async () => {
  const native = {
    nest_google_device_uuid: 'THERMO', current_temperature: 23, target_temperature: 24, target_temperature_low: 24,
    hvac_mode: 'heat', eco_mode: false, can_heat: true, online: true, removed_from_base: false, hvac_state: 'heating',
  };
  const device = new Thermostat(native);
  device.hap = hap;
  device.thermostatService = service();
  device.batteryService = service();
  device.history = () => {};
  let room = { ruleId: 'rooms', temperature: 20, desiredTemperature: 21 };
  device.getClimateRoom = () => room;
  await device.onUpdate(native);
  assert.equal(device.getTemperature(hap.Characteristic.TargetTemperature), 21);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.CurrentTemperature).value, 20);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature).value, 21);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState).value,
    hap.Characteristic.CurrentHeatingCoolingState.HEAT);
  assert.equal(device.deviceData.target_temperature_low, 24, 'raw native data stays intact');
  const identity = device.thermostatService;
  room = null;
  device.updateClimateRoom();
  assert.equal(device.thermostatService, identity);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.CurrentTemperature).value, 23);
  assert.equal(device.getTemperature(hap.Characteristic.TargetTemperature), 24);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature).value, 24);
  room = { ruleId: 'rooms', temperature: 20, desiredTemperature: 21 };
  for (const change of [{ hvac_mode: 'cool' }, { eco_mode: true }, { temperature_lock: true }]) {
    device.deviceData = { ...native, ...change };
    assert.equal(device.climateRoomView(), null);
  }
});

test('HomeKit room target writes use the rule request and propagate failures without a direct Nest write', async () => {
  const device = new Thermostat({ nest_google_device_uuid: 'THERMO', current_temperature: 23,
    target_temperature: 24, target_temperature_low: 24, hvac_mode: 'heat', eco_mode: false });
  device.hap = hap;
  device.thermostatService = service();
  device.thermostatService.updateCharacteristic(
    hap.Characteristic.TargetHeatingCoolingState, hap.Characteristic.TargetHeatingCoolingState.HEAT,
  );
  let room = { ruleId: 'rooms', temperature: 20, desiredTemperature: 21 };
  device.getClimateRoom = () => room;
  const requests = [];
  device.set = async (request) => {
    requests.push(request);
    room.desiredTemperature = request.climate_room_target.value;
  };
  await device.setTemperature(hap.Characteristic.TargetTemperature, 22);
  assert.deepEqual(requests, [{ uuid: 'THERMO', climate_room_target: { ruleId: 'rooms', value: 22 } }]);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature).value, 22);
  assert.equal(device.deviceData.target_temperature_low, 24);
  device.set = async () => {
    throw new Error('Rule became unavailable');
  };
  await assert.rejects(device.setTemperature(hap.Characteristic.TargetTemperature, 23), /unavailable/);
  assert.equal(device.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature).value, 22);
  room = null;
  device.set = async (request) => requests.push(request);
  await assert.rejects(device.setTemperature(hap.Characteristic.TargetTemperature, 25), /control changed/);
  assert.equal(requests.length, 1, 'a stale projected tile cannot send its desired target directly to Nest');
  await device.setTemperature(hap.Characteristic.TargetTemperature, 25);
  assert.deepEqual(requests.at(-1), { uuid: 'THERMO', target_temperature_low: 25 }, 'native mode retains existing routing');
});
