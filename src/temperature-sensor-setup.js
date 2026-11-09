import crypto from 'node:crypto';
import { DashboardConfigError } from './web-dashboard-config.js';

const TIMEOUT = 120000;
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signature = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function nativeSensorAllowsHeating(data) {
  return (
    data?.active_rcs_sensor === '' &&
    (!data.native_sensor_control?.reported || data.native_sensor_control.source === 'thermostat' ||
      data.native_sensor_control.builtInConfirmed === true)
  );
}

export class TemperatureSensorSetup {
  constructor(engine) {
    this.engine = engine;
    this.leases = new Map();
  }

  load(entries = []) {
    if (!Array.isArray(entries) || entries.length > 96) {
      throw new Error('Invalid saved sensor control');
    }
    for (const [id, lease] of entries) {
      if (
        typeof id !== 'string' || id.length > 128 || lease?.thermostatId !== id ||
        !this.engine.states.has(lease.ruleId) || !signature(lease.before) || !signature(lease.expected) ||
        !Number.isFinite(lease.sentAt) || !['hold', 'restore'].includes(lease.operation) ||
        !lease.baseline || typeof lease.baseline.mode !== 'string' ||
        !['preparing', 'held', 'restore_wait', 'restoring', 'uncertain', 'changed'].includes(lease.phase)
      ) {
        throw new Error('Invalid saved sensor control');
      }
      // A new bridge process needs a new device observation, and never repeats a persisted write.
      lease.beforeRevision = 0;
      if (lease.phase === 'restore_wait') {
        lease.phase = 'held';
      }
      this.leases.set(id, lease);
    }
  }

  entries() {
    return [...this.leases];
  }

  owns(id) {
    return [...this.leases.values()].some((lease) => lease.ruleId === id);
  }

  device(id) {
    return this.engine.dashboard.devices.get(id);
  }

  connected(device) {
    const account = this.engine.dashboard.accounts().find((entry) => entry.id === device?.account);
    return Boolean(
      device?.type === 'Thermostat' && account?.authorised && account.observing &&
      !device.needsUpdate && device.data.online === true,
    );
  }

  mixed(rule) {
    if (rule.kind !== 'temperature') {
      return false;
    }
    const native = new Set(
      [...this.engine.dashboard.devices.values()]
        .filter((device) => device.type === 'TemperatureSensor').map((device) => 'nest:' + device.id),
    );
    return rule.sourceIds.some((id) => native.has(id)) && rule.sourceIds.some((id) => !id.startsWith('nest:'));
  }

  ready(native) {
    return native?.supported === true && native.source === 'thermostat' && native.mode === 'hold';
  }

  status(rule) {
    const lease = [...this.leases.values()].find((entry) => entry.ruleId === rule.id);
    const mixed = this.mixed(rule);
    if (!mixed && !lease) {
      return null;
    }
    const device = this.device(lease?.thermostatId ?? rule.thermostatId);
    const native = device?.data.native_sensor_control;
    const connected = this.connected(device);
    const held = lease && native?.signature === lease.expected && this.ready(native);
    const phase = lease?.phase ?? (this.ready(native) ? 'ready' : native?.supported ? 'required' : 'unsupported');
    let reason = {
      ready: 'Nest uses its built-in sensor with native sensor scheduling held. The selected room readings can guide heating.',
      required: 'This mixed group needs the built-in Nest sensor and a native sensor-schedule hold. Review and approve setup to continue.',
      unsupported: native?.reason ||
        'Mixed-group heating needs supported built-in sensor and hold feedback. Native sensor state is unavailable.',
      preparing: 'Waiting for Nest to confirm the built-in sensor and sensor-schedule hold. Heating control has not started.',
      held: 'Nest confirmed the built-in sensor and sensor-schedule hold. Its saved sensor schedule and paired sensors are preserved.',
      restore_wait: 'The rule is paused. Waiting for its heating target to be restored before restoring native sensor settings.',
      restoring: 'Waiting for Nest to confirm restoration of its saved native sensor settings. The rule remains paused.',
      uncertain: 'Sensor changes could not be confirmed. No automatic retry is made. Check Nest and refresh before taking another action.',
      changed: 'Native Nest sensor settings changed. Automatic control is paused, and saved settings will not overwrite that change.',
    }[phase];
    if (!connected) {
      reason = 'Thermostat connection unavailable. Reconnect before changing or restoring native sensor control.';
    }
    const busy = ['preparing', 'restore_wait', 'restoring'].includes(phase);
    const canPrepare = Boolean(
      mixed && rule.enabled && connected && native?.supported && !this.ready(native) && !busy &&
      (!lease || lease.thermostatId === rule.thermostatId),
    );
    // A different rule can never take over another rule's native-sensor lease.
    const owner = this.leases.get(rule.thermostatId);
    const available = !owner || owner.ruleId === rule.id;
    const canRestore = Boolean(lease && connected && held && !busy);
    return {
      mixed, phase, reason, canPrepare: canPrepare && available, canRestore,
      thermostatId: device?.serial ?? lease?.thermostatId ?? rule.thermostatId,
      thermostatName: device?.data.description || 'Nest thermostat',
      confirmation: digest([rule, native?.signature ?? '', lease?.phase ?? '', lease?.expected ?? '']),
    };
  }

