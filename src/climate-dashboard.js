// Authenticated local bridge between the running platform and Homebridge Settings.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeSensorAllowsHeating } from './temperature-sensor-setup.js';

const FIELDS = [
  'description',
  'model',
  'online',
  'current_temperature',
  'physical_temperature',
  'current_humidity',
  'temperature_scale',
  'target_temperature',
  'target_temperature_low',
  'target_temperature_high',
  'hvac_mode',
  'hvac_state',
  'eco_mode',
  'has_fan',
  'fan_state',
  'fan_duration',
  'fan_timer_speed',
  'active_rcs_sensor',
  'linked_rcs_sensors',
  'native_sensor_control',
  'schedules',
  'schedule_mode',
  'schedule_time_zone',
  'schedule_time_zone_source',
  'hot_water_boost_active',
  'current_water_temperature',
  'hot_water_temperature',
  'battery_level',
  'occupancy',
  'humiditySensor',
  'ecoSwitch',
  'fanPresetSwitches',
  'can_heat',
  'can_cool',
  'temperature_lock',
];
const DAY = 86400000;
export class RuntimeLedger {
  constructor(days = {}) {
    this.days = days;
    this.previous = new Map();
  }

  sample(id, state, valid, now = Date.now()) {
    const before = this.previous.get(id);
    this.previous.set(id, { state, valid, time: now });
    // No extrapolation over downtime, missing observations, or a stalled event loop.
    if (!valid || !before?.valid || now < before.time || now - before.time > 90000) {
      return;
    }
    let start = before.time;
    while (start < now) {
      const date = new Date(start).toISOString().slice(0, 10);
      const end = Math.min(now, (Math.floor(start / DAY) + 1) * DAY);
      const seconds = (end - start) / 1000;
      const key = id + '/' + date;
      const day = (this.days[key] ??= { date, heating: 0, cooling: 0, observed: 0 });
      day.observed += seconds;
      if (['heating', 'cooling'].includes(before.state)) {
        day[before.state] += seconds;
      }
      start = end;
    }
    const cutoff = new Date(now - 31 * DAY).toISOString().slice(0, 10);
    for (const key of Object.keys(this.days)) {
      if (this.days[key].date < cutoff) {
        delete this.days[key];
      }
    }
  }

  summary(id, now = Date.now()) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now - (6 - i) * DAY).toISOString().slice(0, 10);
      return this.days[id + '/' + date] ?? { date, heating: 0, cooling: 0, observed: 0 };
    });
  }
}

export class ClimateDashboard {
  constructor(storage, { accounts, command, log }) {
    this.directory = path.join(storage, 'nest-climate');
    this.accounts = accounts;
    this.command = command;
    this.log = log;
    this.devices = new Map();
    this.ledger = new RuntimeLedger();
    this.lastCommand = null;
    this.busy = false;
    this.saving = Promise.resolve();
    this.token = crypto.randomBytes(32).toString('hex');
  }

