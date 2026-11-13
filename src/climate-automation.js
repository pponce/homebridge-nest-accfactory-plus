import { ruleWindow, windowActive } from '../homebridge-ui/public/rule-window.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ClimateAccess } from '../homebridge-ui/climate-access.js';
import { HeatingResponse } from './heating-response.js';
import { DashboardConfigError } from './web-dashboard-config.js';
import { sensorSources, presenceSources } from '../homebridge-ui/public/sensor-preview.js';
import { scheduleTimeZone, selectedNestSensor } from '../homebridge-ui/public/climate-utils.js';
import { normalizeFanRule } from '../homebridge-ui/public/fan-speed.js';
import { runFanSpeed, releaseFanSpeed, validSpeedLease, prepareFanRules, handoffFanLease } from './fan-speed-control.js';
import { TemperatureSensorSetup, nativeSensorAllowsHeating } from './temperature-sensor-setup.js';
import { explainRule } from './climate-explanations.js';

const MINUTE = 60000;
const ACK_TIMEOUT = 2 * MINUTE;
const FEEDBACK_REFRESH_DELAY = 30000;
const MAX_FEEDBACK_REFRESH_DELAY = 5 * MINUTE;
const LEGACY_SCHEDULE_TIMEOUT = 'Nest did not confirm its scheduled heating target. Review it, then Resume automatic control.';
// Nest's mapped feedback is rounded to 0.5 °C, including whole-Fahrenheit targets.
// A 0.26 °C tolerance accepts that rounding while detecting the next reported half-degree step.
const equal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.26 : a === b);
const fresh = (source, now) =>
  source?.available === true && Number.isFinite(source.lastReadAt) && source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;
const target = (device) => device?.data.target_temperature_low ?? device?.data.target_temperature;
const validTarget = (value) => Number.isFinite(value) && value >= 9 && value <= 32;
const desiredTarget = (state) => state.roomTarget?.value ?? state.rule.desiredTemperature;
const targetDelta = (before, after, scale) => scale === 'F' ?
    (Math.round(after * 1.8 + 32) - Math.round(before * 1.8 + 32)) / 1.8 : after - before;
const shiftedTarget = (desired, delta) => Number(Math.max(9, Math.min(32, desired + delta)).toFixed(8));
const flatten = (rules) => [...rules.temperature, ...rules.fans, ...rules.occupancy];

