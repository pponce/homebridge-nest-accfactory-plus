import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClimateAccess } from '../homebridge-ui/climate-access.js';
import { sensorSources, previewGroup } from '../homebridge-ui/public/sensor-preview.js';

const bridge = 'AA:BB:CC:DD:EE:FF';
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'climate-sources-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const config = path.join(directory, 'config.json');
  await writeFile(
    config,
    JSON.stringify({
      bridge: { username: bridge, name: 'Main', pin: '111-22-333' },
      platforms: [{ name: 'Rooms', _bridge: { username: 'AA:BB:CC:DD:EE:00', pin: '222-33-444' } }],
    }),
  );
  const client = new EventEmitter();
  client.startDiscovery = () => {};
  client.destroy = () => {};
  let failed = false;
  let faulty = false;
  const requests = [];
  const access = new ClimateAccess(config, {
    clientFactory: () => client,
    request: async (url, options) => {
      requests.push({ url, options });
      if (failed) {
        return { status: 470, ok: false };
      }
      if (url.endsWith('/accessories')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            accessories: [
              {
                aid: 2,
                services: [
                  {
                    iid: 1,
                    type: '3E',
                    characteristics: [
                      { type: '23', value: 'Bedroom' },
                      { type: '30', value: 'EXTERNAL' },
                    ],
                  },
                  {
                    iid: 10,
                    type: '8A',
                    characteristics: [
                      { iid: 11, type: '11', perms: ['pr'], value: 15, unit: 'fahrenheit' },
                      { iid: 12, type: '77', perms: ['pr'], value: 0 },
                    ],
                  },
                  { iid: 20, type: 'B7', characteristics: [{ iid: 21, type: 'B0', perms: ['pr', 'pw'], value: 0 }] },
                  { iid: 30, type: '85', characteristics: [{ iid: 31, type: '22', perms: ['pr'], value: false }] },
                  { iid: 40, type: '86', characteristics: [{ iid: 41, type: '71', perms: ['pr'], value: 1 }] },
                ],
              },
            ],
          }),
        };
      }
      return {
        status: 207,
        ok: true,
        json: async () => ({
          characteristics: [
            { aid: 2, iid: 11, value: 68 },
            { aid: 2, iid: 12, value: faulty ? 1 : 0 },
            { aid: 2, iid: 21, value: 1 },
            { aid: 2, iid: 31, value: false },
            { aid: 2, iid: 41, value: 1 },
          ],
        }),
      };
    },
  });
  await access.start();
  t.after(() => access.close());
  client.emit('instance-discovered', { username: bridge, ipAddress: '127.0.0.1', port: 12345 });
  return {
    access,
    client,
    requests,
    fail: () => {
      failed = true;
    },
    fault: () => {
      faulty = true;
    },
  };
}

test('discovery reads temperature-only services and fans, normalizes units and retains source identity', async (t) => {
  const f = await fixture(t);
  const data = await f.access.refresh();
  assert.equal(data.sources.length, 4);
  assert.equal(data.sources[2].kind, 'motion');
  assert.equal(data.sources[2].detected, false);
  assert.equal(data.sources[3].kind, 'occupancy');
  assert.equal(data.sources[3].detected, true);
  assert.equal(data.sources[0].temperature, 20);
  assert.equal(data.sources[0].available, true);
  assert.equal(data.sources[0].measuredAt, null);
  assert.equal(data.sources[1].canControl, true);
  assert.equal(data.sources[1].running, true);
  assert.ok(data.sources[0].id.startsWith('hap:' + bridge));
  assert.equal(data.bridges[1].available, false);
  assert.ok(f.requests.every(({ options }) => options.method === 'GET'));
  assert.equal(f.requests[0].options.headers.Authorization, '111-22-333');
  assert.ok(!JSON.stringify(data).includes('111-22-333'));
  assert.ok(!JSON.stringify(data).includes('127.0.0.1'));
});
test('unconfigured discoveries receive no credentials and child bridges use their own PIN', async (t) => {
  const f = await fixture(t);
  f.client.emit('instance-discovered', { username: 'UNTRUSTED', ipAddress: '127.0.0.2', port: 12345 });
  f.client.emit('instance-discovered', { username: 'AA:BB:CC:DD:EE:00', ipAddress: '::1', port: 12346 });
  await f.access.refresh();
  assert.ok(!f.requests.some(({ url }) => url.includes('127.0.0.2')));
  assert.equal(f.requests.find(({ url }) => url.includes('[::1]')).options.headers.Authorization, '222-33-444');
});
test('sensor faults and bridge failures invalidate input instead of reusing cached temperatures', async (t) => {
  const f = await fixture(t);
  await f.access.refresh();
  f.fault();
  assert.equal((await f.access.refresh()).sources[0].available, false);
  f.fail();
  const result = await f.access.refresh();
  assert.ok(result.sources.every((source) => !source.available));
  assert.match(result.bridges[0].error, /accessory control/);
  f.access.close();
  assert.deepEqual(await f.access.refresh(), { sources: [], bridges: [] });
});

