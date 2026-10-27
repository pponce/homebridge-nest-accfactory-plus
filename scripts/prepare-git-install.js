import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dependencies = [
  {
    directory: 'src/HomeKitDevice',
    entry: 'HomeKitDevice.js',
    repository: 'https://github.com/n0rt0nthec4t/HomeKitDevice.git',
    revision: 'f2340d534e96ff5a1d48caf7df14692e53d40e56',
  },
  {
    directory: 'src/fetchWrapper',
    entry: 'fetchWrapper.js',
    repository: 'https://github.com/n0rt0nthec4t/fetchWrapper.git',
    revision: '7a732d44078089d820e4a21a3cf63b41fdc6983d',
  },
  {
    directory: 'src/HomeKitHistory',
    entry: 'HomeKitHistory.js',
    repository: 'https://github.com/n0rt0nthec4t/HomeKitHistory.git',
    revision: '113789b639d15b8b20b49a7bc31eb6ba3cac07f0',
  },
];

for (const dependency of dependencies) {
  if (fs.existsSync(path.join(dependency.directory, dependency.entry)) === true) {
    continue;
  }

  // npm removes the parent repository's .git directory before running a Git
  // dependency's prepare script, so `git submodule update` cannot be used here.
  // Clone each missing submodule directly and pin it to the gitlink revision.
  fs.rmSync(dependency.directory, { force: true, recursive: true });

  try {
    execFileSync('git', ['clone', '--quiet', dependency.repository, dependency.directory], { stdio: 'inherit' });
    execFileSync('git', ['-C', dependency.directory, 'checkout', '--quiet', dependency.revision], { stdio: 'inherit' });
  } catch (error) {
    fs.rmSync(dependency.directory, { force: true, recursive: true });
    throw new Error('Unable to obtain build dependency ' + dependency.repository, { cause: error });
  }
}
