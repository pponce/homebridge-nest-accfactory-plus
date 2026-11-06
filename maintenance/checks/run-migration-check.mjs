import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const projectCheck = process.argv[2] === 'check';
let detail = projectCheck ? 'Project checks passed' : 'Migration restoration passed';
try {
  const output = execFileSync(projectCheck ? 'npm' : process.execPath, projectCheck ? ['run', 'check'] : ['maintenance/checks/migration-restore.mjs'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: projectCheck ? 240000 : 60000, maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(output);
} catch (error) {
  const output = String(error.stdout || '') + '\n' + String(error.stderr || error.message);
  process.stderr.write(output);
  detail = output.split('\n').filter((line) => /✖|Error|Cannot|Assertion|actual:|expected:|error:|code:|migration-restore\.mjs:\d/.test(line))
    .join(' ').slice(0, 480) || 'Migration restoration failed; inspect the job log';
  process.exitCode = 1;
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'detail=' + detail.replace(/[\r\n]/g, ' ') + '\n');
