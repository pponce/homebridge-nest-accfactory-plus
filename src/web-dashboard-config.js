import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseDurationToSeconds } from './utils.js';

const DEVICE_FIELDS = [
  'name',
  'eveHistory',
  'humiditySensor',
  'ecoSwitch',
  'fanPresetSwitches',
  'fanDuration',
  'sensorPreview',
  'scheduleTimeZone',
];
const bools = ['eveHistory', 'humiditySensor', 'ecoSwitch', 'fanPresetSwitches'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export class DashboardConfigError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function assert(value, message) {
  if (!value) {
    throw new DashboardConfigError(message);
  }
}
function keys(value, allowed) {
  assert(object(value) && Object.keys(value).every((key) => allowed.includes(key)), 'The submitted settings contain unsupported fields.');
}
function text(value, maximum = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value);
}
function ids(value) {
  return Array.isArray(value) && value.length <= 64 && value.every((item) => text(item, 256));
}
function deviceRows(value) {
  if (value === undefined) {
    return [];
  }
  assert(Array.isArray(value) || object(value), 'Device configuration needs review in Homebridge Settings.');
  const rows = Array.isArray(value)
    ? value
    : Object.entries(value).map(([serialNumber, settings]) => {
        assert(object(settings), 'Device configuration needs review in Homebridge Settings.');
        return { serialNumber, ...settings };
      });
  const identities = new Set();
  for (const row of rows) {
    assert(
      object(row) && text(row.serialNumber, 256) && !identities.has(row.serialNumber.toUpperCase()),
      'Device identities need review in Homebridge Settings.',
    );
    identities.add(row.serialNumber.toUpperCase());
  }
  return rows;
}
function runtimeSignature(block) {
  const runtime = structuredClone(block);
  delete runtime.climateRuleDrafts;
  runtime.name ??= 'Nest Climate Cntrl';
  runtime.options = { ...(object(runtime.options) ? runtime.options : {}), eveHistory: runtime.options?.eveHistory !== false };
  return JSON.stringify(runtime);
}

export function validateRuleDrafts(value) {
  keys(value, ['occupancy', 'temperature', 'fans']);
  const groups = { occupancy: 'presence', temperature: 'temperature', fans: 'fan' };
  const result = { occupancy: [], temperature: [], fans: [] };
  const known = new Set();
  for (const [group, kind] of Object.entries(groups)) {
    const rules = value[group] ?? [];
    assert(Array.isArray(rules) && rules.length <= 32, 'Use at most 32 draft rules per category.');
    result[group] = rules.map((rule) => {
      keys(rule, [
        'id',
        'name',
        'kind',
        'thermostatId',
        'sourceIds',
        'targetIds',
        'aggregation',
        'threshold',
        'hysteresis',
        'holdMinutes',
        'awayDelayMinutes',
        'logic',
        'action',
        'enabled',
        'desiredTemperature',
      ]);
      assert(
        typeof rule.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(rule.id) && !known.has(rule.id),
        'Each rule needs a unique identifier.',
      );
      known.add(rule.id);
      assert(
        text(rule.name, 80) && rule.kind === kind && rule.enabled !== true,
        'Rules are saved as drafts; automatic execution is unavailable.',
      );
      assert(rule.enabled === undefined || rule.enabled === false, 'Automatic rule execution is unavailable.');
      for (const field of ['sourceIds', 'targetIds']) {
        if (rule[field] !== undefined) {
          assert(ids(rule[field]), 'Select valid rule sources.');
        }
      }
      if (rule.thermostatId !== undefined) {
        assert(text(rule.thermostatId, 256), 'Select a valid thermostat.');
      }
      for (const [field, choices] of [
        ['aggregation', ['single', 'average']],
        ['logic', ['any', 'all']],
        ['action', ['heating', 'cooling', 'temperature']],
      ]) {
        if (rule[field] !== undefined) {
          assert(choices.includes(rule[field]), 'Choose a supported rule option.');
        }
      }
      for (const [field, low, high] of [
        ['threshold', -40, 80],
        ['hysteresis', 0.1, 10],
        ['holdMinutes', 0, 1440],
        ['awayDelayMinutes', 0, 1440],
        ['desiredTemperature', 5, 35],
      ]) {
        if (rule[field] !== undefined) {
          assert(Number.isFinite(rule[field]) && rule[field] >= low && rule[field] <= high, 'A rule value is outside its supported range.');
        }
      }
      return { ...rule, sourceIds: [...new Set(rule.sourceIds ?? [])], targetIds: [...new Set(rule.targetIds ?? [])], enabled: false };
    });
  }
  return result;
}

