// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
// Exercise selected private system API methods without booting Homebridge or contacting upstream services.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import test from 'node:test';
import { DATA_SOURCE, DEVICE_TYPE } from '../src/consts.js';
import { createSupportDump } from '../src/supportdump.js';
import GrpcTransport from '../src/grpctransport.js';

let source = await readFile(new URL('../src/system.js', import.meta.url), 'utf8');

let connectionsBegin = source.indexOf('  #createConnections() {');
let connectionsEnd = source.indexOf('  async #subscribeNestAPI(', connectionsBegin);
assert.ok(connectionsBegin !== -1 && connectionsEnd > connectionsBegin, 'Connection callback boundaries must exist');

// Capture the production authorisation callback while isolating cloud ingestion and device delivery.
let createAuthHost = new Function(
  'trackedDevices',
  'rawData',
  'HomeKitDevice',
  'DEVICE_TYPE',
  'const Connections = { fromConfig: (config, options) => options };' +
    'return new class {' +
    '#trackedDevices = trackedDevices; #rawData = rawData; config = {}; starts = [];' +
    'async #subscribeNestAPI(uuid) { this.starts.push(["nest", uuid]); }' +
    'async #observeGoogleAPI(uuid) { this.starts.push(["google", uuid]); }' +
    'callback() { return this.#createConnections().onAuthorised; }' +
    source.slice(connectionsBegin, connectionsEnd) +
    '};',
);

test('account authorisation starts ingestion once and refresh preserves active loops', async () => {
  const host = createAuthHost(new Map(), {}, {}, DEVICE_TYPE);
  await host.callback()('account-A', {}, { wasAuthorised: false });
  await host.callback()('account-A', {}, { wasAuthorised: true });
  assert.deepEqual(host.starts, [['nest', 'account-A'], ['google', 'account-A']]);
});

let processDataBegin = source.indexOf('  async #processData(uuid, changedData = undefined) {');
let processDataEnd = source.indexOf('  async #set(', processDataBegin);
assert.ok(processDataBegin !== -1 && processDataEnd > processDataBegin, 'Data processing method boundaries must exist');

// Run discovery, source selection, UPDATE dispatch and SET-handler registration from the production method.
// Device mapping and cloud writes are boundaries supplied by the test; no cloud or Homebridge instance is started.
let createDataHost = new Function(
  'HomeKitDevice',
  'DATA_SOURCE',
  'DEVICE_TYPE',
  'deviceModules',
  'rawData',
  'getDeviceHKCategory',
  'createSupportDump',
  'return new class {' +
    '#connections = new Map([["nest-account", { name: "Nest" }], ["google-account", { name: "Google" }]]);' +
    '#deviceModules = deviceModules; #rawData = rawData; #trackedDevices = new Map(); #supportDumpWriter;' +
    'config = { options: {} }; api = {}; cachedAccessories = []; writes = [];' +
    'async #set(...args) { this.writes.push(args); } async #get() {}' +
    'run() { return this.#processData("google-account"); }' +
    'tracked() { return this.#trackedDevices.get("SERIAL"); }' +
    source.slice(processDataBegin, processDataEnd) +
    '};',
);

