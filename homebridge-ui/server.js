import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ClimateAccess } from './climate-access.js';
import crypto from 'node:crypto';

class ClimateUi extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/plugin-config', async () => {
      const bytes = await fs.readFile(this.homebridgeConfigPath, 'utf8');
      return { revision: crypto.createHash('sha256').update(bytes).digest('hex'),
        blocks: JSON.parse(bytes).platforms.filter((block) => block.platform?.split('.').at(-1) === 'NestClimateCntrl') };
    });
    this.onRequest('/climate', (payload) => {
      const routes = { '/status': ['GET'], '/config': ['GET', 'PUT'], '/sources': ['GET'],
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
