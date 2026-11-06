// Exercise the actual installed Homebridge cache restoration without publishing a bridge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { prepareMigration, createSnapshot, applySnapshot } from '../migrate-child-bridge.mjs';
import Platform from '../../src/system.js';
import HomeKitDevice from '../../src/HomeKitDevice.js';
import { configureIdentity, PLUGIN_NAME } from '../../src/identity.js';

const require = createRequire(import.meta.url);
const homebridgeEntry = require.resolve('homebridge');
const library = path.dirname(homebridgeEntry);
const { HomebridgeAPI } = await import(pathToFileURL(path.join(library, 'api.js')));
const { BridgeService } = await import(pathToFileURL(path.join(library, 'bridgeService.js')));
const homebridgeRequire = createRequire(homebridgeEntry);
let hapEntry;
try { hapEntry = homebridgeRequire.resolve('@homebridge/hap-nodejs'); }
catch { hapEntry = homebridgeRequire.resolve('hap-nodejs'); }
const { IdentifierCache } = await import(pathToFileURL(path.join(path.dirname(hapEntry), 'model/IdentifierCache.js')));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'climate-hap-migration-'));
const storage = path.join(root, 'storage');
const project = path.join(root, 'project');
const username = 'AA:BB:CC:DD:EE:FF';
const cacheName = 'cachedAccessories.AABBCCDDEEFF';
const oldPackage = 'homebridge-nest-accfactory-plus';
const originalApi = new HomebridgeAPI();
const services = originalApi.hap.Service;
const characteristics = originalApi.hap.Characteristic;
configureIdentity(HomeKitDevice);

function makeBridge(api, packageName, platformName, configureAccessory) {
  const plugin = { getPluginIdentifier: () => packageName,
    getActiveDynamicPlatform: (name) => name === platformName ? { configureAccessory } : undefined };
  const manager = { getPlugin: (name) => name === packageName ? plugin : undefined,
    getPluginByActiveDynamicPlatform: () => undefined };
  return new BridgeService(api, manager, {}, {
    cachedAccessoriesDir: path.join(storage, 'accessories'), cachedAccessoriesItemName: cacheName,
    externalAccessoriesItemName: 'externalAccessories.fixture', keepOrphanedCachedAccessories: false,
  }, { name: 'Migration Test', username, pin: '111-22-333', port: 40000 });
}

function identityMap(bridge) {
  return bridge.bridgedAccessories.map((accessory) => ({ UUID: accessory.UUID, aid: accessory.aid,
    services: accessory.services.map((service) => ({ UUID: service.UUID, subtype: service.subtype, iid: service.iid,
      characteristics: service.characteristics.map((characteristic) => ({ UUID: characteristic.UUID, iid: characteristic.iid })) })) }));
}

try {
  for (const folder of [path.join(storage, 'accessories'), path.join(storage, 'persist'), path.join(project, '.git')]) fs.mkdirSync(folder, { recursive: true });
  const config = { platforms: [{ platform: 'NestAccfactory', _bridge: { username, pin: '111-22-333', port: 40000 },
    accounts: [{ type: 'google', refreshToken: 'fixture-only' }] }] };
  fs.writeFileSync(path.join(storage, 'config.json'), JSON.stringify(config));
  const serials = [];
  const serialized = [services.Thermostat, services.Thermostat, services.SmokeSensor, services.SmokeSensor,
    services.SmokeSensor, services.SmokeSensor, services.OccupancySensor].map((Service, index) => {
    const serial = 'FIXTURE-' + index;
    serials.push(serial);
    const accessory = new originalApi.platformAccessory('Migration Fixture ' + index, originalApi.hap.uuid.generate('homebridge-nest-accfactory_' + serial));
    accessory._associatedPlugin = oldPackage;
    accessory._associatedPlatform = 'NestAccfactory';
    accessory.addService(Service, 'Fixture', '1');
    accessory.getService(services.AccessoryInformation).setCharacteristic(characteristics.SerialNumber, serial);
    return originalApi.platformAccessory.serialize(accessory);
  });
  fs.writeFileSync(path.join(storage, 'accessories', cacheName), JSON.stringify(serialized));
  const oldBridge = makeBridge(originalApi, oldPackage, 'NestAccfactory', () => {});
  await oldBridge.loadCachedPlatformAccessoriesFromDisk();
  oldBridge.restoreCachedPlatformAccessories();
  const oldIdentifiers = new IdentifierCache(username);
  oldBridge.bridge._assignIDs(oldIdentifiers);
  const previous = identityMap(oldBridge.bridge);
  assert.equal(previous.length, 7);
  fs.writeFileSync(path.join(storage, 'persist', 'IdentifierCache.AABBCCDDEEFF.json'), JSON.stringify({ cache: oldIdentifiers._cache }));
  fs.writeFileSync(path.join(storage, 'persist', 'AccessoryInfo.AABBCCDDEEFF.json'), JSON.stringify({ pairedClients: { fixture: {} } }));
  const plan = prepareMigration(storage, 7);
  applySnapshot(createSnapshot(plan, project));

  const api = new HomebridgeAPI();
  const platform = Object.create(Platform.prototype);
  platform.api = api;
  platform.log = { info() {}, warn() {} };
  platform.cachedAccessories = [];
  const migratedBridge = makeBridge(api, PLUGIN_NAME, 'NestClimateCntrl', (accessory) => platform.configureAccessory(accessory));
  await migratedBridge.loadCachedPlatformAccessoriesFromDisk();
  migratedBridge.restoreCachedPlatformAccessories();
  const restoredIdentifiers = new IdentifierCache(username);
  restoredIdentifiers._cache = JSON.parse(fs.readFileSync(path.join(storage, 'persist', 'IdentifierCache.AABBCCDDEEFF.json'))).cache;
  migratedBridge.bridge._assignIDs(restoredIdentifiers);
  assert.deepEqual(identityMap(migratedBridge.bridge), previous, 'Accessory, service and characteristic IDs must survive migration');
  assert.equal(platform.cachedAccessories.length, 7);
  for (const [index, serial] of serials.entries()) assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, api, serial), serialized[index].UUID);
  assert.equal(HomeKitDevice.generateUUID(PLUGIN_NAME, api, 'NEW-FIXTURE'), api.hap.uuid.generate('homebridge-nest-climate-cntrl_NEW-FIXTURE'));
  migratedBridge.saveCachedPlatformAccessoriesOnDisk();

  // A second real restoration proves the migrated associations persist across restarts.
  const secondApi = new HomebridgeAPI();
  const restored = [];
  const secondBridge = makeBridge(secondApi, PLUGIN_NAME, 'NestClimateCntrl', (accessory) => restored.push(accessory));
  await secondBridge.loadCachedPlatformAccessoriesFromDisk();
  secondBridge.restoreCachedPlatformAccessories();
  secondBridge.bridge._assignIDs(restoredIdentifiers);
  assert.equal(restored.length, 7);
  assert.deepEqual(identityMap(secondBridge.bridge), previous);
  console.log('Homebridge ' + api.serverVersion + ': seven accessories restored twice with unchanged AIDs, IIDs and legacy UUIDs.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
