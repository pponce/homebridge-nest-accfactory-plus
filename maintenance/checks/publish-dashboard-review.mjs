// Publish fixture screenshots only; source branches and release assets are never modified.
import fs from 'node:fs/promises';
import path from 'node:path';

const repository = process.env.GITHUB_REPOSITORY;
const source = process.env.REVIEW_SOURCE_COMMIT || process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const heating = process.env.GITHUB_REF === 'refs/heads/feature/heating-response';
if (repository !== 'pponce/homebridge-nest-climate-cntrl' || (!heating && process.env.GITHUB_REF !== 'refs/heads/feature/standalone-dashboard') ||
  process.env.GITHUB_EVENT_NAME !== 'push' || !/^[a-f0-9]{40}$/.test(source ?? '') || !token || !process.env.REVIEW_OUTPUT_DIR) {
  throw new Error('Visual review publication is restricted to the dashboard and heating-response push workflows.');
}
const sourceBranch = heating ? 'feature/heating-response' : 'feature/standalone-dashboard';
const branch = heating ? 'review/heating-response' : 'review/standalone-dashboard';
const names = heating ? ['heating-response-desktop.png', 'heating-response-mobile.png'] : ['login-desktop.png', 'overview-desktop.png', 'rules-desktop.png', 'overview-mobile.png', 'sources-mobile.png',
  'rules-mobile.png', 'settings-mobile.png', 'overview-mobile-dark.png'];

async function request(route, body, optional = false) {
  const response = await fetch('https://api.github.com/repos/' + repository + route, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error('Visual review GitHub request failed with status ' + response.status + '.');
  return response.json();
}

const tree = [];
for (const name of names) {
  const bytes = await fs.readFile(path.join(process.env.REVIEW_OUTPUT_DIR, name));
  if (bytes.length > 4 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Expected a bounded PNG fixture screenshot.');
  }
  const blob = await request('/git/blobs', { content: bytes.toString('base64'), encoding: 'base64' });
  tree.push({ path: name, mode: '100644', type: 'blob', sha: blob.sha });
  // Text companions allow repository tools that only read UTF-8 to retrieve the exact review image.
  tree.push({ path: name + '.base64', mode: '100644', type: 'blob', content: bytes.toString('base64') + '\n' });
}
const report = { sourceCommit: source, sourceBranch, fixtureDataOnly: true,
  checks: heating ? ['real dashboard API', 'explicit per-rule Apply', 'Fahrenheit differences', 'input focus', 'desktop and 390px layout', 'no equipment commands'] : ['desktop and 360px layout', 'CSP', 'draft rules never send live commands', 'configuration revision conflicts',
    'offline controls', 'dark mode', 'iOS icon dimensions'], screenshots: names };
tree.push({ path: 'report.json', mode: '100644', type: 'blob', content: JSON.stringify(report, null, 2) + '\n' });
tree.push({ path: 'README.md', mode: '100644', type: 'blob', content: '# Climate dashboard visual review\n\n' +
  'Rendered with fixture data only. Source: [' + source.slice(0, 12) + '](https://github.com/' + repository + '/commit/' + source + ').\n\n' +
  names.map((name) => '## ' + name.replace('.png', '').replaceAll('-', ' ') + '\n\n![' + name + '](' + name + ')\n').join('\n') });
const existing = await request('/git/ref/heads/' + branch, undefined, true);
const createdTree = await request('/git/trees', { tree });
const commit = await request('/git/commits', { message: 'Visual review for dashboard ' + source.slice(0, 12), tree: createdTree.sha,
  parents: existing ? [existing.object.sha] : [] });
if (existing) {
  const response = await fetch('https://api.github.com/repos/' + repository + '/git/refs/heads/' + branch, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: false }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Visual review branch update was not accepted.');
} else {
  await request('/git/refs', { ref: 'refs/heads/' + branch, sha: commit.sha });
}
console.log('Visual review: https://github.com/' + repository + '/tree/' + branch);
