const filled = (value) => typeof value === 'string' && value.trim().length > 0;
export function accountRows(block = {}) {
  if (Array.isArray(block.accounts) && block.accounts.length) return structuredClone(block.accounts);
  const rows = [];
  if (filled(block.nest?.access_token)) rows.push({ ...block.nest, name: 'Nest', type: 'nest' });
  if (filled(block.google?.issuetoken) && filled(block.google?.cookie)) rows.push({ ...block.google, name: 'Google', type: 'google', issueToken: block.google.issuetoken });
  return rows;
}
export function usableAccount(account) {
  if (!account || !filled(account.name) || account.exclude === true) return false;
  return account.type === 'nest' ? filled(account.access_token) : account.type === 'google' &&
    (account.authMethod === 'refreshToken' ? filled(account.refreshToken) : filled(account.issueToken) && filled(account.cookie));
}
export function configuredAccounts(blocks) { return blocks.some((block) => accountRows(block).some(usableAccount)); }
export function setupDraft(block = {}) {
  return { accounts: accountRows(block), webDashboard: { enabled: false, protocol: 'https', host: '0.0.0.0', port: 9444, ...block.webDashboard } };
}
export function validateSetup(draft) {
  if (!Array.isArray(draft.accounts) || draft.accounts.length > 32) throw new Error('Use at most 32 accounts.');
  for (const account of draft.accounts) {
    if (!filled(account?.name) || !['google', 'nest'].includes(account.type)) throw new Error('Each account needs a name and account type.');
    if (account.exclude !== true && !usableAccount(account)) throw new Error('Complete the credentials for each enabled account.');
  }
  const web = draft.webDashboard;
  if (typeof web?.enabled !== 'boolean' || !['https', 'http', 'proxy'].includes(web.protocol)) throw new Error('Choose a supported web connection mode.');
  if (!Number.isInteger(web.port) || web.port < 1024 || web.port > 65535) throw new Error('Use a web port from 1024 to 65535.');
  if (web.enabled && !draft.accounts.some(usableAccount)) throw new Error('Configure an enabled Nest or Google account before enabling web access.');
  if (web.enabled && web.protocol === 'proxy') {
    let url;
    try { url = new URL(web.publicOrigin); } catch { /* Invalid origins are rejected below. */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter a public HTTPS origin without a path, query or credentials.');
  }
  if (web.enabled && web.protocol === 'https' && Boolean(web.certificatePath) !== Boolean(web.keyPath)) throw new Error('Provide both TLS file paths, or leave both blank for a local certificate.');
  return draft;
}
export function applySetup(blocks, draft) {
  validateSetup(draft);
  const result = structuredClone(blocks.length ? blocks : [{ platform: 'NestClimateCntrl', name: 'Nest Climate Cntrl' }]);
  result[0].accounts = structuredClone(draft.accounts).map((account) => {
    if (account.type === 'nest') { delete account.issueToken; delete account.cookie; delete account.refreshToken; delete account.authMethod; }
    else {
      delete account.access_token;
      if (account.authMethod === 'refreshToken') { delete account.issueToken; delete account.cookie; }
      else delete account.refreshToken;
    }
    return account;
  });
  result[0].webDashboard = structuredClone(draft.webDashboard);
  // Account editing replaces legacy credentials so removing an account is durable.
  delete result[0].nest; delete result[0].google;
  return result;
}
