// Read-only installation inspection. Never serialize raw configuration, cache or pairing data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = ['homebridge-nest-accfactory', 'homebridge-nest-accfactory-plus', 'homebridge-nest-climate-cntrl'];
const aliases = ['NestAccfactory', 'NestClimateCntrl'];
const validUsername = (value) => typeof value === 'string' && /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(value);
const mac = (value) => value.replaceAll(':', '').toUpperCase();
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
  for (const entry of owned) {
    const uuids = (entry.services ?? []).map((service) =>
      String(service.UUID ?? service.type)
        .toUpperCase()
        .split('-')[0]
        .replace(/^0+/, ''),
    );
    const kind = uuids.some((id) => ['110', '121', '45'].includes(id))
      ? 'camera-doorbell-or-lock'
      : uuids.includes('4A')
        ? 'thermostat'
        : uuids.includes('8A')
          ? 'temperature-sensor'
          : 'other';
    types[kind] = (types[kind] ?? 0) + 1;
  }
  const uuids = owned.map((entry) => entry.UUID).filter((value) => typeof value === 'string');
  return {
    totalAccessories: entries.length,
    nestAccessories: owned.length,
    owners,
    types,
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
    schemaVersion: 1,
    mode: 'read-only',
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    targetPackage: 'homebridge-nest-climate-cntrl',
    targetVersion: '0.5.0-beta.1',
    platforms: [],
    installedPackages: [],
    nextStep:
      'Review the bridge/cache layout and approve a backup before choosing a migration. This report does not authorize or apply cache changes.',
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
  for (const name of packages) {
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