  async start() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.directory, 'runtime.json'), 'utf8'));
      const valid = Object.fromEntries(
        Object.entries(data).filter(
          ([, day]) =>
            /^\d{4}-\d{2}-\d{2}$/.test(day?.date) &&
            ['heating', 'cooling', 'observed'].every((key) => Number.isFinite(day[key]) && day[key] >= 0 && day[key] <= 86400),
        ),
      );
      this.ledger = new RuntimeLedger(valid);
    } catch {
      /* First run or unreadable history starts with no observed time. */
    }
    this.server = http.createServer((request, response) => {
      this.handle(request, response).catch(() => {
        this.log?.warn?.('The climate configuration request could not be completed.');
        if (!response.headersSent && !response.destroyed) {
          response.writeHead(500).end('{}');
        } else {
          response.destroy();
        }
      });
    });
    this.server.requestTimeout = 10000;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.server.on('error', () => this.log?.warn?.('Climate dashboard listener unavailable.'));
    const endpoint = { port: this.server.address().port, token: this.token };
    try {
      await this.write('endpoint.json', endpoint);
    } catch (error) {
      await new Promise((resolve) => this.server.close(resolve));
      throw error;
    }
    this.timer = setInterval(() => {
      this.sample();
      this.persist();
    }, 30000);
    this.timer.unref();
  }

  async write(name, data) {
    const file = path.join(this.directory, name);
    const temporary = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temporary, file);
  }

  persist() {
    this.saving = this.saving
      .then(() => this.write('runtime.json', this.ledger.days))
      .catch(() => this.log?.warn?.('Unable to save climate runtime history.'));
    return this.saving;
  }

  update(serial, type, data, account) {
    if (!['Thermostat', 'TemperatureSensor', 'Heatlink', 'HomeAway'].includes(type)) {
      return;
    }
    const previous = this.devices.get(serial) ?? { serial, type, data: {} };
    const safe = Object.fromEntries(FIELDS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
    // An explicit empty selection means backplate; unknown selection must remain unknown.
    if (Object.hasOwn(data, 'active_rcs_sensor')) {
      safe.active_rcs_sensor = data.active_rcs_sensor;
    }
    this.devices.set(serial, {
      ...previous,
      account: account ?? previous.account,
      needsUpdate: previous.needsUpdate === true && data.hvac_state === undefined &&
        !(type === 'TemperatureSensor' && Number.isFinite(data.current_temperature)) &&
        !(type === 'HomeAway' && typeof data.occupancy === 'boolean'),
      id: data.nest_google_device_uuid ?? previous.id,
      lastUpdate: Date.now(),
      nativeSensorRevision: (previous.nativeSensorRevision ?? 0) + (Object.hasOwn(data, 'native_sensor_control') ? 1 : 0),
      data: { ...previous.data, ...safe },
    });
    this.sample();
  }

  remove(serial) {
    this.devices.delete(serial);
    this.ledger.previous.delete(serial);
  }

  invalidate(account) {
    for (const device of this.devices.values()) {
      if (device.account === account) {
        this.ledger.previous.delete(device.serial);
        device.needsUpdate = true;
      }
    }
  }

  sample(now = Date.now()) {
    const accounts = new Map(this.accounts().map((account) => [account.id, account]));
    for (const device of this.devices.values()) {
      if (device.type !== 'Thermostat') {
        continue;
      }
      const account = accounts.get(device.account);
      const valid =
        account?.authorised &&
        account?.observing &&
        !device.needsUpdate &&
        device.data.online === true &&
        ['heating', 'cooling', 'off'].includes(device.data.hvac_state);
      this.ledger.sample(device.serial, device.data.hvac_state, Boolean(valid), now);
    }
  }

  snapshot() {
    this.sample();
    return {
      generatedAt: Date.now(),
      accounts: this.accounts(),
      lastCommand: this.lastCommand,
      devices: [...this.devices.values()].map((device) => ({
        ...device,
        temperatureTarget: device.type === 'Thermostat' ? this.temperatureTarget(device.serial) : undefined,
        runtime: device.type === 'Thermostat' ? this.ledger.summary(device.serial) : undefined,
      })),
      runtimeTimezone: 'UTC',
      automation: this.automation?.snapshot(),
    };
  }

  temperatureTarget(serial) {
    const device = this.devices.get(serial);
    const data = device?.data ?? {};
    const account = this.accounts().find((entry) => entry.id === device?.account);
    const unavailable = (reason) => ({ available: false, reason });
    if (device?.type !== 'Thermostat' || !device.id || !account?.authorised || !account.observing ||
        device.needsUpdate || data.online !== true) {
      return unavailable('Reconnect to change the temperature.');
    }
    if (data.eco_mode !== false) {
      return unavailable(data.eco_mode ? 'Turn Eco off to change the temperature.' : 'Waiting for Nest to report Eco status.');
    }
    if (data.temperature_lock === true) {
      return unavailable('Unlock the thermostat in Nest to change its temperature.');
    }
    if (!['heat', 'cool', 'range', 'heatcool'].includes(data.hvac_mode)) {
      return unavailable('Choose Heat, Cool or Heat • Cool in Nest to change the temperature.');
    }
    const automation = this.automation?.snapshot();
    if (automation && (automation.available === false || automation.error)) {
      return unavailable('Refresh to confirm which temperature controller is active.');
    }
    const rules = (automation?.rules ?? []).filter((rule) => rule.kind === 'temperature' && rule.thermostatId === serial);
    const room = this.automation?.roomControl?.(serial);
    if (!room && rules.some((rule) => rule.temperatureControl === 'restoring' || (rule.enabled && !rule.paused))) {
      return unavailable('The temperature rule is waiting for feedback. Review Climate rules before changing its target.');
    }
    const fields = room ? [{ key: 'value', label: 'Desired room temperature', value: room.desiredTemperature }] :
        ['range', 'heatcool'].includes(data.hvac_mode) ? [
          { key: 'target_temperature_low', label: 'Heat to', value: data.target_temperature_low },
          { key: 'target_temperature_high', label: 'Cool to', value: data.target_temperature_high },
        ] : [{ key: data.hvac_mode === 'heat' ? 'target_temperature_low' : 'target_temperature_high',
          label: data.hvac_mode === 'heat' ? 'Heat to' : 'Cool to',
          value: (data.hvac_mode === 'heat' ? data.target_temperature_low : data.target_temperature_high) ?? data.target_temperature }];
    if (fields.some((field) => !Number.isFinite(field.value)) ||
        (fields.some((field) => field.key === 'target_temperature_low') && data.can_heat === false) ||
        (fields.some((field) => field.key === 'target_temperature_high') && data.can_cool === false)) {
      return unavailable('Waiting for a supported Nest target temperature.');
    }
    const rule = rules.find((entry) => entry.id === room?.ruleId);
    const model = { available: true, source: room ? 'room' : 'nest', mode: data.hvac_mode,
      ruleId: rule?.id, ruleName: rule?.name, fields, minimum: 9, maximum: 32, minimumGap: fields.length === 2 ? 1.5 : 0,
      note: room ? 'The selected sensors stay active. Nest adjusts within the rule’s limits and update interval.' :
        rules.some((entry) => entry.enabled && entry.paused) ?
          'The climate rule is paused. This changes Nest directly and leaves the rule paused.' :
          'This changes the target on Nest.' };
    // Reject stale edits without treating ordinary room readings or compensation feedback as edits.
    model.expected = crypto.createHash('sha256').update(JSON.stringify([device.id, model,
      room ? this.automation.states?.get(room.ruleId)?.rule : null])).digest('hex');
    return model;
  }

  async setTemperatureTarget(payload) {
    const model = this.temperatureTarget(payload?.serial);
    const conflict = () => {
      const error = new Error('Temperature control changed. Refresh and review the target before applying it.');
      error.status = 409;
      return error;
    };
    if (!payload || Object.keys(payload).some((key) => !['serial', 'expected', 'values'].includes(key)) ||
        !model.available || typeof payload.expected !== 'string' || payload.expected !== model.expected) {
      throw conflict();
    }
    const values = payload.values;
    if (!values || typeof values !== 'object' || Array.isArray(values) ||
        Object.keys(values).length !== model.fields.length || model.fields.some((field) =>
      !Number.isFinite(values[field.key]) || values[field.key] < model.minimum || values[field.key] > model.maximum) ||
        (model.fields.length === 2 && values.target_temperature_high - values.target_temperature_low < model.minimumGap - 1e-8)) {
      const error = new Error('Enter temperatures within the displayed limits and keep the heating target below the cooling target.');
      error.status = 400;
      throw error;
    }
    if (this.busy) {
      throw new Error('Another climate command is in progress.');
    }
    const ready = () => this.temperatureTarget(payload.serial).expected === payload.expected;
    this.busy = true;
    try {
      const id = this.devices.get(payload.serial).id;
      if (model.source === 'room') {
        await this.automation.setRoomTarget(id, { ruleId: model.ruleId, value: values.value }, false, ready);
      } else {
        await this.command(id, values, { guard: ready });
      }
      return { accepted: true, source: model.source, message: model.source === 'room' ?
        'Desired room temperature saved. The rule keeps its update interval.' : 'Waiting for Nest confirmation.' };
    } finally {
      this.busy = false;
    }
  }

  async setAutomationTarget(serial, value, expected, permitted = () => true) {
    const ready = () => {
      const device = this.devices.get(serial);
      const account = this.accounts().find((entry) => entry.id === device?.account);
      const actual = device?.data.target_temperature_low ?? device?.data.target_temperature;
      return (
        permitted() &&
        device?.type === 'Thermostat' &&
        account?.authorised &&
        account.observing &&
        !device.needsUpdate &&
        device.data.online === true &&
        device.data.hvac_mode === 'heat' &&
        device.data.eco_mode === false &&
        nativeSensorAllowsHeating(device.data) &&
        device.data.temperature_lock !== true &&
        Number.isFinite(actual) &&
        Math.abs(actual - expected) < 0.15 &&
        Number.isFinite(value) &&
        value >= 9 &&
        value <= 32
      );
    };
    if (!ready()) {
      const error = new Error('Thermostat changed before the automated command.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    await this.command(this.devices.get(serial).id, { target_temperature_low: value }, { automation: true, guard: ready });
  }

  async setNativeSensorControl(serial, value, permitted = () => true) {
    const ready = () => {
      const device = this.devices.get(serial);
      const account = this.accounts().find((entry) => entry.id === device?.account);
      return (
        permitted() && device?.type === 'Thermostat' && account?.authorised && account.observing &&
        !device.needsUpdate && device.data.online === true && device.data.native_sensor_control?.supported === true &&
        device.data.native_sensor_control.signature === value.expected
      );
    };
    if (!ready()) {
      const error = new Error('Nest sensor settings changed before the command.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    await this.command(this.devices.get(serial).id, { native_sensor_control: value }, { automation: true, guard: ready });
  }

  async control(payload) {
    const device = this.devices.get(payload?.serial);
    const account = this.accounts().find((item) => item.id === device?.account);
    if (!device || !account?.authorised || !account.observing || device.needsUpdate || device.data.online !== true) {
      throw new Error('Device connection unavailable. Refresh and try again.');
    }
    let values;
    if (
      payload.action === 'sensor' &&
      device.type === 'Thermostat' &&
      typeof payload.value === 'string' &&
      (payload.value === '' || device.data.linked_rcs_sensors?.includes(payload.value))
    ) {
      values = { temperature_sensor: payload.value };
    } else if (
      payload.action === 'eco' &&
      device.type === 'Thermostat' &&
      typeof payload.value === 'boolean' &&
      typeof device.data.eco_mode === 'boolean'
    ) {
      values = { eco_mode: payload.value };
    } else if (
      payload.action === 'fan' &&
      device.type === 'Thermostat' &&
      device.data.has_fan === true &&
      [15, 30, 60].includes(payload.value)
    ) {
      values = { fan_state: true, fan_duration: payload.value * 60, fan_timer_speed: Math.max(1, device.data.fan_timer_speed || 1) };
    } else {
      throw new Error('Unsupported climate action.');
    }
    if (this.busy) {
      throw new Error('Another climate command is in progress.');
    }
    this.busy = true;
    try {
      await this.command(device.id, values);
      this.lastCommand = { action: payload.action, at: Date.now(), accepted: true };
      return { accepted: true, message: 'Command accepted. Waiting for device state update.' };
    } catch {
      this.lastCommand = { action: payload.action, at: Date.now(), accepted: false };
      throw new Error('Device rejected the command or the connection failed. Refresh to check its state.');
    } finally {
      this.busy = false;
    }
  }

  async handle(request, response) {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.authorization !== 'Bearer ' + this.token || request.headers.origin) {
      response.writeHead(403).end('{}');
      return;
    }
    try {
      if (request.url.startsWith('/ui/') && this.webDashboard) {
        await this.webDashboard.handleClimate(request, response, '/api/' + request.url.slice(4), true);
        return;
      }
      if (request.method === 'GET' && request.url === '/status') {
        response.end(JSON.stringify(this.snapshot()));
        return;
      }
      if (request.method === 'GET' && request.url === '/web/status') {
        response.end(JSON.stringify(this.webDashboard?.status() ?? { enabled: false, available: false, accountConfigured: false }));
        return;
      }
      if (request.method !== 'POST' || !['/command', '/web/account'].includes(request.url)) {
        response.writeHead(404).end('{}');
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) {
          response.writeHead(413).end('{}');
          return;
        }
      }
      const payload = JSON.parse(body);
      if (request.url === '/web/account') {
        if (!this.webDashboard) {
          response.writeHead(503).end(JSON.stringify({ error: 'Restart the Nest bridge to configure web access.' }));
          return;
        }
        response.end(JSON.stringify(await this.webDashboard.setupAccount(payload)));
        return;
      }
      response.end(JSON.stringify(await this.control(payload)));
    } catch (error) {
      response.writeHead(Number.isInteger(error.status) ? error.status : 400)
        .end(JSON.stringify({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }));
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.sample();
    if (this.server?.listening) {
      this.server.closeAllConnections();
      await new Promise((resolve) => this.server.close(resolve));
    }
    await this.persist();
    try {
      const file = path.join(this.directory, 'endpoint.json');
      const endpoint = JSON.parse(await fs.readFile(file, 'utf8'));
      if (endpoint.token === this.token) {
        await fs.unlink(file);
      }
    } catch {
      /* The endpoint may already have been removed. */
    }
  }
}

