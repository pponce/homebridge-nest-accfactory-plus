import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { DashboardConfigError } from './web-dashboard-config.js';

const PLUGIN = 'homebridge-nest-climate-cntrl';
const fail = (message, status = 503) => new DashboardConfigError(message, status);
const fallback = 'Restart this child bridge from Homebridge.';

function localRequest(connection, route, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = (connection.tls ? https : http).request({
      hostname: '127.0.0.1', port: connection.port, path: route, method, signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + connection.token, Accept: 'application/json' },
      ...(connection.tls ? { ca: connection.ca, servername: 'localhost' } : {}),
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 524288) {
          request.destroy(new Error('Response too large'));
        } else {
          chunks.push(chunk);
        }
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200 && response.statusCode !== 201) {
          const error = fail('Homebridge UI did not authorize or accept this request. ' + fallback);
          error.restartRejected = true;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(fail('Homebridge UI returned an unreadable response. ' + fallback));
        }
      });
    });
    request.on('error', () => reject(fail('The local Homebridge UI connection is unavailable. ' + fallback)));
    request.setTimeout(5000, () => request.destroy(new Error('Request timed out')));
    request.end();
  });
}

export class ChildBridgeRestart {
  constructor({ storage, config, username, pid = process.pid, request = localRequest }) {
    this.storage = storage;
    this.config = config;
    this.username = username?.toUpperCase();
    this.pid = pid;
    this.request = request;
    this.phase = 'idle';
    this.message = null;
  }

  async inspect() {
    if (!/^(?:[A-F\d]{2}:){5}[A-F\d]{2}$/.test(this.username ?? '')) {
      throw fail('This plugin is running on the main bridge. Restart it from Homebridge.');
    }
    const state = await this.config.read();
    const peers = [...state.root.platforms, ...(state.root.accessories ?? [])].filter(
      (entry) => entry._bridge?.username?.toUpperCase() === this.username,
    );
    if (peers.length !== 1 || state.block._bridge?.disable === true) {
      throw fail('This child bridge is shared or disabled. ' + fallback);
    }
    const interfaces = state.root.platforms.filter((entry) => entry.platform?.split('.').at(-1) === 'Config');
    if (interfaces.length !== 1) {
      throw fail('A unique Homebridge UI configuration could not be found. ' + fallback);
    }
    const ui = interfaces[0];
    const port = Number(ui.port ?? process.env.HOMEBRIDGE_CONFIG_UI_PORT ?? 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw fail('The Homebridge UI port is invalid. ' + fallback);
    }
    let secrets;
    let ca;
    try {
      secrets = JSON.parse(await fs.readFile(path.join(this.storage, '.uix-secrets'), 'utf8'));
      if (typeof secrets.secretKey !== 'string' || secrets.secretKey.length < 32) {
        throw new Error('Unavailable service credential');
      }
      if (ui.ssl?.cert) {
        ca = await fs.readFile(ui.ssl.cert);
      }
    } catch {
      throw fail('Homebridge UI service authentication is unavailable. ' + fallback);
    }
    // Homebridge UI documents this service-token contract in its AuthService.
    // It is used only on loopback, expires in one minute and never reaches the browser.
    const issued = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      service: PLUGIN, admin: true, instanceId: crypto.createHash('sha256').update(secrets.secretKey).digest('hex'),
      iat: issued, exp: issued + 60,
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secrets.secretKey).update(header + '.' + payload).digest('base64url');
    const connection = {
      port, tls: Boolean(ui.ssl?.key || ui.ssl?.pfx || ui.ssl?.cert), ca, token: header + '.' + payload + '.' + signature,
    };
    const bridges = await this.request(connection, '/api/status/homebridge/child-bridges');
    const matches = Array.isArray(bridges) ? bridges.filter((bridge) => bridge.username?.toUpperCase() === this.username) : [];
    if (
      matches.length !== 1 || matches[0].plugin !== PLUGIN ||
      matches[0].identifier?.split('.').at(-1) !== 'NestClimateCntrl' || matches[0].pid !== this.pid || matches[0].manuallyStopped
    ) {
      throw fail('Homebridge could not identify this running Nest child bridge. ' + fallback);
    }
    return { connection, revision: state.revision };
  }

  async capability() {
    try {
      await this.inspect();
      return { available: true, phase: this.phase, message: this.message };
    } catch (error) {
      return { available: false, phase: this.phase, message: error instanceof DashboardConfigError ? error.message : fallback };
    }
  }

  prepare(payload) {
    const operation = this.config.saving.then(async () => {
      if (!payload || Object.keys(payload).length !== 1 || typeof payload.revision !== 'string') {
        throw fail('Save and review your settings before restarting.', 400);
      }
      if (['prepared', 'requested'].includes(this.phase)) {
        throw fail('A child-bridge restart is already pending.', 409);
      }
      if (!this.config.restartRequired) {
        throw fail('No saved settings require a restart.', 409);
      }
      const check = await this.inspect();
      if (check.revision !== payload.revision) {
        throw fail('Settings changed. Reload and review them before restarting.', 409);
      }
      this.phase = 'prepared';
      this.message = null;
      return async () => {
        let dispatched = false;
        let replied = false;
        try {
          const latest = await this.inspect();
          if (latest.revision !== payload.revision) {
            throw fail('Settings changed before the restart. Reload and review them.', 409);
          }
          dispatched = true;
          this.phase = 'requested';
          const result = await this.request(latest.connection, '/api/server/restart/' + this.username.replaceAll(':', ''), 'PUT');
          replied = true;
          if (result?.ok !== true) {
            throw fail('Homebridge did not confirm the restart request. ' + fallback);
          }
          this.phase = 'requested';
        } catch (error) {
          if (dispatched && !replied && !error.restartRejected) {
            this.phase = 'requested';
            this.message = 'The restart reply was interrupted. Waiting for reconnection; the request will not be repeated.';
          } else {
            this.phase = 'failed';
            this.message = error instanceof DashboardConfigError ? error.message : 'The restart request failed. ' + fallback;
          }
        }
      };
    });
    this.config.saving = operation.catch(() => {});
    return operation;
  }
}
