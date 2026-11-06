// Registration follows the npm name; identity namespaces remain stable across renames.
export const PLUGIN_NAME = 'homebridge-nest-accfactory-plus';
export const PLATFORM_NAME = 'NestClimateCntrl';
export const IDENTITY_NAMESPACE = 'homebridge-nest-climate-cntrl';
export const LEGACY_IDENTITY_NAMESPACE = 'homebridge-nest-accfactory';

const configured = new WeakSet();
const restoredIdentities = new WeakMap();

export function rememberCachedIdentity(api, uuid) {
  if (typeof api !== 'object' || api === null || typeof uuid !== 'string' || uuid === '') {
    return;
  }
  if (!restoredIdentities.has(api)) {
    restoredIdentities.set(api, new Set());
  }
  restoredIdentities.get(api).add(uuid);
}

export function configureIdentity(Device) {
  Device.PLUGIN_NAME = PLUGIN_NAME;
  Device.PLATFORM_NAME = PLATFORM_NAME;
  if (configured.has(Device)) {
    return;
  }
  const generateUUID = Device.generateUUID;
  // Adapt the shared module once, covering both construction and system lookups.
  // Only reuse identities delivered to this platform by Homebridge's cache lifecycle.
  // The alias/cache association must be migrated separately before cache restoration.
  Device.generateUUID = function (pluginName, api, serialNumber) {
    if (pluginName !== PLUGIN_NAME) {
      return generateUUID.call(this, pluginName, api, serialNumber);
    }
    const current = generateUUID.call(this, IDENTITY_NAMESPACE, api, serialNumber);
    const cached = restoredIdentities.get(api);
    if (cached === undefined || cached.has(current)) {
      return current;
    }
    const legacy = generateUUID.call(this, LEGACY_IDENTITY_NAMESPACE, api, serialNumber);
    return cached.has(legacy) ? legacy : current;
  };
  configured.add(Device);
}
