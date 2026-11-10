import { setupDraft, validateSetup } from './connection-config.js';

export function mountConnectionPage(root, { host, confirm, saved }) {
  let current; let draft; let dirty = false; let busy = false;
  let username = 'admin'; let password = ''; let accountStatus = {}; let loadGeneration = 0;
  const node = (tag, text, className) => {
    const item = document.createElement(tag); if (text !== undefined) item.textContent = text;
    if (className) item.className = className; return item;
  };
  const message = node('p', '', 'callout'); message.hidden = true; message.setAttribute('role', 'status');
  const say = (text) => { message.textContent = text; message.hidden = !text; };
  const webLive = node('div', undefined, 'connection-web-status');
  const changed = () => { dirty = true; say(''); };
  function field(parent, label, object, key, { type = 'text', choices, help, refresh = false } = {}) {
    const wrapper = node('label', undefined, 'field'); wrapper.append(node('span', label));
    const input = node(choices ? 'select' : 'input'); input.setAttribute('aria-label', label);
    if (choices) for (const [value, title] of choices) { const option = node('option', title); option.value = value; input.append(option); }
    else input.type = type;
    input.value = object[key] ?? '';
    if (type === 'password') input.autocomplete = 'off';
    input.addEventListener(choices ? 'change' : 'input', () => { object[key] = type === 'number' ? Number(input.value) : input.value; changed(); if (refresh) render(); });
    wrapper.append(input); if (help) wrapper.append(node('small', help)); parent.append(wrapper); return input;
  }
  function toggle(parent, label, object, key, help, refresh = false) {
    const wrapper = node('label', undefined, 'connection-toggle'); const input = node('input'); input.type = 'checkbox'; input.checked = object[key] === true;
    input.setAttribute('role', 'switch'); input.setAttribute('aria-label', label);
    input.addEventListener('change', () => { object[key] = input.checked; changed(); if (refresh) render(); });
    const copy = node('span'); copy.append(node('strong', label)); if (help) copy.append(node('small', help)); wrapper.append(input, copy); parent.append(wrapper);
  }
  function action(label, callback, className = 'button secondary') {
    const button = node('button', label, className); button.type = 'button'; button.addEventListener('click', callback); return button;
  }
  function render() {
    root.replaceChildren();
    const intro = node('div', undefined, 'section-heading'); const copy = node('div');
    copy.append(node('h2', current.configured ? 'Accounts & web access' : 'Connect your home'), node('p', 'Connect a Nest or Google account to get started. Homebridge Settings works with standalone web access off.'));
    intro.append(copy); root.append(intro, message);
    const form = node('form'); form.id = 'connection-form'; const fields = node('fieldset', undefined, 'connection-fields'); fields.disabled = busy;
    const accounts = node('section', undefined, 'panel connection-panel'); accounts.append(node('h3', 'Nest & Google accounts'));
    const help = node('p', 'Use an existing Nest or Google authentication token. ', 'small-note');
    const link = node('a', 'Credential setup instructions'); link.href = 'https://github.com/pponce/homebridge-nest-climate-cntrl/blob/main/AUTHENTICATION.md'; link.target = '_blank'; link.rel = 'noopener noreferrer'; help.append(link); accounts.append(help);
    draft.accounts.forEach((account, index) => {
      const card = node('div', undefined, 'connection-account'); const heading = node('div', undefined, 'section-heading tight');
      heading.append(node('h4', 'Account ' + (index + 1)), action('Remove account ' + (index + 1), async () => {
        if (!await confirm('Remove this account?', 'Save changes to disconnect this account from the plugin.', 'Remove account')) return;
        draft.accounts.splice(index, 1); changed(); render();
      }, 'button danger')); card.append(heading);
      const grid = node('div', undefined, 'form-grid');
      field(grid, 'Account name', account, 'name');
      field(grid, 'Account type', account, 'type', { choices: [['google', 'Google account'], ['nest', 'Nest account']], refresh: true });
      if (account.type === 'google') {
        account.authMethod ||= 'issueTokenCookie';
        field(grid, 'Google authentication method', account, 'authMethod', { choices: [['issueTokenCookie', 'Issue token & cookie'], ['refreshToken', 'Compatible legacy refresh token']], refresh: true });
        if (account.authMethod === 'refreshToken') field(grid, 'Google refresh token', account, 'refreshToken', { type: 'password', help: 'Requires a compatible existing token. This does not create a new Google sign-in flow.' });
        else { field(grid, 'Google issue token URL', account, 'issueToken', { type: 'password' }); field(grid, 'Google cookie', account, 'cookie', { type: 'password' }); }
      } else field(grid, 'Nest access token', account, 'access_token', { type: 'password' });
      card.append(grid); toggle(card, 'Exclude this account', account, 'exclude', 'Keep its configuration without connecting.');
      const advanced = node('details'); advanced.append(node('summary', 'Account options')); toggle(advanced, 'Use Nest field-test environment', account, 'fieldTest', 'Use only with an account enrolled in Nest field testing.'); card.append(advanced); accounts.append(card);
    });
    accounts.append(action('Add account', () => { draft.accounts.push({ name: '', type: 'google', authMethod: 'issueTokenCookie' }); changed(); render(); }));
    const web = node('section', undefined, 'panel connection-panel'); web.append(node('h3', 'Standalone web dashboard'), webLive);
    toggle(web, 'Enable standalone web dashboard', draft.webDashboard, 'enabled', 'Optional browser access outside Homebridge. Climate settings remain available here when this is off.', true);
    if (draft.webDashboard.enabled) {
      const grid = node('div', undefined, 'form-grid');
      field(grid, 'Web connection mode', draft.webDashboard, 'protocol', { choices: [['https', 'HTTPS · local certificates'], ['http', 'HTTP · trusted local network'], ['proxy', 'HTTPS · reverse proxy']], refresh: true });
      field(grid, 'Web port', draft.webDashboard, 'port', { type: 'number' });
      if (draft.webDashboard.protocol === 'proxy') field(grid, 'Public HTTPS origin', draft.webDashboard, 'publicOrigin', { help: 'For example https://climate.example.com. The backend listens on 127.0.0.1.' });
      else {
        field(grid, 'Listen address', draft.webDashboard, 'host'); field(grid, 'Browser hostname or IP', draft.webDashboard, 'displayHost');
        if (draft.webDashboard.protocol === 'https') { field(grid, 'TLS certificate file', draft.webDashboard, 'certificatePath', { help: 'Optional. Leave both TLS paths blank to generate a local certificate.' }); field(grid, 'TLS private key file', draft.webDashboard, 'keyPath'); }
        else web.append(node('p', 'HTTP sends login credentials and dashboard data without encryption. Use it only on a trusted local network.', 'callout warning'));
      }
      web.append(grid);
      const login = node('div', undefined, 'form-grid'); const loginDraft = { username, password };
      const nameInput = field(login, 'Web username', loginDraft, 'username'); nameInput.autocomplete = 'username'; nameInput.addEventListener('input', () => { username = nameInput.value; });
      const passwordInput = field(login, 'Web password', loginDraft, 'password', { type: 'password', help: accountStatus.accountConfigured ? 'Leave blank to keep the current web login. Enter a password to replace it and sign out existing sessions.' : 'Use 8–128 characters. This login is separate from Nest, Google and Homebridge.' }); passwordInput.autocomplete = 'new-password'; passwordInput.addEventListener('input', () => { password = passwordInput.value; });
      web.append(node('h4', accountStatus.accountConfigured ? 'Web login configured' : 'Create your web login'), login);
    }
    fields.append(accounts, web);
    const actions = node('div', undefined, 'connection-actions'); const save = node('button', busy ? 'Saving…' : 'Save changes', 'button primary'); save.type = 'submit';
    actions.append(save, action('Discard changes', async () => {
      if (dirty && !await confirm('Discard account changes?', 'Your unsaved account and web access edits will be discarded.', 'Discard changes')) return;
      await load();
    })); fields.append(actions); form.append(fields); form.addEventListener('submit', saveChanges); root.append(form);
    root.append(node('p', 'Account and web-server changes take effect after restarting Homebridge or this plugin’s child bridge.', 'small-note'));
  }
  async function load() {
    try {
      current = await host.loadSetup(); draft = setupDraft(current.blocks[0]); accountStatus = current.webAccount || {};
      username = accountStatus.username || 'admin'; password = ''; dirty = false;
      if (!current.configured && !draft.accounts.length) draft.accounts.push({ name: '', type: 'google', authMethod: 'issueTokenCookie' });
      say(''); webLive.replaceChildren(); render();
      const generation = ++loadGeneration;
      if (current.configured && host.webStatus) host.webStatus().then((status) => {
        if (generation !== loadGeneration || !status.available || !status.url) return;
        try {
          const url = new URL(status.url);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
          const link = node('a', 'Open climate dashboard ↗', 'button secondary'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          webLive.replaceChildren(link);
        } catch { /* Invalid runtime URLs are not displayed. */ }
      }).catch(() => { /* Account editing does not require a running bridge. */ });
    } catch { root.replaceChildren(node('p', 'Account settings could not be read. Refresh Homebridge and try again.', 'callout danger')); }
  }
  async function saveChanges(event) {
    event.preventDefault(); if (busy) return;
    let configurationSaved = false;
    try {
      validateSetup(draft);
      if (draft.webDashboard.enabled && accountStatus.accountConfigured && username !== accountStatus.username && !password) throw new Error('Enter a password to change the web login.');
      const credentials = draft.webDashboard.enabled && (password || !accountStatus.accountConfigured);
      if (credentials && (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username) || password.length < 8 || password.length > 128)) throw new Error('Use a web username of 1–64 letters, numbers, dots, dashes or underscores, and a password of 8–128 characters.');
      busy = true; render();
      current = await host.saveSetup(draft, current.revision); configurationSaved = true;
      if (credentials) await host.saveWebAccount({ username, password, revision: current.revision });
      password = ''; dirty = false; await saved(); await load();
      say('Saved. Restart Homebridge or this plugin’s child bridge to connect with these settings.');
    } catch (error) { say((configurationSaved ? 'Connection settings were saved. Web login setup still needs attention. ' : '') + error.message); }
    finally { busy = false; if (current) render(); }
  }
  return { load, hasEdits: () => dirty || busy };
}
