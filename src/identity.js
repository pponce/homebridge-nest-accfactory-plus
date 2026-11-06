// Registration follows the npm name; persistent device identity must never follow a rename.
export const PLUGIN_NAME = 'homebridge-nest-accfactory-plus';
export const PLATFORM_NAME = 'NestClimateCntrl';
export const IDENTITY_NAMESPACE = 'homebridge-nest-accfactory';

const configured = new WeakSet();

export function configureIdentity(Device) {
  Device.PLUGIN_NAME = PLUGIN_NAME;
  Device.PLATFORM_NAME = PLATFORM_NAME;
  if (configured.has(Device)) {
    return;
  }
  const generateUUID = Device.generateUUID;
  // Adapt the shared module once, covering both construction and system lookups.
  // Preserve historical accessory UUIDs independently of the platform alias.
  Device.generateUUID = function (pluginName, api, serialNumber) {
    return generateUUID.call(this, pluginName === PLUGIN_NAME ? IDENTITY_NAMESPACE : pluginName, api, serialNumber);
  };
  configured.add(Device);
}
