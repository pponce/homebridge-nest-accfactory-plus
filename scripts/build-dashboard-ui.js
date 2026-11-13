// Package the same dashboard application for Homebridge's public asset directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../homebridge-ui/', import.meta.url));
const destination = path.join(root, 'public', 'climate');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.join(destination, 'shared'), { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'dashboard'))) {
  if (name !== 'index.html') {
    fs.copyFileSync(path.join(root, 'dashboard', name), path.join(destination, name));
  }
}
// Homebridge serves its root HTML entrypoint and JS/CSS assets, but rejects nested HTML.
// Bundle the shared page as module data so both hosts use the same climate interface.
const markup = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
fs.writeFileSync(path.join(destination, 'markup.js'), 'export default ' + JSON.stringify(markup) + ';\n');
const app = fs.readFileSync(path.join(destination, 'app.js'), 'utf8').replaceAll("from '/shared/", "from './shared/");
fs.writeFileSync(path.join(destination, 'app.js'), app);
for (const name of [
  'climate-utils.js', 'sensor-preview.js', 'fan-speed.js', 'occupancy-condition.js', 'rule-window.js', 'time-zone-picker.js',
  'connection-page.js', 'connection-config.js',
]) {
  fs.copyFileSync(path.join(root, 'public', name), path.join(destination, 'shared', name));
}

