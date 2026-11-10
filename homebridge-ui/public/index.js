import { applySetup, configuredAccounts } from './connection-config.js';
const hb = window.homebridge;
const $ = (id) => document.getElementById(id);
let climate;
hb.hideSchemaForm(); hb.disableSaveButton();

const loadSetup = async () => {
  const current = await hb.request('/plugin-config');
  const configured = configuredAccounts(current.blocks);
  let webAccount = { accountConfigured: false, username: 'admin' };
  try { webAccount = await hb.request('/setup/account-status'); } catch { /* Account setup remains available if the optional web login cannot be read. */ }
  return { ...current, configured, webAccount };
};
window.climateHost = {
  initialConfigured: false,
  connect(controls) { climate = controls; },
  loadSetup,
  webStatus: () => hb.request('/web/status'),
  async saveSetup(draft, revision) {
    if (climate?.hasEdits()) throw new Error('Save or discard your climate edits before saving account settings.');
    const current = await hb.request('/plugin-config');
    if (current.revision !== revision) throw new Error('Configuration changed elsewhere. Your edits remain visible. Discard them to load the latest settings before saving.');
    await hb.updatePluginConfig(applySetup(current.blocks, draft));
    await hb.savePluginConfig();
    const result = await loadSetup();
    window.climateHost.initialConfigured = result.configured;
    return result;
  },
  saveWebAccount: (payload) => hb.request('/setup/web-account', payload),
  async request(route, { method = 'GET', body } = {}) {
    if (route === '/session') {
      let status;
      if (window.climateHost.initialConfigured) try { status = await hb.request('/web/status'); } catch { /* The overview can show a temporarily unavailable bridge. */ }
      return { authenticated: true, username: 'Homebridge', instanceId: status?.instanceId };
    }
    try { return await hb.request('/climate', { route, method, ...(body === undefined ? {} : { body }) }); }
    catch (error) {
      const failure = new Error(error.message || 'The Nest bridge is unavailable.');
      failure.status = error.error?.status ?? error.status; throw failure;
    }
  },
};
$('setup-fallback').addEventListener('click', async () => {
  try {
    const current = await hb.request('/plugin-config');
    await hb.updatePluginConfig(current.blocks.length ? current.blocks : [{ platform: 'NestClimateCntrl', name: 'Nest Climate Cntrl' }]);
    hb.showSchemaForm(); hb.enableSaveButton();
  } catch { $('host-notice').textContent = 'Connection settings could not be read. Refresh Homebridge and try again.'; }
});
try {
  const current = await loadSetup(); window.climateHost.initialConfigured = current.configured;
  // Startup routing depends on saved credentials, never on transient runtime availability.
  history.replaceState(null, '', current.configured ? '#overview' : '#accounts');
  const { default: markup } = await import('./climate/markup.js');
  const documentSource = new DOMParser().parseFromString(markup, 'text/html');
  for (const image of documentSource.body.querySelectorAll('img[src]')) image.src = new URL('./climate/' + image.getAttribute('src').replace(/^\//, ''), import.meta.url).href;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./climate/styles.css', import.meta.url).href;
  document.head.append(css); $('climate-mount').replaceChildren(...documentSource.body.childNodes);
  await import('./climate/app.js');
} catch {
  $('climate-mount').replaceChildren(); $('setup-failure').hidden = false;
  $('host-notice').textContent = 'Climate controls could not load. Close and reopen plugin Settings, or refresh Homebridge. Account setup remains available below.';
}
