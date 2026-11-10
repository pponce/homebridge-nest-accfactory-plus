// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
import './build-dashboard-ui.js';
// Copy the climate distributable and flatten the shared HomeKit modules.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let root = fileURLToPath(new URL('../', import.meta.url));
for (let [source, target, extensions, recursive] of [
  ['src', 'dist', ['.js'], false],
  ['src/protobuf', 'dist/protobuf', ['.proto'], true],
  ['src/plugins', 'dist/plugins', ['.js', '.mjs'], true],
]) {
  for (let name of readdirSync(join(root, source), { recursive })) {
    let sourceFile = join(root, source, name);
    if (extensions.includes(extname(name)) === false || statSync(sourceFile).isFile() === false) {
      continue;
    }
    let targetFile = join(root, target, name);
    mkdirSync(dirname(targetFile), { recursive: true });
    copyFileSync(sourceFile, targetFile);
  }
}

// Shared modules are published alongside the platform entry point, without their tests or changelogs.
for (let name of ['HomeKitDevice', 'HomeKitHistory', 'fetchWrapper']) {
  copyFileSync(join(root, 'src', name, name + '.js'), join(root, 'dist', name + '.js'));
  const notices = join(root, 'dist', 'licenses', name);
  mkdirSync(notices, { recursive: true });
  copyFileSync(join(root, 'src', name, 'LICENSE'), join(notices, 'LICENSE'));
  // Preserve an upstream NOTICE if a pinned dependency supplies one.
  if (existsSync(join(root, 'src', name, 'NOTICE'))) {
    copyFileSync(join(root, 'src', name, 'NOTICE'), join(notices, 'NOTICE'));
  }
}