function setupDataProcessing(type) {
  let accessory;
  let handlers = new Map();
  let updates = [];
  class Device {
    static TYPE = type;
    static VERSION = 'test';
    constructor(cached, api, data) {
      this.uuid = 'stable-homekit-id';
      this.deviceData = structuredClone(data);
      accessory = this;
    }

    async add() {}
  }
  let mapped = {};
  let modules = new Map([[type, { class: Device, processRawData: () => mapped }]]);
  let raw = {
    'device.nest': { source: DATA_SOURCE.NEST, connection: 'nest-account' },
    DEVICE_GOOGLE: { source: DATA_SOURCE.GOOGLE, connection: 'google-account' },
  };
  let homeKit = {
    SET: 'SET',
    GET: 'GET',
    UPDATE: 'UPDATE',
    message: async (uuid, type, payload) => {
      assert.equal(uuid, 'stable-homekit-id');
      if (typeof payload === 'function') {
        handlers.set(type, payload);
      } else if (type === 'UPDATE') {
        updates.push(payload);
        accessory.deviceData = { ...accessory.deviceData, ...payload };
      }
    },
  };
  let host = createDataHost(homeKit, DATA_SOURCE, DEVICE_TYPE, modules, raw, () => 1, createSupportDump);
  return {
    host,
    raw,
    updates,
    update: async (source, temperature, full = false) => {
      mapped.SERIAL = {
        full,
        data: {
          serialNumber: 'SERIAL',
          description: 'Device',
          excluded: false,
          nest_google_device_uuid: source === DATA_SOURCE.NEST ? 'device.nest' : 'DEVICE_GOOGLE',
          current_temperature: temperature,
        },
      };
      await host.run();
    },
    data: () => accessory.deviceData,
    set: () => handlers.get('SET')({ uuid: accessory.deviceData.nest_google_device_uuid, target_temperature: 23 }),
  };
}

test('disabled support dumps do not inspect raw payloads during device updates', async () => {
  let flow = setupDataProcessing(DEVICE_TYPE.THERMOSTAT);
  let reads = 0;
  Object.defineProperty(flow.raw['device.nest'], 'value', {
    get() {
      reads++;
      throw new Error('Diagnostic payload read');
    },
  });
  await flow.update(DATA_SOURCE.NEST, 20, true);
  assert.equal(reads, 0);
  assert.equal(flow.data().current_temperature, 20);
});

test('system routes enabled API dumps through redaction without changing accessory data', async () => {
  let flow = setupDataProcessing(DEVICE_TYPE.THERMOSTAT);
  let lines = [];
  flow.host.config.options.supportDump = true;
  flow.host.log = { info: (...args) => lines.push(args.join(' ')), warn: () => assert.fail('Unexpected support-dump warning') };
  flow.raw['device.nest'].connection = 'google-account';
  flow.raw['device.nest'].value = { access_token: 'Private Account Token', serial_number: 'PRIVATE_SERIAL0001', temperature: 20 };
  await flow.update(DATA_SOURCE.NEST, 20, true);
  assert.equal(lines.join('\n').includes('Private Account Token'), false);
  assert.equal(lines.join('\n').includes('PRIVATE_SERIAL0001'), false);
  assert.equal(lines.join('\n').includes('**REDACTED_'), true);
  assert.equal(flow.raw['device.nest'].value.access_token, 'Private Account Token');
  assert.equal(flow.data().nest_google_device_uuid, 'device.nest');
});

for (let type of [DEVICE_TYPE.THERMOSTAT, DEVICE_TYPE.PROTECT, DEVICE_TYPE.TEMPSENSOR]) {
  for (let initialSource of [DATA_SOURCE.NEST, DATA_SOURCE.GOOGLE]) {
    test(type + ' retains Google state and SET routing after either source arrives first: ' + initialSource, async () => {
      let flow = setupDataProcessing(type);
      await flow.update(initialSource, 20, true);
      await flow.update(DATA_SOURCE.GOOGLE, 21);
      let before = flow.updates.length;
      await flow.update(DATA_SOURCE.NEST, 19);
      assert.equal(flow.updates.length, before, 'rejected Nest update must not reach the accessory');
      assert.equal(flow.data().current_temperature, 21);
      assert.equal(flow.data().nest_google_device_uuid, 'DEVICE_GOOGLE');
      assert.equal(flow.host.tracked().source, DATA_SOURCE.GOOGLE);
      assert.equal(flow.host.tracked().nest_google_device_uuid, 'DEVICE_GOOGLE');
      await flow.set();
      assert.equal(flow.host.writes[0][0], 'google-account');
      assert.equal(flow.host.writes[0][1], 'DEVICE_GOOGLE');
      // Same-source updates continue to change the accessory after a rejected transition.
      await flow.update(DATA_SOURCE.GOOGLE, 22);
      assert.equal(flow.data().current_temperature, 22);
    });
  }
}

