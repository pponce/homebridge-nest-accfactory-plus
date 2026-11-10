import fs from 'node:fs';

const requiredFiles = [
  'dist/index.js',
  'dist/HomeKitDevice.js',
  'dist/HomeKitHistory.js',
  'dist/fetchWrapper.js',
  'dist/licenses/HomeKitDevice/LICENSE',
  'dist/licenses/HomeKitHistory/LICENSE',
  'dist/licenses/fetchWrapper/LICENSE',
];
const missingFiles = requiredFiles.filter((file) => fs.existsSync(file) === false);

if (missingFiles.length !== 0) {
  throw new Error(
    'Build is incomplete; missing ' +
      missingFiles.join(', ') +
      '. Initialize the HomeKitDevice and HomeKitHistory Git submodules before building.',
  );
}

for (const file of [
  'dist/plugins/camera.js', 'dist/plugins/camera', 'dist/plugins/doorbell.js',
  'dist/plugins/floodlight.js', 'dist/res', 'dist/ringbuffer.js',
]) {
  if (fs.existsSync(file)) {
    throw new Error('Build contains unsupported camera code: ' + file);
  }
}

