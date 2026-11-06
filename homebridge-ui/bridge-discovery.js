// Passive Homebridge service discovery. HTTP authentication and reads belong to ClimateAccess.
import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class BridgeDiscovery extends EventEmitter {
  constructor({ usernames, bonjourFactory, resolve = lookup }) {
    super();
    this.usernames = new Set(usernames.map((name) => name.toUpperCase()));
    this.resolve = resolve;
    this.bonjour = bonjourFactory((error) => this.emit('error', error));
    this.closed = false;
  }

  startDiscovery(timeout = 3500) {
    if (this.closed || this.browser || !this.usernames.size) {
      return;
    }
    const generation = {};
    this.generation = generation;
    const found = (service) => {
      void this.discovered(service, generation);
    };
    this.browser = this.bonjour.find({ type: 'hap' }, found);
    this.browser.on('srv-update', found);
    this.timer = setTimeout(() => this.stopDiscovery(), timeout);
    this.timer.unref();
  }

  async discovered(service, generation) {
    const username = typeof service?.txt?.id === 'string' ? service.txt.id.toUpperCase() : '';
    if (!this.usernames.has(username) || !Number.isInteger(service.port) || service.port < 1 || service.port > 65535) {
      return;
    }
    let addresses = (Array.isArray(service.addresses) ? service.addresses : []).filter(
      (address) => typeof address === 'string' && isIP(address),
    );
    // Child bridges can share a host whose address records were omitted from this announcement.
    if (!addresses.length && typeof service.host === 'string') {
      try {
        addresses = (await this.resolve(service.host, { all: true }))
          .map((entry) => entry.address)
          .filter((address) => typeof address === 'string' && isIP(address));
      } catch {
        return;
      }
    }
    addresses = [...new Set(addresses)].sort((a, b) => isIP(a) - isIP(b)).slice(0, 8);
    if (!this.closed && this.generation === generation && addresses.length) {
      this.emit('instance-discovered', { username, ipAddress: addresses[0], addresses, port: service.port });
    }
  }

  stopDiscovery() {
    clearTimeout(this.timer);
    this.browser?.stop();
    this.browser?.removeAllListeners();
    this.browser = undefined;
    this.generation = undefined;
  }

  destroy() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopDiscovery();
    this.bonjour.destroy();
  }
}
