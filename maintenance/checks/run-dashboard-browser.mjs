// Keep fixture failures visible in workflow job metadata as well as full logs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

let detail = 'Embedded and standalone browser checks passed';
for (const file of ['maintenance/checks/dashboard-browser.mjs', 'maintenance/checks/dashboard-web-browser.mjs']) {
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env, maxBuffer: 20 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  if (result.status !== 0) {
    const lines = output.split('\n').map((line) => line.trim());
    const failure = lines.find((line) => /AssertionError|Error:|Timeout/.test(line)) || result.error?.message || 'Browser fixture failed';
    detail = file.split('/').at(-1) + ': ' + failure.replace(/[\r\n]/g, ' ').slice(0, 300);
    process.exitCode = 1;
    break;
  }
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'detail=' + detail + '\n');
