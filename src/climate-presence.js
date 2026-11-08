import { IDENTITY_NAMESPACE, PLUGIN_NAME, PLATFORM_NAME } from './identity.js';

// Combined presence is its own read-only occupancy accessory; it never changes Google's home mode.
export class ClimatePresence {
  constructor(api, cached = [], instance = 'main') {
    this.api = api;
    this.instance = instance;
    this.accessories = new Map(cached.map((accessory) => [accessory.UUID, accessory]));
    this.readings = new Map();
    this.configured = new Set();
  }

  uuid(id) {
    return this.api.hap.uuid.generate(IDENTITY_NAMESPACE + ':presence:' + this.instance + ':' + id);
  }

  sync(rules) {
    if (!this.api?.hap?.Service?.OccupancySensor || !this.api.platformAccessory) {
      return;
    }
    const active = new Set();
    for (const rule of rules) {
      const id = this.uuid(rule.id);
      active.add(id);
      let accessory = this.accessories.get(id);
      const created = !accessory;
      if (!accessory) {
        accessory = new this.api.platformAccessory(rule.name, id);
        accessory.context.climatePresence = true;
        accessory.context.ruleId = rule.id;
        this.accessories.set(id, accessory);
      }
      const { Service, Characteristic } = this.api.hap;
      accessory.displayName = rule.name;
      accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'Nest Climate Cntrl')
        .setCharacteristic(Characteristic.Model, 'Combined climate presence')
        .setCharacteristic(Characteristic.SerialNumber, 'CLIMATE-PRESENCE-' + id)
        .setCharacteristic(Characteristic.Name, rule.name);
      const service = accessory.getService(Service.OccupancySensor) ?? accessory.addService(Service.OccupancySensor, rule.name);
      service.setCharacteristic(Characteristic.Name, rule.name);
      service.getCharacteristic(Characteristic.OccupancyDetected).onGet(() => {
        const state = this.readings.get(rule.id);
        if (typeof state?.home !== 'boolean' || state.fault) {
          throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        return Number(state.home);
      });
      // Unknown startup state must not appear as a confirmed departure.
      if (!this.configured.has(id)) {
        service.updateCharacteristic(Characteristic.OccupancyDetected, 1);
        service.updateCharacteristic(Characteristic.StatusFault, 1);
        service.updateCharacteristic(Characteristic.StatusActive, false);
        this.configured.add(id);
      }
      if (created) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
    for (const [id, accessory] of this.accessories) {
      if (!active.has(id)) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.delete(id);
        this.configured.delete(id);
        this.readings.delete(accessory.context.ruleId);
      }
    }
  }

  update(rule, state) {
    const accessory = this.accessories.get(this.uuid(rule.id));
    if (!accessory) {
      return;
    }
    const { Service, Characteristic } = this.api.hap;
    const service = accessory.getService(Service.OccupancySensor);
    const known = typeof state.home === 'boolean';
    this.readings.set(rule.id, { home: state.home, fault: state.fault });
    if (known) {
      service.updateCharacteristic(Characteristic.OccupancyDetected, Number(state.home));
    }
    service.updateCharacteristic(Characteristic.StatusFault, state.fault || !known ? 1 : 0);
    service.updateCharacteristic(Characteristic.StatusActive, known && !state.fault);
  }
}
