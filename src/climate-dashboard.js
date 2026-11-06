// Authenticated local bridge between the running platform and Homebridge Settings.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FIELDS = [
  'description',
  'model',
  'online',
  'current_temperature',
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
  'schedules',
  'schedule_mode',
  'hot_water_boost_active',
  'current_water_temperature',
  'hot_water_temperature',
  'battery_level',
  'humiditySensor',
  'ecoSwitch',
  'fanPresetSwitches',
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
    this.server = http.createServer((request, response) => this.handle(request, response));
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
    // Sensor selection explicitly clears the previous sensor when returning to the backplate.
    if (Object.hasOwn(data, 'active_rcs_sensor')) {
      safe.active_rcs_sensor = data.active_rcs_sensor ?? '';
    }
    this.devices.set(serial, {
      ...previous,
      account: account ?? previous.account,
      needsUpdate: previous.needsUpdate === true && data.hvac_state === undefined,
      id: data.nest_google_device_uuid ?? previous.id,
      lastUpdate: Date.now(),
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
        runtime: device.type === 'Thermostat' ? this.ledger.summary(device.serial) : undefined,
      })),
      runtimeTimezone: 'UTC',
    };
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
      if (request.method === 'GET' && request.url === '/status') {
        response.end(JSON.stringify(this.snapshot()));
        return;
      }
      if (request.method !== 'POST' || request.url !== '/command') {
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
      response.end(JSON.stringify(await this.control(JSON.parse(body))));
    } catch (error) {
      response.writeHead(400).end(JSON.stringify({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }));
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
