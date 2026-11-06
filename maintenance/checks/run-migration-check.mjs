import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let detail = 'Migration restoration passed';
try {
  const output = execFileSync(process.execPath, ['maintenance/checks/migration-restore.mjs'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  });
  process.stdout.write(output);
} catch (error) {
  const output = String(error.stderr || error.stdout || error.message);
  process.stderr.write(output);
  detail = output.split('\n').filter((line) => /Error|Cannot|Assertion|actual:|expected:|migration-restore\.mjs:\d/.test(line))
    .join(' ').slice(0, 480) || 'Migration restoration failed; inspect the job log';
  process.exitCode = 1;
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'detail=' + detail.replace(/[\r\n]/g, ' ') + '\n');