  snapshot() {
    return [...this.leases.values()].map((lease) => {
      const rule = this.engine.states.get(lease.ruleId)?.rule;
      return rule ? { id: rule.id, name: rule.name, ...this.status(rule) } : null;
    }).filter(Boolean);
  }

  permits(rule) {
    const owner = this.leases.get(rule.thermostatId);
    if (
      owner && (owner.ruleId !== rule.id || owner.phase !== 'held' ||
      this.device(rule.thermostatId)?.data.native_sensor_control?.signature !== owner.expected)
    ) {
      return false;
    }
    return !this.mixed(rule) || this.ready(this.device(rule.thermostatId)?.data.native_sensor_control);
  }

  async action(state, action, confirmation) {
    const rule = state.rule;
    const status = this.status(rule);
    if (
      !status || !confirmation || confirmation !== status.confirmation ||
      !(action === 'prepareSensors' ? status.canPrepare : status.canRestore)
    ) {
      throw new DashboardConfigError('Sensor settings or the rule changed. Refresh and review the setup again.', 409);
    }
    const device = this.device(status.thermostatId);
    const native = device.data.native_sensor_control;
    if (action === 'restoreSensors') {
      this.engine.pause(state, 'Restoring native Nest sensor control. This temperature rule remains paused.');
      this.leases.get(status.thermostatId).phase = 'restore_wait';
      await this.engine.persist();
      return;
    }
    const lease = {
      thermostatId: rule.thermostatId, ruleId: rule.id,
      baseline: structuredClone(native.control), before: native.signature, expected: native.holdSignature,
      sentAt: this.engine.now(), beforeRevision: device.nativeSensorRevision ?? 0, phase: 'preparing', operation: 'hold',
    };
    this.leases.set(rule.thermostatId, lease);
    state.paused = false;
    state.controlStarted = false;
    state.reason = 'Waiting for Nest sensor setup confirmation.';
    await this.engine.persist();
    try {
      await this.engine.dashboard.setNativeSensorControl(
        rule.thermostatId, { action: 'hold', expected: lease.before }, () => !state.paused && !this.engine.stopping,
      );
    } catch {
      lease.phase = 'uncertain';
      this.engine.pause(state, 'Nest sensor setup could not be confirmed. Check Nest before resuming.');
      await this.engine.persist();
    }
  }

  async observe() {
    for (const [id, lease] of this.leases) {
      const state = this.engine.states.get(lease.ruleId);
      const device = this.device(id);
      if (!state || !this.connected(device)) {
        continue;
      }
      const native = device.data.native_sensor_control;
      const observed = (device.nativeSensorRevision ?? 0) > lease.beforeRevision;
      if (
        lease.operation === 'restore' && ['restoring', 'uncertain'].includes(lease.phase) &&
        observed && native?.signature === lease.before
      ) {
        this.leases.delete(id);
        this.engine.pause(state, 'Native Nest sensor settings restored. Review sensor setup before resuming this group.');
        continue;
      }
      if (
        lease.operation === 'hold' && ['preparing', 'uncertain'].includes(lease.phase) && observed &&
        native?.signature === lease.expected && this.ready(native)
      ) {
        lease.phase = 'held';
      }
      const expected = ['held', 'restore_wait', 'restoring'].includes(lease.phase) ? lease.expected : lease.before;
      if (native?.signature !== expected && native?.signature !== (lease.phase === 'restoring' ? lease.before : lease.expected)) {
        lease.phase = 'changed';
        this.engine.leases.delete('temperature:' + id);
        this.engine.pause(state, 'Native Nest sensor settings changed. Review the thermostat before resuming this group.');
        continue;
      }
      if (['preparing', 'restoring'].includes(lease.phase) && this.engine.now() - lease.sentAt >= TIMEOUT) {
        lease.phase = 'uncertain';
        this.engine.pause(state, 'Nest did not confirm the sensor change. No automatic retry is made.');
      }
      if (lease.phase !== 'restore_wait') {
        continue;
      }
      const temperature = this.engine.leases.get('temperature:' + id);
      if (temperature) {
        await this.engine.release('temperature:' + id, temperature);
        if (this.engine.leases.has('temperature:' + id)) {
          continue;
        }
      }
      lease.phase = 'restoring';
      lease.operation = 'restore';
      lease.sentAt = this.engine.now();
      lease.beforeRevision = device.nativeSensorRevision ?? 0;
      await this.engine.persist();
      try {
        await this.engine.dashboard.setNativeSensorControl(
          id, { action: 'restore', expected: lease.expected, control: lease.baseline }, () => state.paused || !state.rule.enabled,
        );
      } catch {
        lease.phase = 'uncertain';
        this.engine.pause(state, 'Native sensor restoration could not be confirmed. Check Nest before trying again.');
      }
    }
  }
}