test('failure in a later read batch invalidates the whole bridge without duplicate source identities', async (t) => {
  const f = await fixture(t);
  let fail = false;
  const services = Array.from({ length: 33 }, (_, index) => ({
    iid: index + 1, type: '8A', characteristics: [{ iid: 100 + index, type: '11', perms: ['pr'], unit: 'celsius' }],
  }));
  f.access.request = async (url) => {
    if (fail && url.endsWith('2.132')) { throw new Error('Disconnected during read'); }
    const payload = url.endsWith('/accessories') ? { accessories: [{ aid: 2, services }] } : {
      characteristics: new URL(url).searchParams.get('id').split(',').map((id) => ({
        aid: Number(id.split('.')[0]), iid: Number(id.split('.')[1]), value: 20,
      })),
    };
    return { ok: true, status: 200, json: async () => payload };
  };
  assert.equal((await f.access.refresh()).sources.filter((source) => source.available).length, 33);
  fail = true;
  const result = await f.access.refresh();
  assert.equal(result.sources.length, 33);
  assert.equal(new Set(result.sources.map((source) => source.id)).size, 33);
  assert.ok(result.sources.every((source) => !source.available));
  assert.equal(result.bridges[0].available, false);
});

test('temperature readings must be numbers even when unit conversion could coerce them', async (t) => {
  const f = await fixture(t);
  const request = f.access.request;
  f.access.request = async (...args) => {
    const response = await request(...args);
    const payload = await response.json();
    if (payload.characteristics) { payload.characteristics[0].value = '68'; }
    return { ...response, json: async () => payload };
  };
  assert.equal((await f.access.refresh()).sources[0].available, false);
});

function model() {
  const now = Date.now();
  const thermostat = {
    serial: 'T',
    id: 'T',
    type: 'Thermostat',
    account: 'A',
    lastUpdate: now,
    data: { online: true, physical_temperature: 22, current_temperature: 99, active_rcs_sensor: '', hvac_mode: 'heat', eco_mode: false },
  };
  const snapshot = {
    accounts: [{ id: 'A', authorised: true, observing: true }],
    devices: [
      thermostat,
      { serial: 'S', id: 'S', type: 'TemperatureSensor', account: 'A', lastUpdate: now, data: { current_temperature: 18, online: true } },
    ],
  };
  const external = {
    sources: [
      { id: 'external', kind: 'temperature', provider: 'homebridge', available: true, temperature: 20, lastReadAt: now, measuredAt: null },
      { id: 'duplicate', kind: 'temperature', serial: 's', temperature: 18 },
    ],
  };
  return { sources: sensorSources(snapshot, external), thermostat, now };
}
test('mixed preview prefers native identity and the physical reading, supports single and average sources with bounded offset', () => {
  const f = model();
  assert.equal(f.sources.length, 3);
  assert.equal(f.sources[0].temperature, 22);
  const result = previewGroup({ ...f, selected: ['nest:S', 'external', 'external'], desired: 21 });
  assert.equal(result.roomTemperature, 19);
  assert.equal(result.offset, 1.5);
  assert.equal(result.proposedTarget, 22.5);
  assert.equal(result.measurementAgeKnown, false);
  assert.equal(previewGroup({ ...f, selected: ['external'], desired: 21 }).roomTemperature, 20);
});
test('preview refuses missing, stale and invalid inputs and pauses for native source changes or Eco', () => {
  const f = model();
  const args = { ...f, selected: ['external'], desired: 21 };
  assert.equal(previewGroup({ ...args, selected: [] }).state, 'empty');
  assert.equal(previewGroup({ ...args, selected: ['missing'] }).state, 'unavailable');
  assert.equal(previewGroup({ ...args, now: f.now + 100000 }).state, 'unavailable');
  assert.equal(previewGroup({ ...args, desired: NaN }).state, 'unavailable');
  f.thermostat.data.active_rcs_sensor = 'S';
  assert.equal(previewGroup(args).state, 'paused');
  f.thermostat.data.active_rcs_sensor = '';
  f.thermostat.data.eco_mode = true;
  assert.equal(previewGroup(args).state, 'paused');
  f.thermostat.data.eco_mode = false;
  for (const lastReadAt of [undefined, NaN, f.now + 10000, f.now - 100000]) {
    f.sources[0].lastReadAt = lastReadAt;
    assert.equal(previewGroup(args).state, 'paused');
  }
});