function schedulePosition(entries, timeZone, now) {
  if (!entries.length) {
    return { position: null, desired: null };
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
  const events = entries
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
      return { position: today - days * 86400000 + entry.time * 1000, desired: entry['temp-min'] };
    });
  const position = events.length ? Math.max(...events.map((event) => event.position)) : null;
  const active = events.filter((event) => event.position === position);
  const desired = active.length && active.every((event) => validTarget(event.desired) && event.desired === active[0].desired) ?
    active[0].desired : null;
  return { position, desired };
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
  constructor({ directory, dashboard, config, accessFactory, presence, onState, now = Date.now, intervalMs = 15000, log }) {
    this.directory = directory;
    this.dashboard = dashboard;
    this.config = config;
    this.accessFactory = accessFactory ?? (() => new ClimateAccess(config.file));
    this.presence = presence;
    this.now = now;
    this.intervalMs = intervalMs;
    this.log = log;
    this.onState = onState;
    this.states = new Map();
    this.explanations = new Map();
    this.leases = new Map();
    this.fanOverrides = new Map();
    this.fanObservations = new Map();
    this.fanWinners = new Map();
    this.feedbackRefreshes = new Map();
    this.feedbackRecoveryUntil = new Map();
    this.queue = Promise.resolve();
    this.saving = Promise.resolve();
    this.external = { sources: [], bridges: [] };
    this.rules = [];
    this.stopping = false;
    this.heatingResponse = new HeatingResponse({ directory, now });
    this.sensorSetup = new TemperatureSensorSetup(this);
  }

  notifyState() {
    try {
      this.onState?.();
    } catch {
      this.log?.warn?.('Climate status could not be refreshed in Apple Home. Automatic control will continue.');
    }
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
        if (state.rule.kind === 'temperature') {
          if (state.scheduleTarget && (!validTarget(state.scheduleTarget.expected) || !Number.isFinite(state.scheduleTarget.at))) {
            throw new Error('Invalid saved schedule target');
          }
          if (state.roomTarget && (!validTarget(state.roomTarget.value) || !['manual', 'schedule'].includes(state.roomTarget.source))) {
            throw new Error('Invalid saved room target');
          }
          if (state.manualTarget && (!state.manualTarget.accepted || !validTarget(state.manualTarget.expected) ||
              !validTarget(state.manualTarget.desired) || !Number.isFinite(state.manualTarget.at))) {
            state.paused = true;
            state.reason = 'A manual target was not confirmed before restart. Review Nest, then Resume.';
            delete state.manualTarget;
          }
        }
        if (state.rule.kind === 'fan') {
          state.rule = normalizeFanRule(state.rule);
        }
        if (state.rule.kind !== 'presence' && state.rule.enabled && !state.paused) {
          state.restartPolicyPending = true;
          state.recovering = true;
          state.phase = 'waiting';
          state.temperatureControl = 'waiting';
          state.reason = 'Bridge restarted. Waiting for current readings and equipment checks.';
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
      if (data.fanObservations !== undefined) {
        if (!Array.isArray(data.fanObservations) || data.fanObservations.length > 256 || data.fanObservations.some((entry) =>
          !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || entry[0].length > 256 ||
          typeof entry[1]?.running !== 'boolean' ||
          (entry[1].speed !== undefined && (!Number.isFinite(entry[1].speed) || entry[1].speed < 0 || entry[1].speed > 100)))) {
          throw new Error('Invalid saved fan observations');
        }
        this.fanObservations = new Map(data.fanObservations);
      }
      this.sensorSetup.load(data.sensorSetups);
      // Older schedule timeouts retained their pending event but latched every group off.
      // Only that exact recoverable pause may migrate; user/conflict/restart-policy pauses still win.
      for (const state of this.states.values()) {
        if (state.rule.kind !== 'temperature' || !state.paused || !state.controlStarted ||
            state.reason !== LEGACY_SCHEDULE_TIMEOUT || !state.scheduleTarget) {
          continue;
        }
        const groups = [...this.states.values()].filter((entry) =>
          entry.rule.kind === 'temperature' && entry.rule.thermostatId === state.rule.thermostatId);
        if (groups.some((entry) => entry.paused && entry.thermostatPause !== LEGACY_SCHEDULE_TIMEOUT &&
            entry.reason !== LEGACY_SCHEDULE_TIMEOUT)) {
          continue;
        }
        state.scheduleTarget.priorTargets ??= [state.referenceTarget, state.nestTarget].filter(validTarget);
        this.supersedeHeatingCommand(state);
        for (const candidate of groups) {
          if (candidate.thermostatPause === LEGACY_SCHEDULE_TIMEOUT || candidate.reason === LEGACY_SCHEDULE_TIMEOUT) {
            candidate.paused = false;
            delete candidate.thermostatPause;
            candidate.restartPolicyPending = true;
            candidate.recovering = true;
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.states.clear();
        this.leases.clear();
        this.fanOverrides.clear();
        this.fanObservations.clear();
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
      fanOverrides: [...this.fanOverrides], fanObservations: [...this.fanObservations], sensorSetups: this.sensorSetup.entries() });
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
        window: state.rule.window,
        nextWindowStart: state.windowStatus?.nextStart ?? null,
        desiredTemperature: desiredTarget(state),
        savedDesiredTemperature: state.rule.desiredTemperature,
        targetSource: state.roomTarget?.source ?? 'rule',
        manualTargetBehavior: state.rule.kind === 'temperature' ? state.rule.manualTargetBehavior ?? 'follow' : undefined,
        hasSchedule: state.scheduleKey !== undefined && state.scheduleKey !== null,
        nestTarget: target(this.dashboard.devices.get(state.rule.thermostatId)) ?? state.nestTarget,
        nestUpdatedAt: this.dashboard.devices.get(state.rule.thermostatId)?.lastUpdate,
        proposedTarget: state.proposedTarget,
        nextChangeAt: state.nextChangeAt,
        home: state.home,
        fault: state.fault,
        override: state.override,
        lastAction: state.lastAction,
        feedback: state.rule.kind === 'temperature' ? this.heatingFeedbackState(state) : undefined,
        sensorSetup: this.sensorSetup.status(state.rule),
        explanation: this.explanations.get(state.rule.id),
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

  heatingFeedbackState(state) {
    const lease = this.leases.get('temperature:' + state.rule.thermostatId);
    const pending = state.scheduleTarget ?? state.manualTarget ??
      (lease?.owner === state.rule.id && lease.pending && !lease.restoring ? lease : null);
    if (!pending) {
      return null;
    }
    const kind = state.scheduleTarget ? 'schedule' : state.manualTarget ? 'manual' : 'command';
    const since = pending.at ?? pending.sentAt;
    return { kind, expected: pending.expected, since,
      automaticRecovery: kind !== 'manual' && !state.paused,
      recovering: kind !== 'manual' && !state.paused && this.now() - since >= ACK_TIMEOUT,
      refreshAttempts: pending.feedbackRefreshAttempts ?? 0,
      nextRefreshAt: pending.feedbackNextRefreshAt ?? since + FEEDBACK_REFRESH_DELAY };
  }

  waitHeatingFeedback(state, pending, kind) {
    const since = pending.at ?? pending.sentAt;
    const elapsed = this.now() - since;
    const device = this.dashboard.devices.get(state.rule.thermostatId);
    const account = device?.account;
    const next = pending.feedbackNextRefreshAt ?? since + FEEDBACK_REFRESH_DELAY;
    if (elapsed >= FEEDBACK_REFRESH_DELAY && this.now() >= next &&
        this.now() >= (this.feedbackRefreshes.get(account) ?? 0)) {
      const attempts = Math.min(8, (pending.feedbackRefreshAttempts ?? 0) + 1);
      pending.feedbackRefreshAttempts = attempts;
      pending.feedbackNextRefreshAt = this.now() + Math.min(MAX_FEEDBACK_REFRESH_DELAY, MINUTE * 2 ** (attempts - 1));
      // Thermostats on one account share an Observe stream. Do not reconnect it repeatedly in a single tick.
      this.feedbackRefreshes.set(account, this.now() + FEEDBACK_REFRESH_DELAY);
      const refreshed = this.dashboard.refreshFeedback(state.rule.thermostatId);
      pending.feedbackRefreshed = refreshed || pending.feedbackRefreshed === true;
      if (refreshed) {
        this.feedbackRecoveryUntil.set(account, this.now() + ACK_TIMEOUT);
      }
      this.refreshSnapshot();
    }
    const recovering = elapsed >= ACK_TIMEOUT;
    state.phase = recovering ? 'recovering' : 'waiting';
    state.temperatureControl = recovering ? 'recovering' : 'updating';
    state.reason = kind === 'schedule' ?
      (recovering ? 'Recovering scheduled heating feedback. Control will resume automatically when Nest confirms the current schedule target.' :
        'Waiting for Nest to report its scheduled target before adjusting the room temperature.') :
      (recovering ? 'Recovering delayed Nest feedback. Control will resume automatically when the accepted heating target is confirmed.' :
        pending.feedbackRefreshed ? 'Refreshing Nest feedback to confirm the accepted heating target. The temperature command is not repeated.' :
          'Waiting for the device to report the accepted command.');
    if (kind === 'command' && recovering && state.lastAction) {
      state.lastAction = { ...state.lastAction, status: 'recovering',
        message: 'Heating command accepted; awaiting delayed Nest feedback. No repeat command is sent.' };
    }
    return false;
  }

  supersedeHeatingCommand(state) {
    if (state.lastAction && [undefined, 'accepted', 'recovering'].includes(state.lastAction.status)) {
      state.lastAction = { ...state.lastAction, status: 'superseded',
        message: 'The last heating request was superseded by a Nest schedule change.' };
    }
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
        this.notifyState();
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
    this.fanMappings = envelope.config.fanMappings ?? [];
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
        if (rule.kind === 'temperature') {
          this.resetTemperatureTarget(state);
        }
      }
      if (old && rule.kind === 'temperature' &&
          (old.rule.desiredTemperature !== rule.desiredTemperature || old.rule.thermostatId !== rule.thermostatId)) {
        if (state.manualTarget) {
          this.pause(state, 'The room target changed during a manual Nest command. Review it, then Resume.');
        }
        this.resetTemperatureTarget(state);
      }
      if (old && JSON.stringify(old.rule.sourceIds) !== JSON.stringify(rule.sourceIds)) {
        state.holds = {};
        state.lastDetectedAt = {};
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
      if (state.restartPolicyPending) {
        delete state.restartPolicyPending;
        if (envelope.config.options?.pauseOnRestart === true) {
          this.pause(state, 'Pause after bridge restart is enabled. Resume when ready for automatic control.');
        }
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
    for (const state of this.states.values()) {
      if (state.rule.kind !== 'presence') {
        continue;
      }
      for (const id of state.rule.sourceIds) {
        const source = this.sources.get(id);
        if (fresh(source, this.now()) && ['motion', 'occupancy'].includes(source.kind) && source.detected === true) {
          (state.lastDetectedAt ??= {})[id] = this.now();
        }
      }
    }
    await this.sensorSetup.observe();
    this.presence?.sync(this.rules.filter((rule) => rule.kind === 'presence' && rule.enabled));
    // Persist configuration intent before permitting any side effects.
    await this.persist();
    this.prepareWindows();
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
        owner.windowStatus?.active !== false &&
        (lease.kind !== 'temperature' || this.temperatureWinners.get(lease.targetId) === lease.owner) &&
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
      if (state.rule.kind !== 'presence' && !state.windowStatus.active) {
        state.phase = state.windowStatus.error ? 'waiting' : 'scheduled';
        state.temperatureControl = state.phase;
        state.reason = state.windowStatus.error || 'Outside this rule’s time window.';
        if (state.windowStatus.nextStart) {
          state.reason += ' Next start: ' + new Intl.DateTimeFormat('en-US', { timeZone: state.rule.window.timeZone,
            weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(state.windowStatus.nextStart) + '.';
        }
        state.demand = false;
        continue;
      }
      if (state.rule.kind === 'temperature' && this.temperatureWinners.get(state.rule.thermostatId) !== state.rule.id) {
        state.phase = 'standby';
        state.temperatureControl = 'standby';
        state.reason = 'A higher-priority temperature rule is selected for this thermostat.';
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
          if (state.rule.kind === 'temperature' && !state.paused && !this.stopping) {
            state.phase = 'waiting';
            state.temperatureControl = state.manualTarget ? 'updating' : 'waiting';
            state.reason = 'Nest changed before the adjustment was sent. Waiting for current target feedback.';
            continue;
          }
        }
        this.pause(state, 'Command or state storage failed. Check the equipment before resuming; no automatic retry is made.');
      }
    }
    await this.observeHeating();
    await this.persist();
    this.explanations = new Map([...this.states].map(([id, state]) => [id, explainRule(this, state, heatingTarget)]));
  }

  prepareWindows() {
    const states = [...this.states.values()];
    for (const state of states) {
      state.windowStatus = ruleWindow(state.rule.window, this.now());
    }
    this.temperatureWinners = new Map();
    const temperatures = states.filter((state) => state.rule.kind === 'temperature');
    for (const state of temperatures.sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0))) {
      const serial = state.rule.thermostatId;
      const suspended = temperatures.find((entry) => entry.rule.thermostatId === serial && entry.thermostatPause);
      if (suspended) {
        state.paused = true;
        state.thermostatPause = suspended.thermostatPause;
        state.reason = suspended.thermostatPause;
      }
      if (!state.rule.enabled || state.paused || !state.windowStatus.active || this.temperatureWinners.has(serial)) {
        continue;
      }
      this.temperatureWinners.set(serial, state.rule.id);
      const key = 'temperature:' + serial;
      const previous = temperatures.find((entry) => entry !== state && entry.rule.thermostatId === serial && entry.controlOwner) ??
        (!state.controlOwner ? temperatures.find((entry) => entry !== state && entry.rule.thermostatId === serial &&
          (this.leases.get(key)?.owner === entry.rule.id || entry.controlStarted)) : undefined);
      if (previous && !previous.paused) {
        const device = this.device(serial);
        // Observe the outgoing group's feedback before changing groups. A manual change
        // at a boundary belongs to its room target and manual-change policy.
        if (previous.controlStarted && this.connected(device) && validTarget(target(device)) &&
            device.data.hvac_mode === 'heat' && device.data.eco_mode === false &&
            device.data.temperature_lock !== true && nativeSensorAllowsHeating(device.data)) {
          if (this.temperatureSchedule(previous, device, this.schedule(device, serial))) {
            this.temperatureFeedback(previous, device, this.leases.get(key));
          }
        } else if (previous.roomTarget && this.connected(device) &&
            previous.scheduleKey !== this.schedule(device, serial).position) {
          delete previous.roomTarget;
        }
        if (previous.paused) {
          continue;
        }
        const fields = ['controlStarted', 'roomTarget', 'manualTarget', 'scheduleTarget', 'referenceTarget',
          'scheduleKey', 'scheduleSignature', 'scheduleDesired', 'scheduleZone', 'lastWriteAt', 'targetEpoch', 'recovering'];
        for (const field of fields) {
          if (previous[field] === undefined) {
            delete state[field];
          } else {
            state[field] = previous[field];
          }
        }
        state.handoffNotBefore = Math.max(previous.handoffNotBefore ?? 0,
          (previous.lastWriteAt ?? 0) + (previous.rule.minimumIntervalMinutes ?? 5) * MINUTE);
        previous.controlStarted = false;
        previous.controlOwner = false;
        delete previous.manualTarget;
        delete previous.scheduleTarget;
        delete previous.roomTarget;
        const lease = this.leases.get(key);
        if (lease?.restoring) {
          state.controlStarted = false;
        }
        if (lease?.owner === previous.rule.id && !lease.restoring) {
          lease.owner = state.rule.id;
        }
      }
      state.controlOwner = true;
    }
  }

  windowPermits(state, targetId) {
    if (this.stopping || state.paused || !state.rule.enabled || !windowActive(state.rule.window, this.now())) {
      return false;
    }
    if (state.rule.kind === 'fan') {
      return ![...this.states.values()].some((other) => other !== state && other.rule.kind === 'fan' &&
        other.rule.targetIds.includes(targetId) && other.rule.enabled && !other.paused &&
        (other.rule.priority ?? 0) > (state.rule.priority ?? 0) && windowActive(other.rule.window, this.now()) &&
        (other.windowStatus?.active === false || other.fanPlan?.demand !== false));
    }
    return ![...this.states.values()].some((other) => other !== state && other.rule.kind === 'temperature' &&
      other.rule.thermostatId === state.rule.thermostatId && other.rule.enabled && !other.paused &&
      (other.rule.priority ?? 0) > (state.rule.priority ?? 0) && windowActive(other.rule.window, this.now()));
  }

  undoPreparedCommand(key, lease, previous, state, lastWriteAt) {
    if (this.leases.get(key) !== lease) {
      return;
    }
    if (previous) {
      this.leases.set(key, previous);
    } else {
      this.leases.delete(key);
    }
    if (lease.kind === 'temperature') {
      state.lastWriteAt = lastWriteAt;
      state.temperatureControl = 'waiting';
    } else {
      state.fanWrites[lease.targetId] = lastWriteAt;
    }
    state.phase = 'waiting';
    state.reason = 'The time window changed before the command was sent. Checking the current rule.';
  }

  async observeHeating() {
    const rules = this.rules.filter((rule) => rule.kind === 'temperature').map((rule) => ({
      ...rule, desiredTemperature: desiredTarget(this.states.get(rule.id) ?? { rule }),
    }));
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
              (!rule.enabled || this.temperatureWinners.get(rule.thermostatId) === rule.id) &&
              !this.states.get(rule.id)?.manualTarget && !this.states.get(rule.id)?.scheduleTarget &&
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
        ...this.heatingResponse.snapshot(envelope.config.rules.temperature.map((rule) => {
          const state = this.states.get(rule.id);
          return state && state.rule.thermostatId === rule.thermostatId && state.rule.desiredTemperature === rule.desiredTemperature ?
              { ...rule, desiredTemperature: desiredTarget(state) } : rule;
        }), this.heatingDeviceOptions(envelope.config.devices)),
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
      automationSources(this.live, this.external).map((source) => source.kind === 'fan' ? { ...source,
        speedMapping: this.fanMappings?.find((mapping) => mapping.sourceId === source.id)?.ranges } : source).flatMap((source) =>
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

  temperatureInputs(rule, sources = this.sources) {
    const chosen = rule.sourceIds.map((id) => sources.get(id));
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

  homeKitRoom(serial) {
    if (!this.deviceOptions?.some((option) =>
      option.serialNumber.toUpperCase() === serial.toUpperCase() && option.homeKitRoomTemperature === true)) {
      return null;
    }
    return this.roomControl(serial);
  }

  roomControl(serial) {
    if (this.stopping || this.error) {
      return null;
    }
    const candidates = [...this.states.values()].filter((state) =>
      state.rule.kind === 'temperature' && state.rule.enabled && state.rule.thermostatId === serial);
    const state = candidates.filter((entry) => !entry.paused && windowActive(entry.rule.window, this.now()))
      .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0))[0];
    if (!state?.controlOwner) {
      return null;
    }
    if (!state?.controlStarted || state.paused || state.manualTarget || state.scheduleTarget ||
        !['active', 'interval', 'updating'].includes(this.temperatureControlStatus(state))) {
      return null;
    }
    const live = { devices: [...this.dashboard.devices.values()], accounts: this.dashboard.accounts(), generatedAt: this.now() };
    const device = live.devices.find((entry) => entry.serial === serial);
    const account = live.accounts.find((entry) => entry.id === device?.account);
    if (!device || !account?.authorised || !account.observing || device.needsUpdate || device.data.online !== true ||
        device.data.hvac_mode !== 'heat' || device.data.eco_mode !== false || device.data.temperature_lock === true ||
        device.data.can_heat === false ||
        !nativeSensorAllowsHeating(device.data) || !this.sensorSetup.permits(state.rule)) {
      return null;
    }
    const lease = this.leases.get('temperature:' + serial);
    const actual = target(device);
    const schedule = this.schedule(device, serial);
    if (lease?.restoring || (lease && lease.owner !== state.rule.id) ||
        !equal(actual, lease?.expected ?? state.referenceTarget) && !(lease?.pending && equal(actual, lease.before)) ||
        schedule.position !== state.scheduleKey || schedule.signature !== state.scheduleSignature) {
      return null;
    }
    const sources = new Map(automationSources(live, this.external).flatMap((source) =>
      [source.id, ...(source.aliases ?? [])].map((id) => [id, source])));
    const temperature = this.temperatureInputs(state.rule, sources);
    return temperature === null || !validTarget(desiredTarget(state)) ? null : {
      ruleId: state.rule.id, temperature, desiredTemperature: desiredTarget(state),
    };
  }

  setHomeKitRoomTarget(deviceId, request) {
    return this.setRoomTarget(deviceId, request, true);
  }

  setRoomTarget(deviceId, request, homeKit = false, permitted = () => true) {
    return this.serialize(async () => {
      const envelope = await this.config.snapshot();
      const state = this.states.get(request?.ruleId);
      const serial = state?.rule.thermostatId;
      const saved = envelope.config.rules.temperature.find((rule) => rule.id === request?.ruleId);
      const enabled = envelope.config.devices.some((option) =>
        option.serialNumber.toUpperCase() === serial?.toUpperCase() && option.homeKitRoomTemperature === true);
      if (envelope.rulesError || (homeKit && !enabled) || !permitted() || JSON.stringify(saved) !== JSON.stringify(state?.rule) ||
          !this.roomControl(serial) || this.dashboard.devices.get(serial)?.id !== deviceId ||
          !request || Object.keys(request).some((key) => !['ruleId', 'value'].includes(key)) || !validTarget(request.value)) {
        throw new Error('The room-temperature rule is unavailable. Refresh the thermostat before changing its target.');
      }
      // This is an absolute room target. Retain pending compensation ownership so its feedback
      // cannot be mistaken for a physical Nest change, and preserve the minimum write interval.
      const previous = state.roomTarget;
      state.roomTarget = { value: request.value, source: 'manual' };
      state.targetEpoch = (state.targetEpoch ?? 0) + 1;
      try {
        await this.persist();
      } catch (error) {
        state.roomTarget = previous;
        this.pause(state, 'The desired room temperature could not be saved. Review the rule, then Resume.');
        throw error;
      }
      await this.evaluate();
      if (!this.roomControl(serial)) {
        throw new Error('Room control became unavailable. Review the rule before changing its target.');
      }
    }).finally(() => this.notifyState());
  }

  pause(state, reason) {
    if (state.rule.kind === 'temperature') {
      for (const candidate of this.states.values()) {
        if (candidate.rule.kind === 'temperature' && candidate.rule.thermostatId === state.rule.thermostatId) {
          candidate.paused = true;
          candidate.thermostatPause = reason;
          candidate.phase = 'paused';
          candidate.reason = reason;
        }
      }
    }
    state.paused = true;
    state.phase = 'paused';
    state.reason = reason;
  }

  resetTemperatureTarget(state) {
    delete state.roomTarget;
    delete state.manualTarget;
    delete state.scheduleTarget;
    state.controlStarted = false;
    state.targetEpoch = (state.targetEpoch ?? 0) + 1;
  }

  applyRoomTarget(state, value, source, actual) {
    state.roomTarget = { value, source };
    state.referenceTarget = actual;
    state.lastWriteAt = this.now();
    this.leases.delete('temperature:' + state.rule.thermostatId);
    state.targetEpoch = (state.targetEpoch ?? 0) + 1;
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
      ...(zone ? schedulePosition(entries, zone, this.now()) : { position: null, desired: null }),
    };
  }

  temperatureSchedule(state, device, schedule) {
    if (!state.controlStarted) {
      return true;
    }
    const key = 'temperature:' + state.rule.thermostatId;
    if (state.scheduleZone !== undefined && state.scheduleZone !== schedule.zone) {
      this.leases.delete(key);
      this.pause(state, 'The Nest schedule time zone changed. Review it, then Resume automatic control.');
      return false;
    }
    const changed = state.scheduleKey !== schedule.position ||
      (state.scheduleSignature !== schedule.signature && state.scheduleDesired !== schedule.desired);
    if (changed) {
      const previous = this.leases.get(key);
      const priorTargets = [...new Set([target(device), state.scheduleTarget?.expected,
        previous?.expected, state.referenceTarget].filter(validTarget))];
      this.leases.delete(key);
      delete state.manualTarget;
      state.targetEpoch = (state.targetEpoch ?? 0) + 1;
      if (!validTarget(schedule.desired)) {
        this.pause(state, 'Nest has not reported a usable heating target for its current schedule. Review it, then Resume.');
        return false;
      }
      state.scheduleTarget = { expected: schedule.desired, at: this.now(), priorTargets };
      this.supersedeHeatingCommand(state);
      state.scheduleKey = schedule.position;
      state.scheduleDesired = schedule.desired;
    }
    state.scheduleSignature = schedule.signature;
    if (!state.scheduleTarget) {
      return true;
    }
    if (equal(target(device), state.scheduleTarget.expected)) {
      this.applyRoomTarget(state, state.scheduleTarget.expected, 'schedule', target(device));
      delete state.scheduleTarget;
      return true;
    }
    const prior = state.scheduleTarget.priorTargets ?? [state.referenceTarget, state.nestTarget].filter(validTarget);
    if (validTarget(target(device)) && prior.length && !prior.some((value) => equal(value, target(device)))) {
      this.pause(state, 'Nest reported a different target while its scheduled heating target was pending. Review it, then Resume.');
      return false;
    }
    return this.waitHeatingFeedback(state, state.scheduleTarget, 'schedule');
  }

  temperatureFeedback(state, device, lease) {
    const actual = target(device);
    const key = 'temperature:' + state.rule.thermostatId;
    if (state.manualTarget) {
      const pending = state.manualTarget;
      if (pending.accepted && equal(actual, pending.expected)) {
        this.applyRoomTarget(state, pending.desired, 'manual', actual);
        delete state.manualTarget;
        return true;
      }
      if (this.now() - pending.at >= ACK_TIMEOUT) {
        delete state.manualTarget;
        this.pause(state, 'Nest did not confirm the manual target change. Review it, then Resume automatic control.');
      } else {
        state.phase = 'waiting';
        state.temperatureControl = 'updating';
        state.reason = 'Waiting for Nest to confirm the manual target change; the sensor group is retained.';
      }
      return false;
    }
    if (lease && (lease.owner !== state.rule.id || lease.restoring)) {
      return false;
    }
    if (lease?.pending) {
      if (!this.observe(key, lease, actual, state)) {
        return false;
      }
      state.referenceTarget = actual;
      return true;
    }
    const previous = state.referenceTarget ?? lease?.expected;
    if (state.controlStarted && validTarget(previous) && !equal(actual, previous)) {
      this.leases.delete(key);
      if (state.rule.manualTargetBehavior === 'pause') {
        this.pause(state, 'Nest’s target changed manually. Resume when ready to use the room-temperature group again.');
        return false;
      }
      this.applyRoomTarget(state, shiftedTarget(desiredTarget(state), targetDelta(previous, actual, device.data.temperature_scale)),
        'manual', actual);
    }
    return true;
  }

  observe(key, lease, value, state) {
    if (equal(value, lease.expected)) {
      if (lease.kind === 'temperature' && lease.pending) {
        lease.confirmedAt = this.now();
        if (state.lastAction) {
          state.lastAction = { ...state.lastAction, status: 'confirmed', confirmedAt: this.now(),
            message: 'Heating target confirmed by Nest.' };
        }
      }
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
    if (lease.kind === 'temperature' && lease.pending && equal(value, lease.before)) {
      return this.waitHeatingFeedback(state, lease, 'command');
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
      this.unconfirmedHeating(state, key, equal(value, lease.before) ?
        'Nest feedback did not confirm the heating target within two minutes. Check Nest, then Resume automatic control.' :
        'Nest reported a different heating target from the requested command. Review it, then Resume automatic control.');
    }
    return false;
  }

  unconfirmedHeating(state, key, reason) {
    this.leases.delete(key);
    if (state.lastAction) {
      state.lastAction = { ...state.lastAction, status: 'unconfirmed',
        message: 'Heating command accepted, but its target was not confirmed. Automatic control is paused.' };
    }
    this.pause(state, reason);
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
      if (state.scheduleTarget || (lease?.pending && !lease.restoring)) {
        this.waitHeatingFeedback(state, state.scheduleTarget ?? lease, state.scheduleTarget ? 'schedule' : 'command');
        return;
      }
      state.phase = 'waiting';
      state.temperatureControl = lease?.pending ? 'updating' : 'waiting';
      state.reason = lease?.feedbackRefreshed ?
        'Refreshing Nest feedback to confirm the accepted heating target. The temperature command is not repeated.' :
        'Thermostat connection unavailable. Nest may retain its last target.';
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
    if (device.data.hvac_mode !== 'heat') {
      requirements.push(device.data.hvac_mode === undefined ?
        'Waiting for Nest to report its operating mode.' : 'Select Heat mode on Nest.');
    }
    if (device.data.eco_mode !== false) {
      requirements.push(device.data.eco_mode === true ?
        'Turn Eco off on Nest.' : 'Waiting for Nest to report whether Eco is off.');
    }
    if (!nativeSensorAllowsHeating(device.data)) {
      let reason = 'Waiting for Nest to confirm its built-in temperature sensor.';
      if (selectedNestSensor(device.data) || device.data.active_rcs_sensor) {
        reason = 'Select the built-in Nest temperature sensor.';
      } else if (device.data.native_sensor_control?.reason) {
        reason = 'Nest sensor feedback: ' + device.data.native_sensor_control.reason;
      }
      requirements.push(reason);
    }
    if (device.data.can_heat === false) {
      requirements.push('This thermostat does not report support for heating.');
    }
    if (device.data.temperature_lock === true) {
      requirements.push('Turn off the Nest temperature lock.');
    }
    if (requirements.length) {
      const unknown = device.data.hvac_mode === undefined || device.data.eco_mode === undefined ||
        selectedNestSensor(device.data) === null;
      if (unknown) {
        state.phase = 'waiting';
        state.reason = requirements.join(' ');
        return;
      }
      if (lease || state.controlStarted) {
        this.leases.delete(key);
        delete state.manualTarget;
        delete state.scheduleTarget;
        this.pause(state, 'Nest mode, Eco, lock or active sensor changed. Native Nest control takes priority; Resume when ready.');
      } else {
        state.phase = 'waiting';
        state.reason = requirements.join(' ');
      }
      return;
    }
    const schedule = this.schedule(device, rule.thermostatId);
    const { zone, entries, signature: scheduleSignature, position: scheduleKey } = schedule;
    if (entries.length && !zone) {
      state.phase = 'waiting';
      state.reason = 'Nest has not reported a usable schedule time zone. Choose this thermostat’s time zone in Settings.';
      return;
    }
    if (!this.temperatureSchedule(state, device, schedule)) {
      return;
    }
    lease = this.leases.get(key);
    if (validTarget(target(device))) {
      if (!this.temperatureFeedback(state, device, lease)) {
        return;
      }
      lease = this.leases.get(key);
    } else if (lease?.pending) {
      this.waitHeatingFeedback(state, lease, 'command');
      return;
    }
    // A refreshed account delivers thermostat and room-sensor traits separately.
    // Keep the accepted target while those inputs return, without masking a conflicting target.
    if (state.roomTemperature === null && (this.now() < (this.feedbackRecoveryUntil.get(device.account) ?? 0) ||
        lease?.feedbackRefreshed && this.now() - (lease.confirmedAt ?? lease.sentAt) < ACK_TIMEOUT)) {
      state.phase = 'waiting';
      state.reason = 'Waiting for selected temperature readings after refreshing Nest feedback.';
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
      state.reason = state.recovering ? 'Waiting for all selected temperature readings after restart.' :
        'A selected temperature is unavailable. Returning an owned target to its previous setting when possible.';
      if (lease && !state.recovering) {
        await this.release(key, lease);
      }
      return;
    }
    delete state.recovering;
    lease = this.leases.get(key);
    const proposed = heatingTarget(
      desiredTarget(state),
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
    if (!state.controlStarted) {
      state.scheduleSignature = scheduleSignature;
      state.scheduleKey = scheduleKey;
      state.scheduleZone = zone;
      state.scheduleDesired = schedule.desired;
      state.controlStarted = true;
      state.referenceTarget = target(device);
    }
    state.phase = 'active';
    state.temperatureControl = 'active';
    state.reason = 'Heating follows the selected room temperature within the configured adjustment limit.';
    state.nextChangeAt = Math.max(state.handoffNotBefore ?? 0,
      Number.isFinite(state.lastWriteAt) ? state.lastWriteAt + (rule.minimumIntervalMinutes ?? 5) * MINUTE : 0) || null;
    if (equal(target(device), proposed)) {
      return;
    }
    if (state.nextChangeAt && this.now() < state.nextChangeAt) {
      state.phase = 'waiting';
      state.temperatureControl = 'interval';
      state.reason = 'Waiting for the minimum heating-target update interval.';
      return;
    }
    const previousLease = lease && structuredClone(lease);
    const previousWrite = state.lastWriteAt;
    lease ??= { kind: 'temperature', targetId: rule.thermostatId, owner: rule.id, baseline: target(device) };
    lease.before = target(device);
    lease.expected = proposed;
    lease.sentAt = this.now();
    state.lastWriteAt = lease.sentAt;
    lease.pending = true;
    delete lease.confirmedAt;
    delete lease.feedbackRefreshAttempts;
    delete lease.feedbackNextRefreshAt;
    delete lease.feedbackRefreshAttempted;
    delete lease.feedbackRefreshed;
    this.leases.set(key, lease);
    const epoch = state.targetEpoch;
    await this.persist();
    if (!this.windowPermits(state) || state.manualTarget || state.targetEpoch !== epoch) {
      if (!state.paused && !state.manualTarget && state.targetEpoch === epoch) {
        this.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
      }
      return;
    }
    try {
      await this.dashboard.setAutomationTarget(rule.thermostatId, proposed, lease.before, () => {
        const current = this.schedule(this.dashboard.devices.get(rule.thermostatId), rule.thermostatId);
        return this.windowPermits(state) && !state.manualTarget && state.targetEpoch === epoch &&
          current.position === scheduleKey && current.signature === scheduleSignature && this.sensorSetup.permits(rule);
      });
    } catch (error) {
      if (error.code === 'CLIMATE_CONFLICT' && !this.windowPermits(state) && !state.paused &&
          !state.manualTarget && state.targetEpoch === epoch) {
        this.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
        return;
      }
      throw error;
    }
    state.lastAction = { at: this.now(), value: proposed, status: 'accepted',
      message: 'Heating target accepted; awaiting device feedback.' };
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
      const previousLease = lease && structuredClone(lease);
      const previousWrite = state.fanWrites[id];
      lease ??= { kind: 'fan', targetId: id, owner: rule.id, baseline: source.running };
      lease.before = source.running;
      lease.expected = desired;
      lease.sentAt = this.now();
      state.fanWrites[id] = lease.sentAt;
      lease.pending = true;
      this.leases.set(key, lease);
      await this.persist();
      if (!this.windowPermits(state, id)) {
        this.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
        return;
      }
      try {
        await this.access.setFan(id, desired, lease.before, { guard: () => this.windowPermits(state, id) });
      } catch (error) {
        if (error.code === 'CLIMATE_CONFLICT' && !this.windowPermits(state, id)) {
          this.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
          return;
        }
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
      const state = this.states.get(lease.owner);
      if (lease.kind === 'temperature' && state?.recovering && lease.restoring) {
        this.pause(state, 'Nest did not confirm target restoration across restart. Review its target, then Resume.');
      }
      return;
    }
    if (equal(current, lease.baseline)) {
      this.leases.delete(key);
      const state = this.states.get(lease.owner);
      if (state && lease.kind === 'temperature') {
        if (state.recovering) {
          state.referenceTarget = current;
        } else {
          state.controlStarted = false;
        }
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
  async manualThermostat(deviceId, values) {
    let changed = false;
    const requests = [];
    for (const state of this.states.values()) {
      const device = this.dashboard.devices.get(state.rule.thermostatId);
      if (state.rule.kind === 'temperature' && state.rule.enabled && state.controlOwner && device?.id === deviceId) {
        const requested = values?.target_temperature_low ?? values?.target_temperature;
        const onlyTarget = values && Object.keys(values).every((key) =>
          ['uuid', 'target_temperature', 'target_temperature_low'].includes(key));
        // HomeKit shows reported state. A queued compensation may never reach Nest;
        // only rapid user requests use their previous requested target as the baseline.
        const before = state.manualTarget?.expected ?? target(device);
        if (onlyTarget && validTarget(requested) && validTarget(before) && equal(requested, before)) {
          continue;
        }
        if (onlyTarget && validTarget(requested) && !state.paused && state.controlStarted && !state.scheduleTarget &&
            state.rule.manualTargetBehavior !== 'pause' && this.connected(device) && device.data.hvac_mode === 'heat' &&
            device.data.eco_mode === false && device.data.temperature_lock !== true && nativeSensorAllowsHeating(device.data)) {
          if (validTarget(before)) {
            const desired = shiftedTarget(state.manualTarget?.desired ?? desiredTarget(state),
              targetDelta(before, requested, device.data.temperature_scale));
            const pending = { expected: requested, desired, at: this.now(), accepted: false };
            state.manualTarget = pending;
            state.targetEpoch = (state.targetEpoch ?? 0) + 1;
            state.phase = 'waiting';
            state.temperatureControl = 'updating';
            state.reason = 'Waiting for Nest to confirm the manual target change; the sensor group is retained.';
            this.leases.delete('temperature:' + state.rule.thermostatId);
            requests.push({ id: state.rule.id, pending });
            changed = true;
            continue;
          }
        }
        delete state.manualTarget;
        delete state.scheduleTarget;
        state.targetEpoch = (state.targetEpoch ?? 0) + 1;
        this.pause(state, 'A manual Nest control was used. Resume when ready to use the room-temperature group again.');
        this.leases.delete('temperature:' + state.rule.thermostatId);
        changed = true;
      }
    }
    if (changed) {
      await this.persist().catch(() => {
        this.error = 'The manual override is active, but its state could not be saved.';
        for (const request of requests) {
          const state = this.states.get(request.id);
          if (state) {
            this.pause(state, this.error);
          }
        }
      });
      this.notifyState();
    }
    return requests;
  }

  async manualThermostatResult(requests, accepted) {
    for (const request of requests ?? []) {
      const state = [...this.states.values()].find((entry) => entry.manualTarget === request.pending);
      if (!state) {
        continue;
      }
      if (accepted) {
        state.manualTarget.accepted = true;
      } else {
        delete state.manualTarget;
        this.pause(state, 'The manual Nest target command failed. Review its current target, then Resume automatic control.');
      }
    }
    if (requests?.length) {
      await this.persist().catch(() => {
        this.error = 'Manual target feedback could not be saved. Review the rule before resuming.';
        for (const request of requests) {
          const state = this.states.get(request.id);
          if (state) {
            this.pause(state, this.error);
          }
        }
      });
      this.notifyState();
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
      if (!state?.rule.enabled || !['pause', 'resume', 'home', 'away', 'resetTarget'].includes(payload.action)) {
        throw new Error('Select an enabled rule and supported action.');
      }
      if (payload.action === 'resetTarget') {
        if (state.rule.kind !== 'temperature' || state.manualTarget || state.scheduleTarget) {
          throw new DashboardConfigError('Select a temperature rule and wait for pending Nest target confirmation.');
        }
        for (const candidate of this.states.values()) {
          if (candidate.rule.kind === 'temperature' && candidate.rule.thermostatId === state.rule.thermostatId) {
            this.resetTemperatureTarget(candidate);
          }
        }
        state.reason = 'Using the saved desired room temperature.';
      } else if (['home', 'away'].includes(payload.action)) {
        const minutes = payload.minutes ?? 60;
        if (state.rule.kind !== 'presence' || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
          throw new Error('Presence overrides must last from 1 to 1440 minutes.');
        }
        state.override = { home: payload.action === 'home', until: this.now() + minutes * MINUTE };
        state.paused = false;
      } else {
        if (state.rule.kind === 'temperature') {
          for (const candidate of this.states.values()) {
            if (candidate.rule.kind === 'temperature' && candidate.rule.thermostatId === state.rule.thermostatId) {
              candidate.paused = payload.action === 'pause';
              if (candidate.paused) {
                candidate.thermostatPause = 'Paused by you. Resume any group for this thermostat to continue temperature automation.';
              } else {
                delete candidate.thermostatPause;
                this.resetTemperatureTarget(candidate);
              }
            }
          }
        }
        state.paused = payload.action === 'pause';
        state.reason = state.paused
          ? 'Paused by you. Owned equipment settings are restored when reachable.'
          : 'Resuming automatic control.';
        delete state.override;
        state.awaySince = null;
        if (!state.paused) {
          if (state.rule.kind === 'temperature') {
            this.resetTemperatureTarget(state);
          }
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
    }).finally(() => this.notifyState());
  }

  async stop() {
    this.stopping = true;
    this.notifyState();
    clearInterval(this.timer);
    await this.queue;
    try {
      if (this.access) {
        await this.readSources();
      }
      this.refreshSnapshot();
      for (const [key, lease] of this.leases) {
        const owner = this.states.get(lease.owner);
        const device = lease.kind === 'temperature' ? this.device(lease.targetId) : null;
        if (lease.kind === 'temperature' && lease.pending && !lease.restoring && owner?.rule.enabled && !owner.paused &&
            (!this.connected(device) || !validTarget(target(device)) || equal(target(device), lease.before))) {
          // Preserve an unresolved accepted write through a bridge restart. It cannot safely be
          // restored or resent until feedback identifies the target that actually reached Nest.
          continue;
        }
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


