import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ClimateAccess } from '../homebridge-ui/climate-access.js';
import { HeatingResponse } from './heating-response.js';
import { DashboardConfigError } from './web-dashboard-config.js';
import { sensorSources, presenceSources } from '../homebridge-ui/public/sensor-preview.js';
import { scheduleTimeZone } from '../homebridge-ui/public/climate-utils.js';
import { normalizeFanRule } from '../homebridge-ui/public/fan-speed.js';
import { runFanSpeed, releaseFanSpeed, validSpeedLease, prepareFanRules, handoffFanLease } from './fan-speed-control.js';
import { TemperatureSensorSetup, nativeSensorAllowsHeating } from './temperature-sensor-setup.js';

const MINUTE = 60000;
const ACK_TIMEOUT = 2 * MINUTE;
// Nest's mapped feedback is rounded to 0.5 °C, including whole-Fahrenheit targets.
// A 0.26 °C tolerance accepts that rounding while detecting the next reported half-degree step.
const equal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.26 : a === b);
const fresh = (source, now) =>
  source?.available === true && Number.isFinite(source.lastReadAt) && source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;
const target = (device) => device?.data.target_temperature_low ?? device?.data.target_temperature;
const flatten = (rules) => [...rules.temperature, ...rules.fans, ...rules.occupancy];

