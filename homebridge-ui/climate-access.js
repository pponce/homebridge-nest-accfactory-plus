// Configured-bridge HAP access adapted from pponce/homebridge-harmony-home-control.
// PINs and bridge endpoints never leave this server-side adapter.
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { BridgeDiscovery } from './bridge-discovery.js';
import { speedCapabilities, supportedSpeed, validFanState, sameFanState, fanState } from './public/fan-speed.js';

const uuid = (value) => {
  const text = String(value ?? '').toUpperCase();
  return /^(?:[A-F0-9]{1,8}|[A-F0-9]{8}-0000-1000-8000-0026BB765291)$/.test(text) ? text.split('-')[0].replace(/^0+/, '') : '';
};
const characteristic = (service, type) => service.characteristics?.find((item) => uuid(item.type) === type);
const value = (service, type) => characteristic(service, type)?.value;
const validPin = (pin) => typeof pin === 'string' && /^\d{3}-\d{2}-\d{3}$/.test(pin);

export class ClimateAccess {
  constructor(configPath, { clientFactory, request = fetch } = {}) {
    this.configPath = configPath;
    this.clientFactory = clientFactory;
    this.request = request;
    this.instances = new Map();
    this.bridges = new Map();
    this.sources = [];
    this.fanControls = new Map();
    this.closed = false;
  }

  async start() {
    const config = JSON.parse(await readFile(this.configPath, 'utf8'));
    const main = config.bridge ?? {};
    const add = (bridge, name, kind) => {
      const pin = bridge.pin ?? main.pin;
      if (typeof bridge.username === 'string' && validPin(pin)) {
        this.bridges.set(bridge.username.toUpperCase(), { name, kind, pin });
      }
    };
    add(main, main.name || 'Homebridge', 'main');
    for (const entry of [...(config.platforms ?? []), ...(config.accessories ?? [])]) {
      if (entry._bridge && entry._bridge.disable !== true) {
        add(entry._bridge, entry.name || entry.platform || entry.accessory || 'Child bridge', 'child');
      }
    }
    if (!this.clientFactory) {
      const { Bonjour } = await import('bonjour-service');
      this.clientFactory = (options) => new BridgeDiscovery({ ...options, bonjourFactory: (onError) => new Bonjour(undefined, onError) });
    }
    // Discovery itself receives no pairing credentials and cannot control accessories.
    this.client = this.clientFactory({
      usernames: [...this.bridges.keys()],
    });
    this.client.on('error', () => {
      this.discoveryError = 'Homebridge discovery unavailable.';
    });
    this.client.on('instance-discovered', (instance) => {
      const bridge = String(instance.username ?? '').toUpperCase();
      if (
        !this.closed &&
        this.bridges.has(bridge) &&
        isIP(instance.ipAddress) &&
        Number.isInteger(instance.port) &&
        instance.port > 0 &&
        instance.port < 65536
      ) {
        this.instances.set(bridge, { ...instance, username: bridge });
      }
    });
    this.client.startDiscovery();
  }

  async get(instance, route) {
    let response;
    const addresses = [...new Set([instance.ipAddress, ...(instance.addresses ?? [])])]
      .filter((address) => typeof address === 'string' && isIP(address))
      .slice(0, 8);
    for (const address of addresses) {
      const host = address.includes(':') ? '[' + address + ']' : address;
      try {
        response = await this.request('http://' + host + ':' + instance.port + route, {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { Authorization: this.bridges.get(instance.username).pin },
        });
        instance.ipAddress = address;
        break;
      } catch {
        /* Try another address advertised by this configured bridge. */
      }
    }
    if (!response) {
      throw new Error('Bridge unreachable.');
    }
    if ([401, 403, 470].includes(response.status)) {
      throw new Error('Enable Homebridge accessory control (-I) and check this bridge’s PIN.');
    }
    if (!response.ok) {
      throw new Error('Bridge read failed.');
    }
    return response.json();
  }

