import { setupDraft, validateSetup } from './connection-config.js';

export function mountConnectionPage(root, { host, confirm }) {
  let current; let draft; let dirty = false; let busy = false;
  let username = 'admin'; let password = ''; let accountStatus = {}; let loadGeneration = 0; let stageGeneration = 0;
  const node = (tag, text, className) => {
    const item = document.createElement(tag); if (text !== undefined) item.textContent = text;
    if (className) item.className = className; return item;
  };
  const message = node('p', '', 'callout'); message.hidden = true; message.setAttribute('role', 'status');
  const say = (text) => { message.textContent = text; message.hidden = !text; };
  const webLive = node('div', undefined, 'connection-web-status');
  const loginNeedsSave = () => draft.webDashboard.enabled && (Boolean(password) || !accountStatus.accountConfigured || username !== accountStatus.username);
  async function stage() {
    const generation = ++stageGeneration;
    host.invalidateDraft('accounts');
    try {
      validateSetup(draft);
      if (loginNeedsSave()) throw new Error('Save your web login here, then use Homebridge’s Save button at the bottom to save the connection settings.');
      const result = await host.stageSetup(structuredClone(draft), current.revision);
      if (result && generation === stageGeneration) say('Use Homebridge’s Save button at the bottom of this window, then follow its restart prompt. Your connection changes have not been saved yet.');
    } catch (error) { if (generation === stageGeneration) say(error.message); }
  }
  const changed = () => {
    dirty = true; stageGeneration++; host.invalidateDraft('accounts'); say('Checking connection settings…');
    queueMicrotask(() => { const button = root.querySelector('[type="submit"]'); if (button) button.hidden = !loginNeedsSave(); stage(); });
  };
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
    const wrapper = node('label', undefined, 'toggle-row connection-toggle'); const input = node('input'); input.type = 'checkbox'; input.checked = object[key] === true;
    input.setAttribute('role', 'switch'); input.setAttribute('aria-label', label);
    input.addEventListener('change', () => { object[key] = input.checked; changed(); if (refresh) render(); });
    const copy = node('span'); copy.append(node('strong', label)); if (help) copy.append(node('small', help)); wrapper.append(copy, input); parent.append(wrapper);
  }
  function action(label, callback, className = 'button secondary') {
    const button = node('button', label, className); button.type = 'button'; button.addEventListener('click', callback); return button;
  }
  function render() {
    root.replaceChildren();
    const intro = node('div', undefined, 'section-heading'); const copy = node('div');
    copy.append(node('h2', current.configured ? 'Your connections' : 'Connect your home'), node('p', current.configured ? 'Manage your Nest or Google accounts and optional web access.' : 'Connect a Nest or Google account to get started. Homebridge Settings works with standalone web access off.'));
    intro.append(copy); root.append(intro, message);
    const form = node('form'); form.id = 'connection-form'; const fields = node('fieldset', undefined, 'connection-fields'); fields.disabled = busy;
    const accounts = node('section', undefined, 'panel connection-panel'); accounts.append(node('h3', 'Nest & Google accounts'));
    const help = node('p', 'Use an existing Nest or Google authentication token. ', 'small-note');
    const link = node('a', 'Credential setup instructions'); link.href = 'https://github.com/pponce/homebridge-nest-climate-cntrl/blob/main/AUTHENTICATION.md'; link.target = '_blank'; link.rel = 'noopener noreferrer'; help.append(link); accounts.append(help);
    draft.accounts.forEach((account, index) => {
      const card = node('div', undefined, 'connection-account'); const heading = node('div', undefined, 'section-heading tight');
      heading.append(node('h4', 'Account ' + (index + 1)), action('Remove account ' + (index + 1), async () => {
        if (!await confirm('Remove this account?', 'Use Homebridge’s Save button to disconnect this account from the plugin.', 'Remove account')) return;
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
    const actions = node('div', undefined, 'connection-actions'); const save = node('button', busy ? 'Saving web login…' : 'Save web login', 'button primary'); save.type = 'submit'; save.hidden = !loginNeedsSave();
    actions.append(save, action('Discard changes', async () => {
      if (dirty && !await confirm('Discard account changes?', 'Your unsaved account and web access edits will be discarded.', 'Discard changes')) return;
      await load();
    })); fields.append(actions); form.append(fields); form.addEventListener('submit', saveChanges); root.append(form);
    root.append(node('p', 'Save account and web-server changes with Homebridge’s Save button at the bottom of this window. Homebridge will offer the appropriate restart. The web login is saved separately and does not start the web server.', 'small-note'));
  }
  async function load() {
    try {
      stageGeneration++; await host.clearDraft('accounts');
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
    try {
      validateSetup(draft);
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username) || password.length < 8 || password.length > 128) throw new Error('Use a web username of 1–64 letters, numbers, dots, dashes or underscores, and a password of 8–128 characters.');
      busy = true; host.invalidateDraft('accounts'); render();
      await host.saveWebAccount({ username, password, revision: current.revision, draft });
      accountStatus = { accountConfigured: true, username }; password = ''; dirty = true;
      await stage();
    } catch (error) { say(error.message); }
    finally { busy = false; if (current) render(); }
  }
  const controls = { load, hasEdits: () => dirty || busy, restage: stage };
  host.connectSetup(controls);
  return controls;
}
