import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = JSON.parse(execFileSync(npm, ['pack', '--ignore-scripts', '--json'], { encoding: 'utf8' }))[0];
const tarball = path.resolve(packed.filename);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-plus-package-'));
try {
  for (const required of ['dist/index.js', 'dist/identity.js', 'dist/HomeKitDevice.js', 'dist/auth.js', 'config.schema.json', 'MIGRATION.md', 'dist/plugins/camera/streamer.js', 'dist/plugins/camera/talkback.js', 'dist/supportdump.js']) {
    assert.ok(packed.files.some((file) => file.path === required), 'Package missing ' + required);
  }
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"private":true}');
  execFileSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', tarball], { cwd: temporary, stdio: 'inherit' });
  const entry = path.join(temporary, 'node_modules/homebridge-nest-accfactory-plus/dist/index.js');
  const plugin = await import(pathToFileURL(entry).href);
  let registered;
  plugin.default({ registerPlatform: (...args) => { registered = args; } });
  assert.equal(registered[0], 'homebridge-nest-accfactory-plus');
  assert.equal(registered[1], 'NestAccfactory');
  assert.equal(typeof registered[2], 'function');
  console.log('Production tarball installs and registers successfully:', packed.filename);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
