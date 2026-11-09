import test from 'node:test';
import assert from 'node:assert/strict';
import hap from './helpers/homebridge-hap.js';
import { ClimatePresence } from '../src/climate-presence.js';

function fixture(cached = []) {
  const registered = [];
  const removed = [];
  class PlatformAccessory extends hap.Accessory {
    constructor(...args) {
      super(...args);
      this.context = {};
    }
  }
  const api = {
    hap,
    platformAccessory: PlatformAccessory,
    registerPlatformAccessories: (...args) => registered.push(args),
    unregisterPlatformAccessories: (...args) => removed.push(args),
  };
  return { registered, removed, api, presence: new ClimatePresence(api, cached, 'AA:BB:CC:DD:EE:FF') };
}

test('combined presence has stable distinct identity and read-only, fault-aware HomeKit state', async () => {
  const f = fixture();
  const rule = { id: 'home', name: 'Climate Home' };
  f.presence.sync([rule]);
  assert.equal(f.registered.length, 1);
  const accessory = f.registered[0][2][0];
  assert.equal(accessory.context.climatePresence, true);
  const service = accessory.getService(hap.Service.OccupancySensor);
  const occupancy = service.getCharacteristic(hap.Characteristic.OccupancyDetected);
  assert.ok(!occupancy.props.perms.includes('pw'));
  assert.equal(occupancy.value, 1, 'Unknown startup must not publish an empty home');
  await assert.rejects(occupancy.handleGetRequest());
  f.presence.update(rule, { home: true, fault: false });
  assert.equal(await occupancy.handleGetRequest(), 1);
  assert.equal(service.getCharacteristic(hap.Characteristic.StatusFault).value, 0);
  f.presence.update(rule, { home: true, fault: true });
  assert.equal(await occupancy.handleGetRequest(), 1, 'Home remains conservative when another input fails');
  f.presence.update(rule, { home: true, fault: false });
  f.presence.sync([rule]);
  assert.equal(service.getCharacteristic(hap.Characteristic.StatusFault).value, 0, 'Polling must not create transient faults');
  f.presence.update(rule, { home: false, fault: false });
  assert.equal(await occupancy.handleGetRequest(), 0);
  f.presence.update(rule, { home: false, fault: true });
  await assert.rejects(occupancy.handleGetRequest());
  assert.equal(service.getCharacteristic(hap.Characteristic.StatusFault).value, 1);
  const restored = fixture([accessory]);
  restored.presence.sync([{ ...rule, name: 'Renamed presence' }]);
  assert.equal(restored.registered.length, 0);
  assert.equal(accessory.UUID, restored.presence.uuid(rule.id));
  assert.equal(accessory.displayName, 'Renamed presence');
  restored.presence.update(rule, { fault: true });
  restored.presence.sync([]);
  assert.equal(restored.removed[0][2][0], accessory);
  restored.presence.update(rule, { home: true });
  new ClimatePresence({}).sync([rule]);
});
