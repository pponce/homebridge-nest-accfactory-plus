// Package the same dashboard application for Homebridge's public asset directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../homebridge-ui/', import.meta.url));
const destination = path.join(root, 'public', 'climate');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.join(destination, 'shared'), { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'dashboard'))) {
  fs.copyFileSync(path.join(root, 'dashboard', name), path.join(destination, name));
}
const app = fs.readFileSync(path.join(destination, 'app.js'), 'utf8').replaceAll("from '/shared/", "from './shared/");
fs.writeFileSync(path.join(destination, 'app.js'), app);
for (const name of ['climate-utils.js', 'sensor-preview.js', 'fan-speed.js', 'time-zone-picker.js']) {
  fs.copyFileSync(path.join(root, 'public', name), path.join(destination, 'shared', name));
}