export class WebDashboardConfig {
  constructor(file, platformConfig, { knownDevices = () => [] } = {}) {
    this.file = file;
    this.username = platformConfig?._bridge?.username?.toUpperCase();
    this.knownDevices = knownDevices;
    this.saving = Promise.resolve();
    this.restartRequired = false;
  }

  async read() {
    const stat = await fs.lstat(this.file);
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 4194304,
      'Homebridge configuration cannot be edited from this dashboard.',
    );
    const bytes = await fs.readFile(this.file, 'utf8');
    const root = JSON.parse(bytes);
    assert(Array.isArray(root.platforms), 'Homebridge platform configuration is unavailable.');
    const candidates = root.platforms.filter(
      (entry) =>
        entry?.platform?.split('.').at(-1) === 'NestClimateCntrl' &&
        (!this.username || entry._bridge?.username?.toUpperCase() === this.username),
    );
    assert(candidates.length === 1, 'Could not uniquely identify this Climate platform.');
    return { root, block: candidates[0], bytes, stat, revision: revision(bytes) };
  }

  view(state) {
    const block = state.block;
    const devices = deviceRows(block.devices).map((entry) => {
      const safe = { serialNumber: entry.serialNumber };
      for (const key of ['name', 'fanDuration', 'scheduleTimeZone']) {
        if (typeof entry[key] === 'string') {
          safe[key] = entry[key];
        }
      }
      for (const key of bools) {
        if (typeof entry[key] === 'boolean') {
          safe[key] = entry[key];
        }
      }
      if (object(entry.sensorPreview)) {
        safe.sensorPreview = {
          selected: Array.isArray(entry.sensorPreview.selected)
            ? entry.sensorPreview.selected.filter((id) => text(id, 256)).slice(0, 64)
            : [],
          desired: Number.isFinite(entry.sensorPreview.desired) ? entry.sensorPreview.desired : 21,
        };
      }
      return safe;
    });
    let rules;
    try {
      rules = validateRuleDrafts(block.climateRuleDrafts ?? {});
    } catch {
      rules = { occupancy: [], temperature: [], fans: [] };
    }
    return {
      revision: state.revision,
      config: {
        name: typeof block.name === 'string' ? block.name : 'Nest Climate Cntrl',
        options: { eveHistory: block.options?.eveHistory !== false },
        devices,
        rules,
      },
      accounts: (Array.isArray(block.accounts) ? block.accounts : []).map((account) => ({
        name: typeof account?.name === 'string' ? account.name : 'Nest account',
        type: account?.type === 'nest' ? 'nest' : 'google',
        authMethod:
          account?.authMethod === 'refreshToken' || account?.refreshToken
            ? 'refreshToken'
            : account?.type === 'nest'
            ? 'accessToken'
            : 'issueTokenCookie',
        configured: Boolean(account?.refreshToken || account?.access_token || (account?.issueToken && account?.cookie)),
      })),
      executionEnabled: false,
      restartRequired: this.restartRequired,
    };
  }

  async snapshot() {
    return this.view(await this.read());
  }

  save(payload) {
    const operation = this.saving.then(() => this.performSave(payload));
    this.saving = operation.catch(() => {});
    return operation;
  }

  async performSave(payload) {
    keys(payload, ['revision', 'config']);
    keys(payload.config, ['name', 'options', 'devices', 'rules']);
    const state = await this.read();
    if (payload.revision !== state.revision) {
      throw new DashboardConfigError('Settings changed elsewhere. Reload before saving your changes.', 409);
    }
    const runtimeBefore = runtimeSignature(state.block);
    const patch = payload.config;
    if (patch.name !== undefined) {
      assert(text(patch.name, 80), 'Enter a name of 1–80 characters.');
      state.block.name = patch.name;
    }
    if (patch.options !== undefined) {
      keys(patch.options, ['eveHistory']);
      if (patch.options.eveHistory !== undefined) {
        assert(typeof patch.options.eveHistory === 'boolean', 'History must be enabled or disabled.');
        state.block.options = { ...(object(state.block.options) ? state.block.options : {}), eveHistory: patch.options.eveHistory };
      }
    }
    if (patch.devices !== undefined) {
      assert(Array.isArray(patch.devices) && patch.devices.length <= 100, 'Invalid thermostat settings.');
      state.block.devices = deviceRows(state.block.devices);
      const known = new Set(
        [...this.knownDevices(), ...state.block.devices.map((entry) => entry.serialNumber)]
          .filter((value) => typeof value === 'string')
          .map((value) => value.toUpperCase()),
      );
      const updated = new Set();
      for (const device of patch.devices) {
        keys(device, ['serialNumber', ...DEVICE_FIELDS]);
        assert(
          text(device.serialNumber, 256) && known.has(device.serialNumber.toUpperCase()) && !updated.has(device.serialNumber.toUpperCase()),
          'Select a known thermostat once per update.',
        );
        updated.add(device.serialNumber.toUpperCase());
        let target = state.block.devices.find((entry) => entry.serialNumber.toUpperCase() === device.serialNumber.toUpperCase());
        if (!target) {
          target = { serialNumber: device.serialNumber };
          state.block.devices.push(target);
        }
        for (const key of DEVICE_FIELDS) {
          const value = device[key];
          if (value === undefined) {
            continue;
          }
          if (isDeepStrictEqual(value, target[key])) {
            continue;
          }
          if (value === null) {
            delete target[key];
            continue;
          }
          if (bools.includes(key)) {
            assert(typeof value === 'boolean', 'Choose enabled or disabled for thermostat features.');
          }
          if (key === 'name') {
            assert(text(value, 80), 'Enter a thermostat name of 1–80 characters.');
          }
          if (key === 'fanDuration') {
            const seconds = parseDurationToSeconds(value);
            assert(
              text(value, 64) && Number.isFinite(seconds) && seconds >= 900 && seconds <= 604800,
              'Choose an HVAC fan duration from 15 minutes to 7 days.',
            );
          }
          if (key === 'scheduleTimeZone') {
            assert(text(value, 100), 'Choose a valid IANA time zone.');
            try {
              new Intl.DateTimeFormat('en', { timeZone: value });
            } catch {
              throw new DashboardConfigError('Choose a valid IANA time zone.');
            }
          }
          if (key === 'sensorPreview') {
            keys(value, ['selected', 'desired']);
            assert(
              ids(value.selected) && Number.isFinite(value.desired) && value.desired >= 5 && value.desired <= 35,
              'Select sensors and a room temperature from 5 to 35 °C.',
            );
          }
          target[key] = structuredClone(value);
        }
      }
    }
    if (patch.rules !== undefined) {
      state.block.climateRuleDrafts = validateRuleDrafts(patch.rules);
    }
    const temporary = this.file + '.climate-' + crypto.randomUUID() + '.tmp';
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(state.root, null, 4) + '\n');
      await handle.chown(state.stat.uid, state.stat.gid);
      await handle.chmod(state.stat.mode & 0o777);
      await handle.sync();
      await handle.close();
      handle = undefined;
      const latest = await this.read();
      if (latest.revision !== payload.revision) {
        throw new DashboardConfigError('Settings changed elsewhere. Reload before saving your changes.', 409);
      }
      await fs.rename(temporary, this.file);
    } finally {
      await handle?.close();
      await fs.rm(temporary, { force: true });
    }
    this.restartRequired ||= runtimeBefore !== runtimeSignature(state.block);
    return this.snapshot();
  }
}