  refresh() {
    if (!this.pending) {
      this.pending = this.load().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  async load() {
    const sources = [];
    const bridges = [];
    const fanControls = new Map();
    for (const [id, configured] of this.bridges) {
      if (this.closed) {
        break;
      }
      const instance = this.instances.get(id);
      if (!instance) {
        bridges.push({
          id,
          name: configured.name,
          kind: configured.kind,
          available: false,
          error: 'Not discovered. Check bridge status and multicast access.',
        });
        continue;
      }
      const bridgeSources = [];
      try {
        const payload = await this.get(instance, '/accessories');
        if (!Array.isArray(payload.accessories)) {
          throw new Error('Invalid accessory list.');
        }
        const candidates = [];
        for (const accessory of payload.accessories) {
          const information = accessory.services?.find((service) => uuid(service.type) === '3E');
          if (String(value(information ?? {}, '30') ?? '').startsWith('CLIMATE-PRESENCE-')) {
            continue;
          }
          for (const service of accessory.services ?? []) {
            const type = uuid(service.type);
            if (!['8A', '40', 'B7', '85', '86'].includes(type)) {
              continue;
            }
            const reading = characteristic(service, { '8A': '11', 40: '25', B7: 'B0', 85: '22', 86: '71' }[type]);
            if (
              !reading?.perms?.includes('pr') ||
              !Number.isInteger(accessory.aid) ||
              !Number.isInteger(service.iid) ||
              !Number.isInteger(reading.iid)
            ) {
              continue;
            }
            candidates.push({ accessory, service, reading, information, type });
          }
        }
        // Fresh GETs report provider failures that cached /accessories values can hide.
        for (let offset = 0; offset < candidates.length; offset += 32) {
          const batch = candidates.slice(offset, offset + 32);
          const ids = batch.flatMap(({ accessory, service, reading }) =>
            [reading, characteristic(service, '75'), characteristic(service, '77'), ...(['40', 'B7'].includes(uuid(service.type)) ? [characteristic(service, '29')] : [])]
              .filter((c) => c?.perms?.includes('pr'))
              .map((c) => accessory.aid + '.' + c.iid),
          );
          const readings = await this.get(instance, '/characteristics?id=' + ids.join(','));
          for (const { accessory, service, reading, information, type } of batch) {
            const current = (c) => readings.characteristics?.find((item) => item.aid === accessory.aid && item.iid === c?.iid);
            const sample = current(reading);
            const fault = current(characteristic(service, '77'));
            const active = current(characteristic(service, '75'));
            const healthComplete = ['75', '77'].every((type) => {
              const health = characteristic(service, type);
              return !health?.perms?.includes('pr') || current(health)?.value !== undefined;
            });
            const available =
              healthComplete &&
              sample !== undefined &&
              (sample.status ?? 0) === 0 &&
              (fault?.status ?? 0) === 0 &&
              (fault?.value ?? 0) === 0 &&
              (active?.status ?? 0) === 0 &&
              active?.value !== false &&
              active?.value !== 0;
            const temperature = type === '8A' && reading.unit === 'fahrenheit' ? (sample?.value - 32) / 1.8 : sample?.value;
            const sensor = type === '8A';
            const unitSupported = !sensor || [undefined, 'celsius', 'fahrenheit'].includes(reading.unit);
            const sourceId = 'hap:' + id + '/' + accessory.aid + '/' + service.iid;
            const rotation = ['40', 'B7'].includes(type) ? characteristic(service, '29') : undefined;
            const capabilities = Number.isInteger(rotation?.iid) ? speedCapabilities(rotation) : null;
            const speedSample = current(rotation);
            const speed = speedSample?.value;
            const speedAvailable = Boolean(capabilities && (speedSample?.status ?? 0) === 0 &&
              Number.isFinite(speed) && speed >= 0 && speed <= 100);
            if (['40', 'B7'].includes(type) && reading.perms.includes('pw') &&
                !reading.perms.includes('tw') && !reading.perms.includes('aa')) {
              fanControls.set(sourceId, { bridge: id, aid: accessory.aid, iid: reading.iid, type, speedIid: capabilities ? rotation.iid : undefined });
            }
            bridgeSources.push({
              id: sourceId,
              kind: { '8A': 'temperature', 40: 'fan', B7: 'fan', 85: 'motion', 86: 'occupancy' }[type],
              provider: 'homebridge',
              bridge: id,
              bridgeName: configured.name,
              bridgeKind: configured.kind,
              name: value(service, '23') || value(information ?? {}, '23') || 'Accessory',
              serial: value(information ?? {}, '30'),
              manufacturer: value(information ?? {}, '20'),
              available:
                available &&
                unitSupported &&
                (sensor || [true, false, 0, 1].includes(sample?.value)) &&
                (!sensor || (Number.isFinite(sample?.value) && Number.isFinite(temperature) && temperature >= -100 && temperature <= 100)),
              temperature: sensor && Number.isFinite(temperature) ? temperature : null,
              running: sensor ? undefined : sample?.value === true || sample?.value === 1,
              ...(['40', 'B7'].includes(type) ? {
                speed: speedAvailable ? speed : null,
                canSetSpeed: Boolean(capabilities && fanControls.has(sourceId)),
                speedAvailable,
                speedCapabilities: capabilities,
              } : {}),
              detected: ['85', '86'].includes(type) ? sample?.value === true || sample?.value === 1 : undefined,
              canControl:
                ['40', 'B7'].includes(type) &&
                reading.perms.includes('pw') &&
                !reading.perms.includes('tw') &&
                !reading.perms.includes('aa'),
              lastReadAt: Date.now(),
              measuredAt: null,
            });
          }
        }
        sources.push(...bridgeSources);
        bridges.push({ id, name: configured.name, kind: configured.kind, available: true });
      } catch (error) {
        bridges.push({
          id,
          name: configured.name,
          kind: configured.kind,
          available: false,
          error: error.message.startsWith('Enable Homebridge') ? error.message : 'Bridge unavailable or returned invalid data.',
        });
        // Retain identity so configured selections remain visible, but never reuse stale values as eligible input.
        const known = new Map(
          [...this.sources.filter((source) => source.bridge === id), ...bridgeSources].map((source) => [source.id, source]),
        );
        sources.push(...[...known.values()].map((source) => ({ ...source, available: false })));
      }
    }
    if (this.closed) {
      return { sources: [], bridges: [] };
    }
    this.sources = sources;
    this.fanControls = fanControls;
    return { sources, bridges, discoveryError: this.discoveryError ?? null };
  }

  async setFan(id, running, expected, options = {}) {
    const speedMode = validFanState(expected);
    if (this.closed || typeof running !== 'boolean' || (typeof expected !== 'boolean' && !speedMode)) {
      throw new Error('Invalid room-fan command.');
    }
    // Resolve the service and permissions again before each write; the browser never supplies endpoints or IIDs.
    await this.refresh();
    const source = this.sources.find((entry) => entry.id === id);
    const control = this.fanControls.get(id);
    const instance = control && this.instances.get(control.bridge);
    if (!source?.available || !source.canControl || !instance ||
        (speedMode ? !source.speedAvailable || !sameFanState(fanState(source), expected) : source.running !== expected) ||
        (speedMode && running && supportedSpeed(source, source.speed, options.minimum, options.maximum) !== source.speed)) {
      const error = new Error('Room fan changed or is unavailable.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    if (options.guard && !options.guard()) {
      const error = new Error('Room-fan command cancelled.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    await this.writeFan(instance, control, control.iid, control.type === '40' ? running : Number(running));
  }

  async setFanSpeed(id, speed, expected, options = {}) {
    if (this.closed || !Number.isFinite(speed) || !validFanState(expected)) throw new Error('Invalid room-fan speed command.');
    await this.refresh();
    const source = this.sources.find((entry) => entry.id === id);
    const control = this.fanControls.get(id);
    const instance = control && this.instances.get(control.bridge);
    if (!source?.available || !source.speedAvailable || !instance || !Number.isInteger(control.speedIid) ||
        !sameFanState(fanState(source), expected) || supportedSpeed(source, speed, options.minimum, options.maximum) !== speed) {
      const error = new Error('Room fan changed or its speed is outside the supported limits.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    if (options.guard && !options.guard()) {
      const error = new Error('Room-fan command cancelled.');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    await this.writeFan(instance, control, control.speedIid, speed);
  }

  async writeFan(instance, control, iid, value) {
    const host = instance.ipAddress.includes(':') ? '[' + instance.ipAddress + ']' : instance.ipAddress;
    const response = await this.request('http://' + host + ':' + instance.port + '/characteristics', {
      method: 'PUT',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: this.bridges.get(control.bridge).pin, 'Content-Type': 'application/hap+json' },
      body: JSON.stringify({ characteristics: [{ aid: control.aid, iid, value }] }),
    });
    // Never retry a write at an alternate address: a timeout may follow an accepted command.
    if (response.status === 204) {
      return;
    }
    if (response.status === 207) {
      const result = await response.json();
      const status = result.characteristics?.find((item) => item.aid === control.aid && item.iid === iid);
      if (status?.status === 0) {
        return;
      }
    }
    throw new Error('Room-fan command was not confirmed by Homebridge.');
  }

  close() {
    this.closed = true;
    this.client?.destroy();
    this.instances.clear();
    this.sources = [];
  }
}
