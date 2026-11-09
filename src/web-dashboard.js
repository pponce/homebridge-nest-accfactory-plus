import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebDashboardAuth, SESSION_COOKIE, HTTP_SESSION_COOKIE } from './web-dashboard-auth.js';
import { WebDashboardConfig, DashboardConfigError } from './web-dashboard-config.js';
import { ClimateAccess } from '../homebridge-ui/climate-access.js';
import { ChildBridgeRestart } from './child-bridge-restart.js';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../homebridge-ui/', import.meta.url));
const assets = new Map([
  ['/', ['dashboard/index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['dashboard/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['dashboard/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['dashboard/styles.css', 'text/css; charset=utf-8']],
  ['/manifest.webmanifest', ['dashboard/manifest.webmanifest', 'application/manifest+json']],
  ['/favicon.png', ['dashboard/favicon.png', 'image/png']],
  ['/apple-touch-icon.png', ['dashboard/apple-touch-icon.png', 'image/png']],
  ['/icon-192.png', ['dashboard/icon-192.png', 'image/png']],
  ['/icon-512.png', ['dashboard/icon-512.png', 'image/png']],
  ['/shared/climate-utils.js', ['public/climate-utils.js', 'text/javascript; charset=utf-8']],
  ['/shared/time-zone-picker.js', ['public/time-zone-picker.js', 'text/javascript; charset=utf-8']],
  ['/shared/sensor-preview.js', ['public/sensor-preview.js', 'text/javascript; charset=utf-8']],
  ['/shared/fan-speed.js', ['public/fan-speed.js', 'text/javascript; charset=utf-8']],
]);
const hostname = (value) =>
  typeof value === 'string' &&
  value.length <= 253 &&
  (isIP(value) || /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(value));
const ipAddresses = () => {
  try {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((item) => item && !item.internal && item.family === 'IPv4')
      .map((item) => item.address);
  } catch {
    return [];
  }
};
const authority = (host, port) => (isIP(host) === 6 ? '[' + host + ']' : host) + ':' + port;

const httpsOrigin = (value) => {
  if (typeof value !== 'string' || !/^https:\/\/[^/?#\\\s]+\/?$/i.test(value)) {
    return '';
  }
  try {
    const url = new URL(value);
    return !url.username && !url.password && hostname(url.hostname.replace(/^\[|\]$/g, '')) ? url.origin : '';
  } catch {
    return '';
  }
};

export function normalizeWebDashboard(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const protocol = ['http', 'proxy'].includes(input.protocol) ? input.protocol : 'https';
  return {
    enabled: input.enabled === true,
    protocol,
    // Proxy mode deliberately supports a proxy on this machine only, even with a saved LAN bind address.
    host:
      protocol === 'proxy'
        ? '127.0.0.1'
        : typeof input.host === 'string' && (isIP(input.host) || input.host === 'localhost')
          ? input.host
          : '0.0.0.0',
    port: Number.isInteger(input.port) && input.port >= 1024 && input.port <= 65535 ? input.port : 9444,
    publicOrigin: httpsOrigin(input.publicOrigin),
    displayHost: hostname(input.displayHost) ? input.displayHost : '',
    certificatePath: typeof input.certificatePath === 'string' ? input.certificatePath : '',
    keyPath: typeof input.keyPath === 'string' ? input.keyPath : '',
  };
}

export async function loadWebCertificate(directory, options, names, signal) {
  if (Boolean(options.certificatePath) !== Boolean(options.keyPath)) {
    throw new Error('Both certificate files are required.');
  }
  if (options.certificatePath) {
    return { cert: await fs.readFile(options.certificatePath), key: await fs.readFile(options.keyPath) };
  }
  const certFile = path.join(directory, 'web-certificate.pem');
  const keyFile = path.join(directory, 'web-private-key.pem');
  try {
    const cert = await fs.readFile(certFile);
    const key = await fs.readFile(keyFile);
    const parsed = new crypto.X509Certificate(cert);
    const namesMatch = [...new Set(names)].filter(hostname).every((name) => (isIP(name) ? parsed.checkIP(name) : parsed.checkHost(name)));
    if (namesMatch && Date.parse(parsed.validTo) > Date.now() + 7 * 86400000 && parsed.checkPrivateKey(crypto.createPrivateKey(key))) {
      return { cert, key };
    }
  } catch {
    // First run, expired certificate, or incomplete key pair: create a local HTTPS identity.
  }
  const temporary = path.join(directory, 'web-tls-' + crypto.randomUUID());
  try {
    const san = [...new Set(names)]
      .filter(hostname)
      .map((name) => (isIP(name) ? 'IP:' : 'DNS:') + name)
      .join(',');
    await execute(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-sha256',
        '-nodes',
        '-days',
        '365',
        '-keyout',
        temporary + '.key',
        '-out',
        temporary + '.crt',
        '-subj',
        '/CN=Nest Climate Cntrl',
        '-addext',
        'subjectAltName=' + san,
      ],
      { timeout: 20000, maxBuffer: 65536, signal },
    );
    await fs.chmod(temporary + '.key', 0o600);
    await fs.chmod(temporary + '.crt', 0o600);
    await fs.rename(temporary + '.key', keyFile);
    await fs.rename(temporary + '.crt', certFile);
    return { cert: await fs.readFile(certFile), key: await fs.readFile(keyFile) };
  } finally {
    await fs.rm(temporary + '.key', { force: true });
    await fs.rm(temporary + '.crt', { force: true });
  }
}

export class WebDashboard {
  constructor({
    storage,
    configPath,
    platformConfig,
    dashboard,
    log,
    accessFactory,
    tlsFactory = loadWebCertificate,
    assetRoot = root,
    discoveryDelay = 3500,
    restartFactory = (options) => new ChildBridgeRestart(options),
  }) {
    const username = platformConfig?._bridge?.username;
    const instance =
      typeof username === 'string' && /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(username)
        ? 'bridge-' + username.replaceAll(':', '').toLowerCase()
        : 'main';
    this.directory = path.join(storage, 'nest-climate', 'web', instance);
    this.options = normalizeWebDashboard(platformConfig?.webDashboard);
    this.dashboard = dashboard;
    this.log = log;
    this.auth = new WebDashboardAuth(this.directory);
    this.sessionCookie = this.options.protocol === 'http' ? HTTP_SESSION_COOKIE : SESSION_COOKIE;
    this.cookieAttributes = '; Path=/; HttpOnly;' + (this.options.protocol !== 'http' ? ' Secure;' : '') + ' SameSite=Strict; Max-Age=';
    this.config = new WebDashboardConfig(configPath, platformConfig, { knownDevices: () => [...dashboard.devices.keys()] });
    this.instanceId = crypto.randomUUID();
    this.childRestart = restartFactory({ storage, config: this.config, username });
    this.config.beforeSave = () => {
      if (['prepared', 'requested'].includes(this.childRestart.phase)) {
        throw new DashboardConfigError('A child-bridge restart is pending. Wait for it to reconnect.', 409);
      }
    };
    this.accessFactory = accessFactory ?? (() => new ClimateAccess(configPath));
    this.tlsFactory = tlsFactory;
    this.assetRoot = assetRoot;
    this.discoveryDelay = discoveryDelay;
    this.closing = new AbortController();
    const listenHost = ['0.0.0.0', '::'].includes(this.options.host) ? '' : this.options.host;
    this.allowedHosts = new Set(
      ['localhost', '127.0.0.1', '::1', os.hostname(), ...ipAddresses(), listenHost, this.options.displayHost]
        .filter(Boolean)
        .map((host) => host.toLowerCase()),
    );
    this.error = undefined;
    this.stopping = false;
  }

  status() {
    const displayHost =
      this.options.displayHost || (['0.0.0.0', '::'].includes(this.options.host) ? ipAddresses()[0] || '127.0.0.1' : this.options.host);
    return {
      enabled: this.options.enabled,
      available: this.server?.listening === true,
      port: this.options.port,
      protocol: this.options.protocol === 'proxy' ? 'https' : this.options.protocol,
      connectionMode: this.options.protocol,
      url: this.options.enabled
        ? this.options.protocol === 'proxy'
          ? this.options.publicOrigin || null
          : this.options.protocol + '://' + authority(displayHost, this.options.port)
        : null,
      accountConfigured: Boolean(this.auth.account),
      username: this.auth.account?.username,
      error: this.error,
      instanceId: this.instanceId,
    };
  }

  async configuration(saved) {
    const view = saved ?? await this.config.snapshot();
    return {
      ...view, web: this.status(),
      restart: view.restartRequired ? await this.childRestart.capability() : { available: false },
    };
  }

  start() {
    this.starting ??= this.startListener();
    return this.starting;
  }

  async startListener() {
    await this.auth.load();
    if (this.stopping || !this.options.enabled || this.server?.listening) {
      return this.status();
    }
    if (this.options.protocol === 'proxy' && !this.options.publicOrigin) {
      this.error = 'Reverse proxy mode requires a public HTTPS origin without a path, query or credentials.';
      this.log?.warn?.(this.error);
      return this.status();
    }
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const tls =
        this.options.protocol === 'https'
          ? await this.tlsFactory(this.directory, this.options, [...this.allowedHosts], this.closing.signal)
          : undefined;
      if (this.stopping) {
        return this.status();
      }
      const listener = (request, response) => {
        this.handle(request, response).catch(() => {
          if (!response.headersSent) {
            this.send(response, 500, { error: 'The dashboard request could not be completed.' });
          } else {
            response.destroy();
          }
        });
      };
      this.server =
        this.options.protocol === 'https' ? https.createServer({ ...tls, minVersion: 'TLSv1.2' }, listener) : http.createServer(listener);
      this.server.requestTimeout = 15000;
      this.server.headersTimeout = 10000;
      this.server.keepAliveTimeout = 5000;
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(this.options.port, this.options.host, resolve);
      });
      this.server.on('error', () => {
        this.error = 'The ' + this.options.protocol.toUpperCase() + ' listener is unavailable.';
      });
      this.error = undefined;
      this.log?.info?.('Climate web dashboard: %s', this.status().url);
      if (this.options.protocol === 'http') {
        this.log?.warn?.(
          'Climate dashboard uses HTTP. Passwords and dashboard data travel unencrypted; use only on a trusted local network.',
        );
      }
    } catch {
      if (!this.stopping) {
        this.error =
          this.options.protocol === 'https'
            ? 'HTTPS dashboard could not start. Check the selected port, OpenSSL and certificate settings.'
            : 'HTTP dashboard could not start. Check the selected port and listen address.';
        this.log?.warn?.(this.error);
      }
      if (this.server?.listening) {
        await new Promise((resolve) => this.server.close(resolve));
      }
    }
    return this.status();
  }

  async setupAccount(payload) {
    return this.auth.setup(payload);
  }

  async sources() {
    if (this.stopping) {
      throw new DashboardConfigError('The dashboard is stopping.', 503);
    }
    if (!this.accessStarting) {
      this.access = this.accessFactory();
      this.accessStarting = this.access.start().catch(() => {
        this.access.close();
        this.accessStarting = undefined;
        throw new DashboardConfigError('Homebridge source discovery is unavailable.', 503);
      });
    }
    await this.accessStarting;
    if (this.stopping) {
      throw new DashboardConfigError('The dashboard is stopping.', 503);
    }
    if (!this.discovering) {
      this.access.client.startDiscovery(3500);
      this.discovering = delay(this.discoveryDelay, undefined, { signal: this.closing.signal })
        .then(() => this.access.refresh())
        .finally(() => {
          this.discovering = undefined;
        });
    }
    return this.discovering;
  }

  send(response, status, payload) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  async body(request) {
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? '')) {
      throw new DashboardConfigError('Send a JSON request.', 415);
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65536) {
        throw new DashboardConfigError('The request is too large.', 413);
      }
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new DashboardConfigError('Invalid JSON request.');
    }
  }

  safeHost(request) {
    try {
      if (this.options.protocol === 'proxy') {
        // Trust the socket peer and configured origin, never Forwarded or X-Forwarded-* headers.
        return (
          ['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress) &&
          typeof request.headers.host === 'string' &&
          request.headers.host.toLowerCase() === new URL(this.options.publicOrigin).host.toLowerCase()
        );
      }
      const host = new URL(this.options.protocol + '://' + request.headers.host);
      const defaultPort = this.options.protocol === 'https' ? 443 : 80;
      const name = host.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return (
        this.allowedHosts.has(name) &&
        !host.username &&
        !host.password &&
        host.pathname === '/' &&
        !host.search &&
        !host.hash &&
        (Number(host.port || defaultPort) === this.options.port ||
          (name === this.options.displayHost.toLowerCase() && Number(host.port || defaultPort) === defaultPort))
      );
    } catch {
      return false;
    }
  }

  sameOrigin(request) {
    try {
      if (this.options.protocol === 'proxy') {
        return Boolean(this.options.publicOrigin) && request.headers.origin === this.options.publicOrigin;
      }
      const origin = new URL(request.headers.origin);
      return (
        origin.protocol === this.options.protocol + ':' &&
        origin.host.toLowerCase() === request.headers.host.toLowerCase() &&
        origin.pathname === '/' &&
        !origin.username &&
        !origin.password
      );
    } catch {
      return false;
    }
  }

  async handle(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      'default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data:; ' +
        'connect-src \'self\'; base-uri \'none\'; object-src \'none\'; frame-ancestors \'none\'; form-action \'self\'',
    );
    if (!this.safeHost(request)) {
      this.send(response, 403, { error: 'This dashboard address is not allowed.' });
      return;
    }
    const route = request.url?.split('?')[0];
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if ((mutation || request.headers.origin) && !this.sameOrigin(request)) {
      this.send(response, 403, { error: 'Open this dashboard directly before making changes.' });
      return;
    }
    try {
      if (request.method === 'GET' && assets.has(route)) {
        const [file, contentType] = assets.get(route);
        const bytes = await fs.readFile(path.join(this.assetRoot, file));
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(bytes);
        return;
      }
      const { token, session } = this.auth.session(request.headers.cookie, this.sessionCookie);
      if (request.method === 'GET' && route === '/api/session') {
        this.send(response, 200, {
          authenticated: Boolean(session),
          instanceId: this.instanceId,
          setupRequired: !this.auth.account,
          username: session?.username,
          csrfToken: session?.csrfToken,
        });
        return;
      }
      if (request.method === 'POST' && route === '/api/login') {
        const result = await this.auth.login(await this.body(request), request.socket.remoteAddress);
        if (result.limited) {
          response.setHeader('Retry-After', '300');
          this.send(response, 429, { error: 'Too many sign-in attempts. Try again in five minutes.' });
          return;
        }
        if (!result.authenticated) {
          this.send(response, 401, { error: 'Username or password not accepted.' });
          return;
        }
        response.setHeader('Set-Cookie', this.sessionCookie + '=' + result.token + this.cookieAttributes + '28800');
        this.send(response, 200, {
          authenticated: true,
          setupRequired: false,
          username: result.session.username,
          csrfToken: result.session.csrfToken,
        });
        return;
      }
      if (!route?.startsWith('/api/')) {
        this.send(response, 404, { error: 'Page not found.' });
        return;
      }
      if (!session) {
        this.send(response, 401, { error: 'Sign in to continue.' });
        return;
      }
      if (mutation && request.headers['x-csrf-token'] !== session.csrfToken) {
        this.send(response, 403, { error: 'Refresh this page before making changes.' });
        return;
      }
      if (request.method === 'POST' && route === '/api/logout') {
        this.auth.revoke(token);
        response.setHeader('Set-Cookie', this.sessionCookie + '=' + this.cookieAttributes + '0');
        this.send(response, 200, { authenticated: false });
        return;
      }
      await this.handleClimate(request, response, route);
    } catch (error) {
      if (error instanceof DashboardConfigError) {
        this.send(response, error.status, { error: error.message });
      } else {
        this.send(response, 503, { error: 'The request could not be completed. Refresh and check the device or Homebridge connection.' });
      }
    }
  }

  // Shared climate routes: web sessions and authenticated Homebridge IPC use the same handlers.
  async handleClimate(request, response, route) {
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if (request.method === 'GET' && route === '/api/status') {
      this.send(response, 200, this.dashboard.snapshot());
      return;
    }
    if (request.method === 'GET' && route === '/api/bridge/restart') {
      this.send(response, 200, { phase: this.childRestart.phase, message: this.childRestart.message });
      return;
    }
    if (mutation && ['prepared', 'requested'].includes(this.childRestart.phase)) {
      throw new DashboardConfigError('A child-bridge restart is pending. Wait for it to reconnect.', 409);
    }
    if (request.method === 'POST' && route === '/api/bridge/restart') {
      const restart = await this.childRestart.prepare(await this.body(request));
      response.once('finish', () => {
        this.restartTimer = setTimeout(() => {
          if (!this.stopping) {
            void restart();
          }
        }, 200);
        this.restartTimer.unref();
      });
      response.once('close', () => {
        if (!response.writableFinished && this.childRestart.phase === 'prepared') {
          this.childRestart.phase = 'failed';
          this.childRestart.message = 'The connection closed before the restart could be requested.';
        }
      });
      this.send(response, 202, { accepted: true, instanceId: this.instanceId });
      return;
    }
    if (request.method === 'GET' && route === '/api/sources') {
      this.send(response, 200, await this.sources());
      return;
    }
    if (request.method === 'GET' && route === '/api/config') {
      this.send(response, 200, await this.configuration());
      return;
    }
    if (request.method === 'PUT' && route === '/api/config') {
      const saved = await this.config.save(await this.body(request));
      await this.dashboard.automation?.tick();
      this.send(response, 200, await this.configuration(saved));
      return;
    }
    if (
      (request.method === 'GET' && route === '/api/heating-response') ||
      (request.method === 'POST' && route === '/api/heating-response/apply')
    ) {
      const automation = this.dashboard.automation;
      if (!automation || automation.stopping) {
        throw new DashboardConfigError('Heating recommendations are unavailable. Check the Nest bridge.', 503);
      }
      const result =
        request.method === 'GET'
          ? await automation.heatingRecommendations()
          : await this.configuration(await automation.applyHeatingRecommendation(await this.body(request)));
      this.send(response, 200, result);
      return;
    }
    if (request.method === 'POST' && route === '/api/rules/command') {
      if (!this.dashboard.automation) {
        throw new DashboardConfigError('Restart the Nest bridge to start climate automation.', 503);
      }
      try {
        this.send(response, 200, await this.dashboard.automation.control(await this.body(request)));
      } catch (error) {
        if (error instanceof DashboardConfigError) {
          throw error;
        }
        throw new DashboardConfigError('The rule action could not be applied. Select an enabled rule and refresh.');
      }
      return;
    }
    if (request.method === 'POST' && route === '/api/temperature-target') {
      this.send(response, 200, await this.dashboard.setTemperatureTarget(await this.body(request)));
      return;
    }
    if (request.method === 'POST' && route === '/api/command') {
      this.send(response, 200, await this.dashboard.control(await this.body(request)));
      return;
    }
    this.send(response, 404, { error: 'Page not found.' });
  }

  async stop() {
    clearTimeout(this.restartTimer);
    this.stopping = true;
    this.closing.abort();
    this.auth.close();
    await this.starting?.catch(() => {});
    await this.accessStarting?.catch(() => {});
    this.access?.close();
    await this.discovering?.catch(() => {});
    await this.config.saving;
    if (this.server?.listening) {
      this.server.closeAllConnections();
      await new Promise((resolve) => this.server.close(resolve));
    }
  }
}
