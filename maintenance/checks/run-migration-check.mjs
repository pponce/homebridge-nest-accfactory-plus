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
  const failureStart = output.lastIndexOf('✖ failing tests:');
  const lines = (failureStart >= 0 ? output.slice(failureStart) : output).split('\n');
  const errorStart = lines.findIndex((line) => /AssertionError|Error \[|Error:|Cannot find/.test(line));
  detail = (errorStart >= 0 ? lines.slice(errorStart, errorStart + 18).join(' ') : lines.filter((line) => /✖|error:|code:/.test(line)).join(' '))
    .replaceAll(process.cwd(), '').replace(/\s+/g, ' ').slice(0, 480) || 'Validation failed; inspect the job log';
  if (failureStart < 0 && output.includes('Coverage gate failed:')) {
    detail = output.slice(output.lastIndexOf('Coverage gate failed:')).replace(/\s+/g, ' ').slice(0, 480);
  }
  process.exitCode = 1;
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'detail=' + detail.replace(/[\r\n]/g, ' ') + '\n');
