import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import HomeKitDevice from '../src/HomeKitDevice/HomeKitDevice.js';
import {
  configureIdentity,
  rememberCachedIdentity,
  PLUGIN_NAME,
  PLATFORM_NAME,
  IDENTITY_NAMESPACE,
  LEGACY_IDENTITY_NAMESPACE,
} from '../src/identity.js';

const generate = (value) => createHash('sha1').update(value).digest('hex');
const api = {
  version: 2.7,
  hap: { uuid: { generate }, Service: { AccessoryInformation: 'info' }, Characteristic: {} },
};
const originalGenerate = HomeKitDevice.generateUUID;
configureIdentity(HomeKitDevice);

test('new Climate accessories use their own stable UUID namespace across supported backends', () => {
  for (const backend of [api, { matter: { uuid: { generate } } }, { uuid: { generate } }]) {
    for (const serial of ['camera-123', 'THERMOSTAT-123', 'protect-123']) {
      const expected = originalGenerate(IDENTITY_NAMESPACE, backend, serial);
      assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, serial), expected);
      assert.notEqual(expected, originalGenerate(LEGACY_IDENTITY_NAMESPACE, backend, serial));
      assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, serial.toUpperCase()), expected);
    }
  }
  assert.equal(HomeKitDevice.PLUGIN_NAME, PLUGIN_NAME);
  assert.equal(HomeKitDevice.PLATFORM_NAME, PLATFORM_NAME);
  const configuredGenerate = HomeKitDevice.generateUUID;
  assert.equal(HomeKitDevice.generateUUID('other-plugin', api, 'serial'), originalGenerate('other-plugin', api, 'serial'));
  configureIdentity(HomeKitDevice);
  assert.equal(HomeKitDevice.generateUUID, configuredGenerate);
  assert.throws(() => HomeKitDevice.generateUUID(PLUGIN_NAME, api, ''), TypeError);
});

test('restored identities select legacy UUIDs only for matching devices in the same runtime', () => {
  for (const backend of [api, { matter: { uuid: { generate } } }, { uuid: { generate } }]) {
    const legacy = originalGenerate(LEGACY_IDENTITY_NAMESPACE, backend, 'migrated-123');
    rememberCachedIdentity(backend, legacy);
    assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, 'migrated-123'), legacy);
    assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, 'MIGRATED-123'), legacy);
    assert.equal(
      HomeKitDevice.generateUUID(PLUGIN_NAME, backend, 'another-123'),
      originalGenerate(IDENTITY_NAMESPACE, backend, 'another-123'),
    );
    const freshRuntime = { hap: api.hap };
    assert.notEqual(HomeKitDevice.generateUUID(PLUGIN_NAME, freshRuntime, 'migrated-123'), legacy);
    const current = originalGenerate(IDENTITY_NAMESPACE, backend, 'migrated-123');
    rememberCachedIdentity(backend, current);
    assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, 'migrated-123'), current);
  }
});

test('invalid or unrelated cache entries cannot replace a generated device identity', () => {
  for (const backend of [undefined, null, false, 'invalid']) {
    assert.doesNotThrow(() => rememberCachedIdentity(backend, 'unused'));
  }
  const backend = { hap: api.hap };
  for (const uuid of [undefined, null, 23, '']) {
    rememberCachedIdentity(backend, uuid);
  }
  rememberCachedIdentity(backend, originalGenerate('another-plugin', backend, '123'));
  assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, backend, '123'), originalGenerate(IDENTITY_NAMESPACE, backend, '123'));
});

test('real device lifecycle reuses cached accessories and registers new ones under NestClimateCntrl', async () => {
  const registrations = [];
  const publications = [];
  class Accessory {
    constructor(name, uuid) {
      this.displayName = name;
      this.UUID = uuid;
      this.context = { preserved: true };
      this.services = [
        {
          UUID: 'info',
          testCharacteristic() {
            return false;
          },
          updateCharacteristic() {},
          getCharacteristic() {
            return { value: '' };
          },
        },
      ];
    }

    getService() {
      return this.services[0];
    }
  }
  const backend = {
    ...api,
    platformAccessory: Accessory,
    registerPlatformAccessories: (...args) => registrations.push(args),
    publishExternalAccessories: (...args) => publications.push(args),
  };
  const data = (serialNumber) => ({
    serialNumber,
    softwareVersion: '1',
    description: 'Nest',
    model: 'Test',
    manufacturer: 'Nest',
  });
  const oldUUID = originalGenerate(LEGACY_IDENTITY_NAMESPACE, api, 'cached-123');
  const cached = new Accessory('Existing', oldUUID);
  rememberCachedIdentity(backend, cached.UUID);
  const services = cached.services;
  const restored = new HomeKitDevice([cached], backend, data('cached-123'));
  assert.equal(restored.accessory, cached);
  assert.equal(await restored.add(), true);
  assert.equal(restored.accessory.services, services);
  assert.equal(restored.accessory.context.preserved, true);
  assert.equal(registrations.length, 0);
  assert.equal(restored.uuid, oldUUID);

  const fresh = new HomeKitDevice(undefined, backend, data('new-123'));
  assert.equal(await fresh.add(), true);
  assert.deepEqual(registrations[0].slice(0, 2), [PLUGIN_NAME, PLATFORM_NAME]);
  assert.equal(fresh.uuid, originalGenerate(IDENTITY_NAMESPACE, api, 'new-123'));

  const camera = new HomeKitDevice(undefined, backend, data('camera-123'));
  assert.equal(await camera.add({ externalPublish: true }), true);
  assert.equal(publications[0][0], PLUGIN_NAME);
  assert.equal(publications[0][1][0].UUID, originalGenerate(IDENTITY_NAMESPACE, api, 'camera-123'));
  await HomeKitDevice.shutdown();
});
