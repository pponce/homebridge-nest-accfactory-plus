import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ClimateAccess } from './climate-access.js';
import crypto from 'node:crypto';
import { ConnectionSetup } from './connection-setup.js';

class ClimateUi extends HomebridgePluginUiServer {
  constructor() {
    super();
    const setup = new ConnectionSetup(this.homebridgeConfigPath, this.homebridgeStoragePath, this.forward.bind(this));
    this.onRequest('/setup/account-status', async () => {
      try { return await setup.accountStatus(); } catch { throw new RequestError('Web login status could not be read.', { status: 503 }); }
    });
    this.onRequest('/setup/web-account', async (payload) => {
      try { return await setup.saveAccount(payload); } catch (error) {
        throw new RequestError(error.code ? 'Web login could not be saved. Check Homebridge storage permissions.' : error.message, { status: error.status || error.error?.status || 400 });
      }
    });
    this.onRequest('/plugin-config', async () => {
      try {
        const bytes = await fs.readFile(this.homebridgeConfigPath, 'utf8');
        const platforms = JSON.parse(bytes)?.platforms;
        return { revision: crypto.createHash('sha256').update(bytes).digest('hex'),
          blocks: (Array.isArray(platforms) ? platforms : [])
            .filter((block) => typeof block?.platform === 'string' && block.platform.split('.').at(-1) === 'NestClimateCntrl') };
      } catch {
        throw new RequestError('Homebridge configuration could not be read. Check its format and file permissions.', { status: 503 });
      }
    });
    this.onRequest('/climate', (payload) => {
      const routes = { '/status': ['GET'], '/config': ['GET', 'PUT'], '/config/stage': ['POST'], '/sources': ['GET'],
        '/command': ['POST'], '/rules/command': ['POST'], '/heating-response': ['GET'],
        '/heating-response/apply': ['POST'], '/bridge/restart': ['GET', 'POST'] };
      if (!payload || !routes[payload.route]?.includes(payload.method) ||
          Object.keys(payload).some((key) => !['route', 'method', 'body'].includes(key))) {
        throw new RequestError('Unsupported climate request.', { status: 400 });
      }
      return this.forward('/ui' + payload.route, payload.body, payload.method);
    });
    this.onRequest('/status', () => this.forward('/status'));
    this.onRequest('/command', (payload) => this.forward('/command', payload));
    this.onRequest('/web/status', () => this.forward('/web/status'));
    this.onRequest('/web/account', (payload) => this.forward('/web/account', payload));
    this.onRequest('/sources', async () => {
      if (!this.startingAccess) {
        this.access = new ClimateAccess(this.homebridgeConfigPath);
        this.startingAccess = this.access.start().catch(() => {
          this.access.close();
          this.startingAccess = undefined;
          throw new RequestError('Accessory discovery could not start. Check the Homebridge bridge configuration.', { status: 503 });
        });
      }
      await this.startingAccess;
      if (!this.readingSources) {
        this.access.client.startDiscovery(3500);
        this.readingSources = delay(3500)
          .then(() => this.access.refresh())
          .finally(() => {
            this.readingSources = undefined;
          });
      }
      return this.readingSources;
    });
    process.once('exit', () => this.access?.close());
    this.ready();
  }

  async forward(route, payload, method = payload === undefined ? 'GET' : 'POST') {
    try {
      const endpoint = JSON.parse(await fs.readFile(path.join(this.homebridgeStoragePath, 'nest-climate', 'endpoint.json'), 'utf8'));
      if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || !/^[a-f0-9]{64}$/.test(endpoint.token)) {
        throw new Error('Invalid endpoint');
      }
      const response = await fetch('http://127.0.0.1:' + endpoint.port + route, {
        method,
        headers: { Authorization: 'Bearer ' + endpoint.token, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new RequestError(data.error || 'Climate request failed.', { status: response.status });
      }
      return data;
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }
      throw new RequestError('Live dashboard unavailable. Start or restart the Nest child bridge, then refresh.', { status: 503 });
    }
  }
}
new ClimateUi();
