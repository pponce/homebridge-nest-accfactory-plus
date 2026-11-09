import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HEATING_PROFILES } from './heating-response.js';
import { parseDurationToSeconds } from './utils.js';
import { fanCurveError, speedAction } from '../homebridge-ui/public/fan-speed.js';

const DEVICE_FIELDS = [
  'name',
  'eveHistory',
  'humiditySensor',
  'ecoSwitch',
  'fanPresetSwitches',
  'fanDuration',
  'sensorPreview',
  'scheduleTimeZone',
  'heatingType',
  'heatingResponseEnabled',
];
const bools = ['eveHistory', 'humiditySensor', 'ecoSwitch', 'fanPresetSwitches', 'heatingResponseEnabled'];
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
  delete runtime.dashboardTemperatureUnit;
  for (const device of Array.isArray(runtime.devices) ? runtime.devices : Object.values(runtime.devices ?? {})) {
    if (object(device)) {
      delete device.scheduleTimeZone;
      delete device.heatingType;
      delete device.heatingResponseEnabled;
    }
  }
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
        'maximumOffset',
        'minimumIntervalMinutes',
        'startGap',
        'stopGap',
        'fullSpeedGap',
        'minimumSpeed',
        'maximumSpeed',
      ]);
      assert(
        typeof rule.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(rule.id) && !known.has(rule.id),
        'Each rule needs a unique identifier.',
      );
      known.add(rule.id);
      assert(text(rule.name, 80) && rule.kind === kind, 'Enter a rule name and supported rule type.');
      assert(rule.enabled === undefined || typeof rule.enabled === 'boolean', 'Choose whether this rule is enabled.');
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
        ['action', ['heating', 'cooling', 'temperature', speedAction]],
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
        ['maximumOffset', 0, 3],
        ['minimumIntervalMinutes', 1, 60],
        ['startGap', 0.1, 10],
        ['stopGap', 0, 10],
        ['fullSpeedGap', 0.2, 20],
        ['minimumSpeed', 1, 100],
        ['maximumSpeed', 1, 100],
      ]) {
        if (rule[field] !== undefined) {
          assert(Number.isFinite(rule[field]) && rule[field] >= low && rule[field] <= high, 'A rule value is outside its supported range.');
        }
      }
      const sources = [...new Set(rule.sourceIds ?? [])];
      const targets = [...new Set(rule.targetIds ?? [])];
      if (rule.enabled === true) {
        if (kind === 'temperature') {
          assert(text(rule.thermostatId, 256) && sources.length > 0, 'Select a thermostat and temperature sources before enabling.');
          assert(rule.aggregation !== 'single' || sources.length === 1, 'Single-sensor control requires exactly one source.');
          assert(
            Number.isFinite(rule.desiredTemperature) && rule.desiredTemperature >= 9 && rule.desiredTemperature <= 32,
            'Live heating targets must be between 9 and 32 °C (48.2–89.6 °F).',
          );
        } else if (kind === 'fan') {
          assert(targets.length > 0, 'Select at least one room fan before enabling.');
          if (rule.action === speedAction) {
            assert(sources.length > 0, 'Select temperature sources for temperature-based fan speed.');
            const curveError = fanCurveError(rule);
            assert(!curveError, curveError);
          } else if (['heating', 'cooling'].includes(rule.action)) {
            assert(text(rule.thermostatId, 256), 'Select the thermostat that the fans should follow.');
          } else {
            assert(sources.length > 0 && Number.isFinite(rule.threshold), 'Select temperature sources and a fan threshold.');
          }
        } else {
          assert(sources.length > 0, 'Select presence sources before enabling.');
        }
      }
      return { ...rule, sourceIds: sources, targetIds: targets, enabled: rule.enabled === true };
    });
  }
  const thermostatOwners = new Set();
  const fanOwners = new Set();
  for (const rule of result.temperature.filter((entry) => entry.enabled)) {
    const id = rule.thermostatId.toUpperCase();
    assert(!thermostatOwners.has(id), 'Only one enabled temperature group can control each thermostat.');
    thermostatOwners.add(id);
  }
  for (const rule of result.fans.filter((entry) => entry.enabled)) {
    for (const id of rule.targetIds) {
      assert(!fanOwners.has(id), 'Only one enabled rule can control each room fan.');
      fanOwners.add(id);
    }
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
      for (const key of ['name', 'fanDuration', 'scheduleTimeZone', 'heatingType']) {
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
    let rulesError;
    try {
      rules = validateRuleDrafts(block.climateRuleDrafts ?? {});
    } catch {
      rules = { occupancy: [], temperature: [], fans: [] };
      rulesError = 'Climate rules are invalid. Review their configuration in Homebridge before running automation.';
    }
    return {
      revision: state.revision,
      config: {
        name: typeof block.name === 'string' ? block.name : 'Nest Climate Cntrl',
        temperatureUnit: block.dashboardTemperatureUnit === 'F' ? 'F' : 'C',
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
      executionEnabled: true,
      rulesError,
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
    this.beforeSave?.();
    keys(payload, ['revision', 'config']);
    keys(payload.config, ['name', 'temperatureUnit', 'options', 'devices', 'rules']);
    const state = await this.read();
    if (payload.revision !== state.revision) {
      throw new DashboardConfigError('Settings changed elsewhere. Reload before saving your changes.', 409);
    }
    const runtimeBefore = runtimeSignature(state.block);
    const patch = payload.config;
    if (patch.temperatureUnit !== undefined) {
      assert(['C', 'F'].includes(patch.temperatureUnit), 'Choose Celsius or Fahrenheit for dashboard temperatures.');
      state.block.dashboardTemperatureUnit = patch.temperatureUnit;
    }
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
          if (key === 'heatingType') {
            assert(value === 'unknown' || Object.hasOwn(HEATING_PROFILES, value), 'Choose a supported heating type.');
          }
          if (key === 'scheduleTimeZone') {
            assert(text(value, 100), 'Choose a valid IANA time zone.');
            try {
              assert(!/^[+-]/.test(value.trim()), 'Choose a named IANA time zone, not a fixed UTC offset.');
              new Intl.DateTimeFormat('en', { timeZone: value });
            } catch {
              throw new DashboardConfigError('Choose a valid IANA time zone.');
            }
          }
          if (key === 'sensorPreview') {
            keys(value, ['selected', 'desired']);
            assert(
              ids(value.selected) && Number.isFinite(value.desired) && value.desired >= 5 && value.desired <= 35,
              'Select sensors and a room temperature from 5 to 35 °C (41–95 °F).',
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
