// Read-only installation inspection. Never serialize raw configuration, cache or pairing data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = ['homebridge-nest-accfactory', 'homebridge-nest-accfactory-plus', 'homebridge-nest-climate-cntrl'];
const aliases = ['NestAccfactory', 'NestClimateCntrl'];
const validUsername = (value) => typeof value === 'string' && /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(value);
const mac = (value) => value.replaceAll(':', '').toUpperCase();
const serviceNames = {
  '3E': 'accessory-information',
  '40': 'fan',
  '43': 'light',
  '45': 'lock',
  '49': 'switch',
  '4A': 'thermostat',
  '7F': 'carbon-monoxide',
  '82': 'humidity',
  '85': 'motion',
  '86': 'occupancy',
  '87': 'smoke',
  '89': 'air-quality',
  '8A': 'temperature',
  '96': 'battery',
  '97': 'carbon-dioxide',
  '110': 'camera',
  '121': 'doorbell',
  B7: 'fan',
  D0: 'valve',
};
function standardType(value) {
  const match = typeof value === 'string' && /^([\da-f]{1,8})(?:-0000-1000-8000-0026bb765291)?$/i.exec(value);
  return match ? match[1].toUpperCase().replace(/^0+/, '') : '';
}
async function json(file) {
  try {
    return { status: 'read', value: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
}

function cacheSummary(entries) {
  const owned = entries.filter((entry) => packages.includes(entry?.plugin) && aliases.includes(entry?.platform));
  const owners = packages
    .map((plugin) => ({ plugin, count: owned.filter((entry) => entry.plugin === plugin).length }))
    .filter((entry) => entry.count);
  const types = {};
  const serviceGroups = new Map();
  for (const entry of owned) {
    const services = Array.isArray(entry.services) ? entry.services : [];
    const uuids = services.map((service) => standardType(service?.UUID ?? service?.type));
    const information = services.find((service) => standardType(service?.UUID ?? service?.type) === '3E');
    const model = (Array.isArray(information?.characteristics) ? information.characteristics : []).find(
      (characteristic) => standardType(characteristic?.UUID ?? characteristic?.type) === '20',
    )?.value;
    const kind = uuids.some((id) => ['110', '121', '45'].includes(id))
      ? 'camera-doorbell-or-lock'
      : uuids.includes('4A')
        ? 'thermostat'
        : model === 'Weather'
          ? 'weather'
          : uuids.some((id) => ['87', '7F'].includes(id))
            ? 'smoke-or-carbon-monoxide-sensor'
            : model === 'Home/Away'
              ? 'home-away'
              : uuids.includes('8A')
                ? 'temperature-sensor'
                : uuids.includes('86')
                  ? 'occupancy-sensor'
                  : 'other';
    types[kind] = (types[kind] ?? 0) + 1;
    // Only fixed capability labels leave this process, never model values or custom UUIDs.
    const labels = [...new Set(uuids.map((id) => serviceNames[id] ?? 'custom-or-unknown'))].sort();
    const group = JSON.stringify({ kind, services: labels });
    serviceGroups.set(group, (serviceGroups.get(group) ?? 0) + 1);
  }
  const uuids = owned.map((entry) => entry.UUID).filter((value) => typeof value === 'string');
  return {
    totalAccessories: entries.length,
    nestAccessories: owned.length,
    owners,
    types,
    serviceGroups: [...serviceGroups].map(([group, count]) => ({ ...JSON.parse(group), count })),
    missingIdentities: owned.length - uuids.length,
    duplicateIdentities: uuids.length - new Set(uuids).size,
  };
}

export async function inspectInstallation(
  storage,
  {
    packageRoots = [
      path.join(storage, 'node_modules'),
      '/usr/local/lib/node_modules',
      '/usr/lib/node_modules',
      '/opt/homebridge/lib/node_modules',
    ],
  } = {},
) {
  const config = await json(path.join(storage, 'config.json'));
  if (config.status !== 'read' || !config.value || !Array.isArray(config.value.platforms)) {
    throw new Error('Homebridge configuration is unavailable or invalid. Check the storage path and read permissions.');
  }
  const report = {
    schemaVersion: 2,
    mode: 'read-only',
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    targetPackage: 'homebridge-nest-climate-cntrl',
    targetVersion: '0.5.0',
    platforms: [],
    installedPackages: [],
    nextStep:
      'Review the bridge and cache layout before choosing a migration. No installation files have been changed.',
  };
  for (const [index, entry] of config.value.platforms.entries()) {
    const alias = typeof entry?.platform === 'string' ? entry.platform.split('.').at(-1) : '';
    if (!aliases.includes(alias)) {
      continue;
    }
    const child = entry._bridge !== null && typeof entry._bridge === 'object';
    const bridge = child ? entry._bridge : config.value.bridge;
    const usernameValid = validUsername(bridge?.username);
    const name = child && usernameValid ? 'cachedAccessories.' + mac(bridge.username) : 'cachedAccessories';
    const cache = child && !usernameValid ? { status: 'unknown-child-identity' } : await json(path.join(storage, 'accessories', name));
    const pairing = usernameValid
      ? await json(path.join(storage, 'persist', 'AccessoryInfo.' + mac(bridge.username) + '.json'))
      : { status: 'unknown-identity' };
    const identifiers = usernameValid
      ? await json(path.join(storage, 'persist', 'IdentifierCache.' + mac(bridge.username) + '.json'))
      : { status: 'unknown-identity' };
    const accounts = Array.isArray(entry.accounts)
      ? entry.accounts
      : [entry.google && { ...entry.google, type: 'google' }, entry.nest && { ...entry.nest, type: 'nest' }].filter(Boolean);
    report.platforms.push({
      configIndex: index,
      platform: alias,
      bridge: child ? 'child' : 'main',
      disabled: entry._bridge?.disable === true,
      bridgeIdentityPresent: usernameValid,
      pairingRecord: pairing.status,
      identifierCache: identifiers.status,
      pairedClientCount:
        pairing.status === 'read' && pairing.value?.pairedClients && typeof pairing.value.pairedClients === 'object'
          ? Object.keys(pairing.value.pairedClients).length
          : null,
      credentialMethods: accounts.map((account) =>
        account?.type === 'nest'
          ? 'nest-access-token'
          : account?.authMethod === 'refreshToken' || account?.refreshToken
            ? 'google-refresh-token'
            : account?.type === 'google'
              ? 'google-cookie'
              : 'unknown',
      ),
      cache: {
        status: cache.status === 'read' && !Array.isArray(cache.value) ? 'invalid-format' : cache.status,
        ...(Array.isArray(cache.value) ? cacheSummary(cache.value) : {}),
      },
    });
  }
  for (const name of [...packages, 'homebridge', 'homebridge-config-ui-x']) {
    for (const root of packageRoots) {
      const installed = await json(path.join(root, name, 'package.json'));
      if (installed.status === 'read' && installed.value?.name === name && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(installed.value.version)) {
        report.installedPackages.push({ name, version: installed.value.version });
        break;
      }
    }
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--storage')) {
      throw new Error('Usage: node migration-preflight.mjs [--storage HOMEBRIDGE_STORAGE]');
    }
    const report = await inspectInstallation(path.resolve(args[1] || '/var/lib/homebridge'));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch {
    process.stdout.write(
      JSON.stringify({
        mode: 'read-only',
        error: 'Inspection failed. Check the storage path, config format and read permissions. No installation files were changed.',
      }) + '\n',
    );
    process.exitCode = 1;
  }
}
