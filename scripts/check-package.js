import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = JSON.parse(execFileSync(npm, ['pack', '--ignore-scripts', '--json'], { encoding: 'utf8' }))[0];
const tarball = path.resolve(packed.filename);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-climate-package-'));
try {
  for (const required of [
    'dist/index.js',
    'dist/identity.js',
    'dist/HomeKitDevice.js',
    'dist/auth.js',
    'config.schema.json',
    'MIGRATION.md',
    'WEB_DASHBOARD.md',
    'AUTHENTICATION.md',
    'scripts/migration-preflight.mjs',
    'homebridge-ui/server.js',
    'homebridge-ui/connection-setup.js',
    'homebridge-ui/public/connection-config.js',
    'homebridge-ui/public/connection-page.js',
    'homebridge-ui/public/climate/shared/connection-config.js',
    'homebridge-ui/public/climate/shared/connection-page.js',
    'homebridge-ui/bridge-discovery.js',
    'homebridge-ui/public/index.html',
    'homebridge-ui/public/index.js',
    'homebridge-ui/public/host.css',
    'homebridge-ui/public/climate/app.js',
    'homebridge-ui/public/climate/markup.js',
    'homebridge-ui/public/climate/styles.css',
    'homebridge-ui/public/climate/shared/climate-utils.js',
    'homebridge-ui/public/nest-climate-cntrl-icon-512.png',
    'homebridge-ui/public/web-dashboard-setup.js',
    'homebridge-ui/public/climate-utils.js',
    'homebridge-ui/public/time-zone-picker.js',
    'dist/schedule-time-zone.js',
    'dist/child-bridge-restart.js',
    'homebridge-ui/dashboard/index.html',
    'homebridge-ui/dashboard/app.js',
    'homebridge-ui/dashboard/styles.css',
    'homebridge-ui/dashboard/manifest.webmanifest',
    'homebridge-ui/dashboard/apple-touch-icon.png',
    'homebridge-ui/dashboard/favicon.png',
    'homebridge-ui/dashboard/icon-192.png',
    'homebridge-ui/dashboard/icon-512.png',
    'dist/climate-automation.js',
    'dist/heating-response.js',
    'dist/climate-presence.js',
    'homebridge-ui/climate-access.js',
    'dist/web-dashboard.js',
    'dist/web-dashboard-auth.js',
    'dist/web-dashboard-config.js',
    'dist/plugins/camera/streamer.js',
    'dist/plugins/camera/talkback.js',
    'dist/supportdump.js',
  ]) {
    assert.ok(
      packed.files.some((file) => file.path === required),
      'Package missing ' + required,
    );
  }
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"private":true}');
  execFileSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', tarball], { cwd: temporary, stdio: 'inherit' });
  const entry = path.join(temporary, 'node_modules/homebridge-nest-climate-cntrl/dist/index.js');
  const plugin = await import(pathToFileURL(entry).href);
  let registered;
  plugin.default({
    registerPlatform: (...args) => {
      registered = args;
    },
  });
  assert.equal(registered[0], 'homebridge-nest-climate-cntrl');
  assert.equal(registered[1], 'NestClimateCntrl');
  assert.equal(typeof registered[2], 'function');
  const root = path.join(temporary, 'node_modules/homebridge-nest-climate-cntrl');
  const { default: markup } = await import(pathToFileURL(path.join(root, 'homebridge-ui/public/climate/markup.js')).href);
  assert.equal(markup, fs.readFileSync(path.join(root, 'homebridge-ui/dashboard/index.html'), 'utf8'));
  assert.equal(fs.existsSync(path.join(root, 'homebridge-ui/public/climate/index.html')), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'config.schema.json')));
  assert.equal(pkg.name, registered[0]);
  assert.equal(schema.pluginAlias, registered[1]);
  assert.deepEqual(schema.schema.properties.dashboardTemperatureUnit.enum, ['C', 'F']);
  const units = await import(pathToFileURL(path.join(root, 'homebridge-ui/public/climate-utils.js')).href);
  assert.equal(units.celsiusTemperature(77, 'F'), 25);
  assert.equal(units.celsiusTemperature(1.8, 'F', true), 1);
  assert.deepEqual(schema.schema.properties.webDashboard.properties.protocol.enum, ['https', 'http', 'proxy']);
  const web = await import(pathToFileURL(path.join(root, 'dist/web-dashboard.js')).href);
  const proxy = web.normalizeWebDashboard({ protocol: 'proxy', host: '::', publicOrigin: 'https://climate.example.com' });
  assert.equal(proxy.host, '127.0.0.1');
  assert.equal(proxy.publicOrigin, 'https://climate.example.com');
  const engine = await import(pathToFileURL(path.join(root, 'dist/climate-automation.js')).href);
  assert.equal(typeof engine.ClimateAutomation, 'function');
  const presence = await import(pathToFileURL(path.join(root, 'dist/climate-presence.js')).href);
  assert.equal(typeof presence.ClimatePresence, 'function');
  const preflight = await import(pathToFileURL(path.join(root, 'scripts/migration-preflight.mjs')).href);
  assert.equal(typeof preflight.inspectInstallation, 'function');
  console.log('Production tarball installs and registers successfully:', packed.filename);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