function schedulePosition(entries, timeZone, now) {
  if (!entries.length) {
    return null;
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // Compare local calendar events rather than extrapolating seconds across daylight-saving changes.
  return Math.max(
    ...entries
      .filter(
        (entry) =>
          Number.isInteger(entry.day) &&
          entry.day >= 0 &&
          entry.day <= 6 &&
          Number.isFinite(entry.time) &&
          entry.time >= 0 &&
          entry.time < 86400,
      )
      .map((entry) => {
        let days = (weekday - entry.day + 7) % 7;
        if (days === 0 && entry.time > seconds) {
          days = 7;
        }
        return today - days * 86400000 + entry.time * 1000;
      }),
  );
}

export function automationSources(snapshot, external) {
  const temperatures = sensorSources(snapshot, external);
  const serials = new Set(snapshot.devices.map((device) => device.serial));
  return [
    ...temperatures,
    ...presenceSources(snapshot, external),
    ...(external.sources ?? []).filter(
      (source) =>
        !['temperature', 'occupancy'].includes(source.kind) &&
        !String(source.serial ?? '').startsWith('CLIMATE-PRESENCE-') &&
        !(source.kind === 'fan' && (serials.has(source.serial) || /nest|google/i.test(source.manufacturer ?? ''))),
    ),
  ];
}

export function heatingTarget(desired, physical, room, maximumOffset = 1.5, scale = 'C') {
  const low = Math.max(9, desired - maximumOffset);
  const high = Math.min(32, desired + maximumOffset);
  const proposed = Math.max(low, Math.min(high, desired + physical - room));
  // Round on the device's display grid without crossing either the offset or absolute bounds.
  const toGrid = (value) => (scale === 'F' ? value * 1.8 + 32 : value * 2);
  const fromGrid = (value) => (scale === 'F' ? (value - 32) / 1.8 : value / 2);
  const minimum = Math.ceil(toGrid(low) - 1e-8);
  const maximum = Math.floor(toGrid(high) + 1e-8);
  return minimum > maximum ? null : fromGrid(Math.max(minimum, Math.min(maximum, Math.round(toGrid(proposed)))));
}

export class ClimateAutomation {
  constructor({ directory, dashboard, config, accessFactory, presence, now = Date.now, intervalMs = 15000, log }) {
    this.directory = directory;
    this.dashboard = dashboard;
    this.config = config;
    this.accessFactory = accessFactory ?? (() => new ClimateAccess(config.file));
    this.presence = presence;
    this.now = now;
    this.intervalMs = intervalMs;
    this.log = log;
    this.states = new Map();
    this.leases = new Map();
    this.fanOverrides = new Map();
    this.fanObservations = new Map();
    this.fanWinners = new Map();
    this.queue = Promise.resolve();
    this.saving = Promise.resolve();
    this.external = { sources: [], bridges: [] };
    this.rules = [];
    this.stopping = false;
    this.heatingResponse = new HeatingResponse({ directory, now });
    this.sensorSetup = new TemperatureSensorSetup(this);
  }

  async start({ schedule = true } = {}) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const bytes = await fs.readFile(path.join(this.directory, 'automation.json'), 'utf8');
      const data = JSON.parse(bytes);
      if (
        bytes.length > 1048576 ||
        data.version !== 1 ||
        !Array.isArray(data.states) ||
        !Array.isArray(data.leases) ||
        data.states.length > 96 ||
        data.leases.length > 256
      ) {
        throw new Error('Invalid automation state');
      }
      for (const [id, state] of data.states) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !state || typeof state !== 'object' || !state.rule || state.rule.id !== id) {
          throw new Error('Invalid saved rule');
        }
        state.awaySince = null;
        if (state.rule.kind === 'fan') {
          state.rule = normalizeFanRule(state.rule);
        }
        if (state.rule.kind !== 'presence' && state.rule.enabled) {
          state.paused = true;
          state.reason = 'Bridge restarted. Review the equipment, then Resume automatic control.';
        }
        this.states.set(id, state);
      }
      for (const [key, lease] of data.leases) {
        const isTemperature = lease?.kind === 'temperature';
        const validValue = (value) => (isTemperature ? Number.isFinite(value) && value >= 9 && value <= 32 : typeof value === 'boolean');
        if (
          !['temperature', 'fan'].includes(lease?.kind) ||
          typeof lease.targetId !== 'string' ||
          key !== lease.kind + ':' + lease.targetId ||
          !this.states.has(lease.owner) ||
          (lease.mode === 'speed'
            ? lease.kind !== 'fan' || !validSpeedLease(lease)
            : !validValue(lease.baseline) || !validValue(lease.expected) || !validValue(lease.before)) ||
          !Number.isFinite(lease.sentAt)
        ) {
          throw new Error('Invalid saved command');
        }
        this.leases.set(key, lease);
      }
      if (data.fanOverrides !== undefined) {
        if (!Array.isArray(data.fanOverrides) || data.fanOverrides.length > 256 || data.fanOverrides.some((entry) =>
          !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || entry[0].length > 256 ||
          typeof entry[1] !== 'string' || entry[1].length > 300)) {
          throw new Error('Invalid saved fan overrides');
        }
        this.fanOverrides = new Map(data.fanOverrides);
      }
      this.sensorSetup.load(data.sensorSetups);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.states.clear();
        this.leases.clear();
        this.fanOverrides.clear();
        this.sensorSetup.leases.clear();
        this.recoveryRequired = true;
        this.error = 'Saved automation state could not be read. Review equipment and Resume each rule.';
      }
    }
    await this.heatingResponse.start();
    this.dashboard.automation = this;
    await this.tick();
    if (schedule && !this.stopping) {
      this.timer = setInterval(() => {
        this.tick();
      }, this.intervalMs);
      this.timer.unref();
    }
  }

  serialize(operation) {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }

  async persist() {
    const bytes = JSON.stringify({ version: 1, states: [...this.states], leases: [...this.leases],
      fanOverrides: [...this.fanOverrides], sensorSetups: this.sensorSetup.entries() });
    const operation = this.saving.then(async () => {
      const temporary = path.join(this.directory, 'automation-' + crypto.randomUUID() + '.tmp');
      let file;
      try {
        file = await fs.open(temporary, 'wx', 0o600);
        await file.writeFile(bytes);
        await file.sync();
        await file.close();
        file = undefined;
        await fs.rename(temporary, path.join(this.directory, 'automation.json'));
      } finally {
        await file?.close();
        await fs.rm(temporary, { force: true });
      }
    });
    this.saving = operation.catch(() => {});
    return operation;
  }

  snapshot() {
    return {
      available: !this.stopping,
      error: this.error ?? null,
      intervalSeconds: this.intervalMs / 1000,
      rules: [...this.states.values()].map((state) => ({
        id: state.rule.id,
        enabled: state.rule.enabled,
        kind: state.rule.kind,
        name: state.rule.name,
        thermostatId: state.rule.thermostatId,
        temperatureControl: state.rule.kind === 'temperature' ? this.temperatureControlStatus(state) : undefined,
        phase: state.phase ?? 'waiting',
        reason: state.reason,
        paused: state.paused === true || (state.rule.kind === 'fan' && state.rule.targetIds.length > 0 &&
          state.rule.targetIds.every((id) => this.fanOverrides.has(id))),
        roomTemperature: state.roomTemperature,
        fanSpeeds: state.fanSpeeds,
        fanAssignments: state.fanAssignments,
        fanOverrides: state.rule.kind === 'fan' ? state.rule.targetIds.filter((id) => this.fanOverrides.has(id)) : undefined,
        priority: state.rule.priority,
        desiredTemperature: state.rule.desiredTemperature,
        nestTarget: state.nestTarget,
        proposedTarget: state.proposedTarget,
        nextChangeAt: state.nextChangeAt,
        home: state.home,
        fault: state.fault,
        override: state.override,
        lastAction: state.lastAction,
        sensorSetup: this.sensorSetup.status(state.rule),
      })),
      pendingRestorations: [...this.leases.values()].filter((lease) => lease.restoring).length,
      sensorSetups: this.sensorSetup.snapshot(),
    };
  }

  async readSources() {
    if (!this.access) {
      const access = this.accessFactory();
      try {
        await access.start();
        this.access = access;
      } catch (error) {
        access.close();
        throw error;
      }
    }
    this.external = await this.access.refresh();
    return this.external;
  }

  temperatureControlStatus(state) {
    if (this.stopping || this.error) {
      return 'unavailable';
    }
    const lease = this.leases.get('temperature:' + state.rule.thermostatId);
    if (lease?.owner === state.rule.id && lease.restoring) {
      return 'restoring';
    }
    if (!state.rule.enabled) {
      return 'disabled';
    }
    if (state.paused) {
      return 'paused';
    }
    return state.temperatureControl ?? 'waiting';
  }

  tick() {
    if (this.stopping) {
      return Promise.resolve();
    }
    this.pending ??= this.serialize(() => this.evaluate())
      .catch(() => {
        this.error = 'Automation could not complete its checks. No new commands will run until checks succeed.';
        this.log?.warn?.('Climate automation could not complete its checks. Review the rule status.');
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  async evaluate() {
    const envelope = await this.config.snapshot();
    if (envelope.rulesError) {
      this.error = envelope.rulesError;
      for (const state of this.states.values()) {
        this.pause(state, envelope.rulesError);
      }
      return;
    }
    this.error = null;
    this.rules = flatten(envelope.config.rules);
    this.deviceOptions = envelope.config.devices;
    const currentIds = new Set(this.rules.map((rule) => rule.id));
    for (const rule of this.rules) {
      const old = this.states.get(rule.id);
      const state = old ?? {
        paused: this.recoveryRequired === true,
        holds: {},
        reason: this.recoveryRequired ? 'Review equipment and Resume after recovery.' : 'Waiting for current readings.',
      };
      if (old && !old.rule.enabled && rule.enabled) {
        state.paused = false;
        state.awaySince = null;
      }
      if (old && JSON.stringify(old.rule.sourceIds) !== JSON.stringify(rule.sourceIds)) {
        state.holds = {};
        state.awaySince = null;
        state.demand = false;
      }
      if (old && (old.rule.action !== rule.action || old.rule.speedMode !== rule.speedMode)) {
        if (old.rule.action !== rule.action) {
          state.demand = false;
        }
        state.fanObserved = {};
        state.fanSpeedObserved = {};
        state.fanSpeeds = [];
      }
      state.rule = rule;
      this.states.set(rule.id, state);
    }
    for (const [id, state] of this.states) {
      if (!currentIds.has(id)) {
        state.rule.enabled = false;
      }
    }
    if (
      this.rules.some(
        (rule) =>
          (rule.enabled ||
            (rule.kind === 'temperature' &&
              this.deviceOptions.some(
                (device) => device.serialNumber.toUpperCase() === rule.thermostatId?.toUpperCase() && device.heatingResponseEnabled,
              ))) &&
          [...rule.sourceIds, ...rule.targetIds].some((id) => !id.startsWith('nest:')),
      ) ||
      [...this.leases.values()].some((lease) => lease.kind === 'fan')
    ) {
      try {
        await this.readSources();
      } catch {
        this.external = { sources: this.external.sources.map((source) => ({ ...source, available: false })), bridges: [] };
      }
    }
    this.refreshSnapshot();
    await this.sensorSetup.observe();
    await this.observeHeating();
    this.presence?.sync(this.rules.filter((rule) => rule.kind === 'presence' && rule.enabled));
    // Persist configuration intent before permitting any side effects.
    await this.persist();
    prepareFanRules(this);
    for (const [key, lease] of this.leases) {
      if (lease.kind === 'fan') {
        const winner = this.states.get(this.fanWinners.get(lease.targetId));
        if (winner && winner.fanPlan?.demand === true && !lease.restoring &&
            (winner.rule.id !== lease.owner || (winner.rule.speedMode !== 'last' && lease.mode !== 'speed'))) {
          const handedOff = await handoffFanLease(this, key, lease, winner);
          if (!this.leases.has(key) || (!handedOff && !lease.restoring && !this.fanOverrides.has(lease.targetId))) {
            continue;
          }
        }
      }
      const owner = this.states.get(lease.owner);
      const fanWinner = this.fanWinners.get(lease.targetId);
      const assigned =
        owner?.rule.enabled &&
        owner.rule.kind === lease.kind &&
        !owner.paused &&
        (lease.kind !== 'fan' || (!this.fanOverrides.has(lease.targetId) && (!fanWinner || fanWinner === lease.owner))) &&
        (lease.kind === 'temperature' ? owner.rule.thermostatId === lease.targetId : owner.rule.targetIds.includes(lease.targetId));
      if (!assigned || lease.restoring) {
        await this.release(key, lease);
      }
    }
    for (const state of this.states.values()) {
      if (!state.rule.enabled) {
        state.phase = 'disabled';
        state.reason = 'Rule is disabled.';
        if (!currentIds.has(state.rule.id) && ![...this.leases.values()].some((lease) => lease.owner === state.rule.id) &&
            !this.sensorSetup.owns(state.rule.id)) {
          this.states.delete(state.rule.id);
        }
        continue;
      }
      if (state.paused) {
        state.phase = 'paused';
        if (state.rule.kind === 'presence') {
          state.fault = true;
          this.presence?.update(state.rule, state);
        }
        continue;
      }
      try {
        if (state.rule.kind === 'temperature') {
          await this.temperature(state);
        } else if (state.rule.kind === 'fan') {
          await this.fan(state);
        } else {
          this.occupancy(state);
          this.presence?.update(state.rule, state);
        }
      } catch (error) {
        if (state.rule.kind === 'fan') {
          for (const id of error.fanTargetId ? [error.fanTargetId] : state.fanTargets) {
            this.manualFan(id, 'A fan command could not be confirmed. Review the fan before resuming automatic control.');
          }
        }
        if (error.code === 'CLIMATE_CONFLICT') {
          for (const [key, lease] of this.leases) {
            if (lease.owner === state.rule.id && (!error.fanTargetId || lease.targetId === error.fanTargetId)) {
              this.leases.delete(key);
            }
          }
        }
        state.paused = true;
        state.phase = 'paused';
        state.reason = 'Command or state storage failed. Check the equipment before resuming; no automatic retry is made.';
      }
    }
    await this.persist();
  }

  async observeHeating() {
    const rules = this.rules.filter((rule) => rule.kind === 'temperature');
    const readings = new Map(
      rules.map((rule) => {
        const device = this.device(rule.thermostatId);
        const data = device?.data ?? {};
        const room = this.temperatureInputs(rule);
        return [
          rule.id,
          {
            valid:
              this.connected(device) &&
              room !== null &&
              data.hvac_mode === 'heat' &&
              data.eco_mode === false &&
              nativeSensorAllowsHeating(data) &&
              this.sensorSetup.permits(rule) &&
              ['heating', 'off'].includes(data.hvac_state) &&
              data.can_heat !== false,
            room,
            physical: data.physical_temperature,
            target: target(device),
            heating: data.hvac_state === 'heating',
          },
        ];
      }),
    );
    try {
      this.heatingResponse.observe(rules, this.heatingDeviceOptions(this.deviceOptions), readings);
      await this.heatingResponse.persist();
    } catch {
      this.heatingResponse.error = 'Heating observations are temporarily unavailable. Check the saved heating settings.';
    }
  }

  heatingRecommendations() {
    return this.serialize(async () => {
      const envelope = await this.config.snapshot();
      if (envelope.rulesError) {
        throw new DashboardConfigError(envelope.rulesError);
      }
      return {
        revision: envelope.revision,
        ...this.heatingResponse.snapshot(envelope.config.rules.temperature, this.heatingDeviceOptions(envelope.config.devices)),
      };
    });
  }

  applyHeatingRecommendation(payload) {
    return this.serialize(async () => {
      if (
        this.stopping ||
        !payload ||
        Object.keys(payload).some((key) => !['id', 'stage', 'recommendationId', 'revision'].includes(key)) ||
        !['starting', 'learned'].includes(payload.stage)
      ) {
        throw new DashboardConfigError('Choose a current heating recommendation.');
      }
      const envelope = await this.config.snapshot();
      if (envelope.rulesError || envelope.revision !== payload.revision) {
        throw new DashboardConfigError('Settings changed. Reload the recommendations before applying.', 409);
      }
      const recommendation = this.heatingResponse
        .snapshot(envelope.config.rules.temperature, this.heatingDeviceOptions(envelope.config.devices))
        .rules.find((rule) => rule.id === payload.id)?.[payload.stage];
      if (
        !recommendation ||
        recommendation.id !== payload.recommendationId ||
        (payload.stage === 'learned' && this.heatingResponse.error)
      ) {
        throw new DashboardConfigError('This recommendation is no longer available. Refresh and review the latest evidence.', 409);
      }
      const rules = structuredClone(envelope.config.rules);
      const rule = rules.temperature.find((entry) => entry.id === payload.id);
      rule.minimumIntervalMinutes = recommendation.minimumIntervalMinutes;
      rule.maximumOffset = recommendation.maximumOffset;
      // Saving only these two fields preserves rule enablement, sensors, target and all other rules.
      return this.config.save({ revision: envelope.revision, config: { rules } });
    });
  }

  refreshSnapshot() {
    this.live = this.dashboard.snapshot();
    this.sources = new Map(
      automationSources(this.live, this.external).flatMap((source) =>
        [source.id, ...(source.aliases ?? [])].map((id) => [id, source]),
      ),
    );
  }

  heatingDeviceOptions(options) {
    const devices = this.dashboard.snapshot().devices;
    return options.map((entry) => ({
      ...entry,
      scheduleTimeZone:
        scheduleTimeZone(
          entry,
          devices.find((device) => device.serial.toUpperCase() === entry.serialNumber.toUpperCase())?.data,
        ) ?? '',
    }));
  }

  device(serial) {
    return this.live.devices.find((device) => device.serial === serial && device.type === 'Thermostat');
  }

  connected(device) {
    const account = this.live.accounts.find((entry) => entry.id === device?.account);
    return Boolean(device && account?.authorised && account.observing && !device.needsUpdate && device.data.online === true);
  }

  temperatureInputs(rule) {
    const chosen = rule.sourceIds.map((id) => this.sources.get(id));
    if (
      !chosen.length ||
      chosen.some(
        (source) =>
          source?.kind !== 'temperature' ||
          !fresh(source, this.now()) ||
          !Number.isFinite(source.temperature) ||
          source.temperature < -100 ||
          source.temperature > 100,
      )
    ) {
      return null;
    }
    return chosen.reduce((sum, source) => sum + source.temperature, 0) / chosen.length;
  }

  pause(state, reason) {
    state.paused = true;
    state.phase = 'paused';
    state.reason = reason;
  }

  manualFan(id, reason) {
    this.fanOverrides.set(id, reason);
    for (const state of this.states.values()) {
      if (state.rule.kind === 'fan' && state.rule.targetIds.includes(id)) {
        state.phase = 'paused';
        state.reason = reason;
      }
    }
  }

  schedule(device, serial) {
    const zone = scheduleTimeZone(this.deviceOptions.find((entry) => entry.serialNumber === serial), device.data);
    const entries = Object.entries(device.data.schedules ?? {}).flatMap(([day, points]) =>
      Object.values(points ?? {}).map((point) => ({ day: Number(day), ...point })),
    );
    return {
      zone,
      entries,
      signature: JSON.stringify([entries, zone]),
      position: zone ? schedulePosition(entries, zone, this.now()) : null,
    };
  }

  observe(key, lease, value, state) {
    if (equal(value, lease.expected)) {
      const fan = lease.kind === 'fan' ? this.sources.get(lease.targetId) : undefined;
      if (fan?.speedAvailable && !lease.pending && Number.isFinite(lease.speedExpected) &&
          Math.abs(fan.speed - lease.speedExpected) >= 0.001) {
        this.leases.delete(key);
        this.manualFan(lease.targetId, 'A fan speed changed manually. Resume this fan when ready for automatic control.');
        return false;
      }
      if (fan?.speedAvailable) {
        lease.speedExpected = fan.speed;
      }
      lease.pending = false;
      return true;
    }
    if (lease.pending && equal(value, lease.before) && this.now() - lease.sentAt < ACK_TIMEOUT) {
      state.phase = 'waiting';
      state.reason = 'Waiting for the device to report the accepted command.';
      return false;
    }
    this.leases.delete(key);
    if (lease.kind === 'fan') {
      this.manualFan(lease.targetId, 'The fan changed or did not confirm a command. Review it, then Resume automatic control.');
    } else {
      this.pause(state, 'The device target/state changed or did not confirm a command. Review it, then Resume automatic control.');
    }
    return false;
  }

  async temperature(state) {
    // Reporting only: distinguish an applied rule's interval/feedback wait from a rule that cannot run.
    state.temperatureControl = 'waiting';
    const rule = state.rule;
    const device = this.device(rule.thermostatId);
    const key = 'temperature:' + rule.thermostatId;
    let lease = this.leases.get(key);
    state.nestTarget = target(device);
    state.roomTemperature = this.temperatureInputs(rule);
    if (!this.connected(device)) {
      state.phase = 'waiting';
      state.reason = 'Thermostat connection unavailable. Nest may retain its last target.';
      return;
    }
    if (!this.sensorSetup.permits(rule)) {
      state.phase = 'waiting';
      state.reason = this.sensorSetup.status(rule)?.reason ||
        'Another rule owns the native Nest sensor setup. Restore its sensor settings before continuing.';
      if (lease) {
        await this.release(key, lease);
      }
      return;
    }
    const requirements = [];
    if (device.data.hvac_mode !== 'heat') requirements.push('Select Heat mode on Nest.');
    if (device.data.eco_mode !== false) requirements.push(device.data.eco_mode === true ?
      'Turn Eco off on Nest.' : 'Waiting for Nest to report whether Eco is off.');
    if (!nativeSensorAllowsHeating(device.data)) requirements.push(device.data.active_rcs_sensor ?
      'Select the built-in Nest temperature sensor.' : device.data.native_sensor_control?.reason ?
        'Nest sensor feedback: ' + device.data.native_sensor_control.reason : 'Waiting for Nest to confirm its built-in temperature sensor.');
    if (device.data.can_heat === false) requirements.push('This thermostat does not report support for heating.');
    if (device.data.temperature_lock === true) requirements.push('Turn off the Nest temperature lock.');
    if (requirements.length) {
      if (lease) {
        this.leases.delete(key);
        this.pause(state, 'Nest mode, Eco, lock or active sensor changed. Native Nest control takes priority; Resume when ready.');
      } else {
        state.phase = 'waiting';
        state.reason = requirements.join(' ');
      }
      return;
    }
    const { zone, entries, signature: scheduleSignature, position: scheduleKey } = this.schedule(device, rule.thermostatId);
    if (state.controlStarted && (state.scheduleKey !== scheduleKey || state.scheduleSignature !== scheduleSignature)) {
      this.leases.delete(key);
      this.pause(state, 'A Nest schedule boundary or schedule change takes priority. Resume to start a new room-temperature hold.');
      return;
    }
    if (entries.length && !zone) {
      state.phase = 'waiting';
      state.reason = 'Nest has not reported a usable schedule time zone. Choose this thermostat’s time zone in Settings.';
      return;
    }
    if (lease) {
      if (lease.owner !== rule.id || lease.restoring) {
        return;
      }
      if (!this.observe(key, lease, target(device), state)) {
        if (lease.pending && !state.paused) {
          state.temperatureControl = 'updating';
        }
        return;
      }
    }
    if (!lease && state.controlStarted && !equal(state.referenceTarget, target(device))) {
      this.pause(state, 'The Nest target changed. Resume to start a new room-temperature hold.');
      return;
    }
    if (
      state.roomTemperature === null ||
      !Number.isFinite(device.data.physical_temperature) ||
      Math.abs(device.data.physical_temperature) > 100 ||
      !Number.isFinite(target(device)) ||
      target(device) < 9 ||
      target(device) > 32
    ) {
      state.phase = 'waiting';
      state.reason = 'A selected temperature is unavailable. Returning an owned target to its previous setting when possible.';
      if (lease) {
        await this.release(key, lease);
      }
      return;
    }
    const proposed = heatingTarget(
      rule.desiredTemperature,
      device.data.physical_temperature,
      state.roomTemperature,
      rule.maximumOffset ?? 1.5,
      device.data.temperature_scale,
    );
    state.proposedTarget = proposed;
    if (proposed === null) {
      state.phase = 'waiting';
      state.reason = 'The offset limit has no valid target on this thermostat’s temperature grid.';
      return;
    }
    if (!lease) {
      state.scheduleSignature = scheduleSignature;
      state.scheduleKey = scheduleKey;
      state.controlStarted = true;
      state.referenceTarget = target(device);
    }
    state.phase = 'active';
    state.temperatureControl = 'active';
    state.reason = 'Heating follows the selected room temperature within the configured adjustment limit.';
    state.nextChangeAt = Number.isFinite(state.lastWriteAt) ? state.lastWriteAt + (rule.minimumIntervalMinutes ?? 5) * MINUTE : null;
    if (equal(target(device), proposed)) {
      return;
    }
    if (state.nextChangeAt && this.now() < state.nextChangeAt) {
      state.phase = 'waiting';
      state.temperatureControl = 'interval';
      state.reason = 'Waiting for the minimum heating-target update interval.';
      return;
    }
    lease ??= { kind: 'temperature', targetId: rule.thermostatId, owner: rule.id, baseline: target(device) };
    lease.before = target(device);
    lease.expected = proposed;
    lease.sentAt = this.now();
    state.lastWriteAt = lease.sentAt;
    lease.pending = true;
    this.leases.set(key, lease);
    await this.persist();
    if (state.paused || this.stopping) {
      return;
    }
    await this.dashboard.setAutomationTarget(rule.thermostatId, proposed, lease.before,
      () => !state.paused && !this.stopping && this.sensorSetup.permits(rule));
    state.lastAction = { at: this.now(), value: proposed, message: 'Heating target accepted; awaiting device feedback.' };
    state.phase = 'waiting';
    state.temperatureControl = 'updating';
  }

  async fan(state) {
    const rule = state.rule;
    const targets = state.fanTargets.filter((id) => !this.fanOverrides.has(id));
    if (!targets.length) {
      state.phase = state.rule.targetIds.every((id) => this.fanOverrides.has(id)) ? 'paused' :
        state.fanPlan.demand === false ? 'active' : 'standby';
      state.reason = state.phase === 'paused' ? 'Fan automation is suspended after a manual change. Resume when ready.' :
        state.phase === 'standby' ? 'A higher-priority rule controls the selected fans.' : 'Run condition is clear.';
      return;
    }
    const managed = targets.filter((id) => rule.speedMode !== 'last' || this.leases.get('fan:' + id)?.mode === 'speed');
    if (managed.length) {
      await runFanSpeed(this, state, managed);
    }
    const powerTargets = targets.filter((id) => !managed.includes(id));
    if (!powerTargets.length) {
      return;
    }
    const demand = state.fanPlan.demand;
    if (demand === undefined) {
      state.phase = 'waiting';
      state.reason = 'Run-condition readings are unavailable. Returning owned fans to their previous state when possible.';
      for (const [key, lease] of this.leases) {
        if (lease.owner === rule.id && powerTargets.includes(lease.targetId)) {
          await this.release(key, lease);
        }
      }
      return;
    }
    state.demand = demand;
    state.fanObserved ??= {};
    state.fanWrites ??= {};
    state.phase = 'active';
    state.reason = demand ? 'Run condition is met.' : 'Run condition is clear.';
    for (const id of powerTargets) {
      const source = this.sources.get(id);
      const key = 'fan:' + id;
      let lease = this.leases.get(key);
      if (source?.kind !== 'fan' || !fresh(source, this.now()) || !source.canControl) {
        state.phase = 'waiting';
        state.reason = 'A selected fan is unavailable or no longer exposes standard on/off control.';
        continue;
      }
      if (lease && (lease.owner !== rule.id || lease.restoring || !this.observe(key, lease, source.running, state))) {
        if (state.paused) {
          return;
        }
        continue;
      }
      if (!lease && typeof state.fanObserved[id] === 'boolean' && state.fanObserved[id] !== source.running) {
        this.manualFan(id, 'A selected fan changed outside this rule. Resume when ready for automatic fan control.');
        continue;
      }
      state.fanObserved[id] = source.running;
      // Never switch off a fan that the rule did not turn on.
      const desired = demand ? true : lease?.baseline;
      if (desired === undefined || source.running === desired) {
        continue;
      }
      if (Number.isFinite(state.fanWrites[id]) && this.now() - state.fanWrites[id] < MINUTE) {
        state.phase = 'waiting';
        state.reason = 'Waiting for the minimum room-fan command interval.';
        state.nextChangeAt = state.fanWrites[id] + MINUTE;
        continue;
      }
      lease ??= { kind: 'fan', targetId: id, owner: rule.id, baseline: source.running };
      lease.before = source.running;
      lease.expected = desired;
      lease.sentAt = this.now();
      state.fanWrites[id] = lease.sentAt;
      lease.pending = true;
      this.leases.set(key, lease);
      await this.persist();
      if (state.paused || this.stopping) {
        return;
      }
      try {
        await this.access.setFan(id, desired, lease.before);
      } catch (error) {
        error.fanTargetId = id;
        throw error;
      }
      state.lastAction = { at: this.now(), value: desired, message: 'Room-fan command accepted; awaiting device feedback.' };
    }
  }

  occupancy(state) {
    const rule = state.rule;
    const now = this.now();
    state.holds ??= {};
    if (
      state.override &&
      Number.isFinite(state.override.until) &&
      state.override.until > now &&
      state.override.until <= now + 1440 * MINUTE &&
      typeof state.override.home === 'boolean'
    ) {
      state.home = state.override.home;
      state.fault = false;
      state.phase = 'override';
      state.reason = 'Manual presence override is active until its displayed expiry.';
      state.nextChangeAt = state.override.until;
      return;
    }
    delete state.override;
    const inputs = rule.sourceIds.map((id) => {
      const source = this.sources.get(id);
      if (!fresh(source, now) || !['motion', 'occupancy'].includes(source?.kind) || typeof source.detected !== 'boolean') {
        return null;
      }
      if (source.kind === 'motion') {
        if (source.detected) {
          state.holds[id] = now + (rule.holdMinutes ?? 10) * MINUTE;
        }
        return source.detected || (Number.isFinite(state.holds[id]) && state.holds[id] > now && state.holds[id] <= now + 1440 * MINUTE);
      }
      return source.detected;
    });
    const unknown = inputs.includes(null) || !inputs.length;
    const positive = rule.logic === 'all' ? inputs.length > 0 && inputs.every((value) => value === true) : inputs.includes(true);
    state.fault = unknown;
    if (positive) {
      state.home = true;
      state.awaySince = null;
      state.phase = unknown ? 'degraded' : 'active';
      state.reason = 'Home condition is met' + (unknown ? '; another selected source is unavailable.' : '.');
      state.nextChangeAt = null;
    } else if (unknown) {
      state.awaySince = null;
      state.phase = 'degraded';
      state.reason = 'A presence source is unavailable. Last confirmed state is retained; Away cannot be established.';
      state.nextChangeAt = null;
    } else {
      state.awaySince ??= now;
      if (state.awaySince > now) {
        state.awaySince = now;
      }
      state.nextChangeAt = state.awaySince + (rule.awayDelayMinutes ?? 20) * MINUTE;
      if (now >= state.nextChangeAt) {
        state.home = false;
        state.phase = 'active';
        state.reason = 'Away delay elapsed with no matching Home condition.';
      } else {
        state.phase = 'waiting';
        state.reason = 'Waiting for the Away delay; the previous confirmed state remains in effect.';
        state.fault = typeof state.home !== 'boolean';
      }
    }
  }

  async release(key, lease) {
    if (lease.mode === 'speed') {
      await releaseFanSpeed(this, key, lease);
      return;
    }
    const device = lease.kind === 'temperature' ? this.device(lease.targetId) : undefined;
    const source = lease.kind === 'fan' ? this.sources.get(lease.targetId) : undefined;
    if (lease.kind === 'temperature' ? !this.connected(device) : !fresh(source, this.now()) || !source.canControl) {
      lease.restoring = true;
      return;
    }
    const current = lease.kind === 'temperature' ? target(device) : source.running;
    if (
      lease.kind === 'temperature' &&
      (device.data.hvac_mode !== 'heat' ||
        device.data.eco_mode !== false ||
        !nativeSensorAllowsHeating(device.data) ||
        device.data.temperature_lock === true)
    ) {
      this.leases.delete(key);
      return;
    }
    if (lease.kind === 'temperature') {
      const owner = this.states.get(lease.owner);
      const schedule = this.schedule(device, lease.targetId);
      if (owner?.controlStarted && (owner.scheduleKey !== schedule.position || owner.scheduleSignature !== schedule.signature)) {
        this.leases.delete(key);
        return;
      }
    }
    if (!equal(current, lease.expected)) {
      if (lease.pending && equal(current, lease.before) && this.now() - lease.sentAt < ACK_TIMEOUT) {
        lease.restoring = true;
        return;
      }
      this.leases.delete(key);
      return;
    }
    if (equal(current, lease.baseline)) {
      this.leases.delete(key);
      const state = this.states.get(lease.owner);
      if (state && lease.kind === 'temperature') {
        state.controlStarted = false;
      } else if (state?.fanObserved) {
        state.fanObserved[lease.targetId] = current;
      }
      return;
    }
    lease.before = current;
    lease.expected = lease.baseline;
    lease.pending = true;
    lease.restoring = true;
    lease.sentAt = this.now();
    const owner = this.states.get(lease.owner);
    if (owner && lease.kind === 'temperature') {
      owner.lastWriteAt = lease.sentAt;
    } else if (owner) {
      (owner.fanWrites ??= {})[lease.targetId] = lease.sentAt;
    }
    await this.persist();
    if (lease.kind === 'temperature') {
      await this.dashboard.setAutomationTarget(lease.targetId, lease.baseline, current);
    } else {
      await this.access.setFan(lease.targetId, lease.baseline, current);
    }
  }

  // Called before direct HomeKit/dashboard commands. Native user intent wins even before cloud feedback arrives.
  async manualThermostat(deviceId) {
    let changed = false;
    for (const state of this.states.values()) {
      const device = this.dashboard.devices.get(state.rule.thermostatId);
      if (state.rule.kind === 'temperature' && state.rule.enabled && device?.id === deviceId) {
        this.pause(state, 'A manual Nest control was used. Resume when ready to use the room-temperature group again.');
        this.leases.delete('temperature:' + state.rule.thermostatId);
        changed = true;
      }
    }
    if (changed) {
      await this.persist().catch(() => {
        this.error = 'The manual override is active, but its state could not be saved.';
      });
    }
  }

  control(payload) {
    return this.serialize(async () => {
      if (this.stopping || !payload || Object.keys(payload).some((key) => !['id', 'action', 'minutes', 'confirmation'].includes(key))) {
        throw new Error('Invalid automation command.');
      }
      if (['prepareSensors', 'restoreSensors'].includes(payload.action)) {
        await this.evaluate();
        const state = this.states.get(payload.id);
        if (!state || state.rule.kind !== 'temperature') {
          throw new DashboardConfigError('Select a saved temperature rule.');
        }
        await this.sensorSetup.action(state, payload.action, payload.confirmation);
        await this.evaluate();
        return this.snapshot();
      }
      const state = this.states.get(payload.id);
      if (!state?.rule.enabled || !['pause', 'resume', 'home', 'away'].includes(payload.action)) {
        throw new Error('Select an enabled rule and supported action.');
      }
      if (['home', 'away'].includes(payload.action)) {
        const minutes = payload.minutes ?? 60;
        if (state.rule.kind !== 'presence' || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
          throw new Error('Presence overrides must last from 1 to 1440 minutes.');
        }
        state.override = { home: payload.action === 'home', until: this.now() + minutes * MINUTE };
        state.paused = false;
      } else {
        state.paused = payload.action === 'pause';
        state.reason = state.paused
          ? 'Paused by you. Owned equipment settings are restored when reachable.'
          : 'Resuming automatic control.';
        delete state.override;
        state.awaySince = null;
        if (!state.paused) {
          state.controlStarted = false;
          state.fanObserved = {};
          state.fanSpeedObserved = {};
          state.demand = false;
          if (state.rule.kind === 'fan') {
            for (const id of state.rule.targetIds) {
              this.fanOverrides.delete(id);
              this.fanObservations.delete(id);
              for (const candidate of this.states.values()) {
                delete candidate.fanObserved?.[id];
                delete candidate.fanSpeedObserved?.[id];
              }
            }
          }
        }
      }
      await this.persist();
      await this.evaluate();
      return this.snapshot();
    });
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.queue;
    try {
      if (this.access) {
        await this.readSources();
      }
      this.refreshSnapshot();
      for (const [key, lease] of this.leases) {
        await this.release(key, lease);
      }
      await this.persist();
    } catch {
      this.log?.warn?.('Climate automation could not restore every owned setting during shutdown. Check the equipment.');
    }
    this.access?.close();
    await this.saving;
    await this.heatingResponse.persist(true);
  }
}