let begin = source.indexOf('  async #observeGoogleAPI(uuid) {');
let end = source.indexOf('  async #processData(', begin);
assert.ok(begin !== -1 && end > begin, 'Observe method boundaries must exist');
let constants = source.match(/^const API_STREAM_.*$/gm);
assert.equal(constants?.length, 3);

// Expose only this method in a test host. Returning its existing promise chain
// lets tests await completion without sleeps or changes to production visibility.
let createHost = new Function(
  'connection',
  'getProtoTypes',
  'setTimeout',
  'clearTimeout',
  'path',
  'GrpcTransport',
  constants.join('\n') +
    '\n' +
    'const __dirname = "."; const ACCOUNT_TYPE = { GOOGLE: "google", NEST: "nest" };\n' +
    'return new class {\n' +
    '  #connections = new Map([["account", connection]]);\n' +
    '  #rawData = {}; #trackedDevices = new Map();\n' +
    '  config = { options: { useGoogleAPI: true } };\n' +
    '  async #processData() {}\n' +
    '  async #getLocationWeather() {}\n' +
    '  run() { return this.#observeGoogleAPI("account"); }\n' +
    '  replace(value) { this.#connections.set("account", value); }\n' +
    source.slice(begin, end).replace('    grpcTransport\n', '    return grpcTransport\n') +
    '};',
);

function setup() {
  let pending = Promise.withResolvers();
  let timers = [];
  let cleared = [];
  let calls = [];
  let connection = {
    authorised: true,
    type: 'google',
    grpcTransport: {
      observe: (...args) => {
        calls.push(args);
        return pending.promise;
      },
    },
  };
  let host = createHost(
    connection,
    () => [{ fullName: '.nest.trait.device.Identity' }],
    (callback, delay) => {
      let timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    (timer) => cleared.push(timer),
    path,
    GrpcTransport,
  );
  return { host, connection, pending, timers, cleared, calls };
}

test('Observe resolved failures increase retry delay up to 60 seconds', async () => {
  let { host, pending, timers, cleared } = setup();
  pending.resolve({ status: 14 });
  for (let index = 0; index < 6; index++) {
    await host.run();
  }
  assert.deepEqual(
    timers.map((timer) => timer.delay),
    [5000, 10000, 20000, 40000, 60000, 60000],
  );
  assert.equal(cleared[1], timers[0]);
});

test('Observe normal completion uses the one-second restart and schedules the same account', async () => {
  let { host, connection, pending, timers, calls } = setup();
  connection.observeRetryDelay = 40000;
  pending.resolve({ status: 0 });
  await host.run();
  assert.equal(timers[0].delay, 1000);
  await timers[0].callback();
  assert.equal(calls.length, 2);
});

test('Observe rejected promises also use failure backoff', async () => {
  let { host, pending, timers } = setup();
  let running = host.run();
  pending.reject(new Error('transport failed'));
  await running;
  assert.equal(timers[0].delay, 5000);
});

test('a processed Observe update resets accumulated retry backoff', async () => {
  let { host, connection, pending, timers, calls } = setup();
  connection.observeRetryDelay = 40000;
  let running = host.run();
  await calls[0][4]({ observeResponse: [] });
  assert.equal(connection.observeRetryDelay, undefined);
  pending.resolve({ status: 14 });
  await running;
  assert.equal(timers[0].delay, 5000);
});

for (let change of ['unauthorised', 'replaced', 'removed']) {
  test('Observe completion does not restart a connection that was ' + change, async () => {
    let { host, connection, pending, timers, cleared } = setup();
    let running = host.run();
    if (change === 'unauthorised') {
      connection.authorised = false;
    } else {
      host.replace(change === 'replaced' ? { authorised: true } : undefined);
    }
    pending.resolve({ status: 14 });
    await running;
    assert.deepEqual(timers, []);
    assert.deepEqual(cleared, []);
  });
}

test('Observe does not start for an unauthorised connection or disabled Google API', async () => {
  let { host, connection, calls } = setup();
  connection.authorised = false;
  await host.run();
  connection.authorised = true;
  host.config.options.useGoogleAPI = false;
  await host.run();
  assert.deepEqual(calls, []);
});

