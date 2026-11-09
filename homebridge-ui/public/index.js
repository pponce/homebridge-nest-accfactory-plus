import { editableConfig } from './climate-utils.js';
// Homebridge hosts the shared climate application through its authenticated UI server.
const hb = window.homebridge;
const $ = (id) => document.getElementById(id);
let climate;
let setupOpen = false;
let setupRevision;
const notice = (message = '') => { $('host-notice').textContent = message; $('host-notice').hidden = !message; };
hb.disableSaveButton();

window.climateHost = {
  connect(controls) { climate = controls; },
  async request(route, { method = 'GET', body } = {}) {
    if (route === '/session') {
      let status;
      try { status = await hb.request('/web/status'); } catch { /* Connection setup remains usable offline. */ }
      return { authenticated: true, username: 'Homebridge', instanceId: status?.instanceId };
    }
    try {
      return await hb.request('/climate', { route, method, ...(body === undefined ? {} : { body }) });
    } catch (error) {
      const failure = new Error(error.message || 'The Nest bridge is unavailable.');
      failure.status = error.error?.status ?? error.status;
      throw failure;
    }
  },
};

$('connection-setup').addEventListener('click', async () => {
  if (climate?.hasEdits()) { notice('Save or discard your climate edits before opening connection setup.'); return; }
  try {
    const current = await hb.request('/plugin-config');
    setupRevision = current.revision;
    await hb.updatePluginConfig(current.blocks.length ? current.blocks.map(editableConfig) : [{ platform: 'NestClimateCntrl', name: 'Nest Climate Cntrl' }]);
    setupOpen = true; $('connection-panel').hidden = false; $('climate-mount').hidden = true;
    hb.showSchemaForm(); hb.enableSaveButton(); notice();
    try {
      const status = await hb.request('/web/status');
      $('web-account-username').value = status.username || 'admin';
      $('web-account-result').textContent = status.accountConfigured ? 'Web login configured.' : 'Create a web login to use the standalone dashboard.';
    } catch { $('web-account-result').textContent = 'Start the Nest bridge before creating its web login.'; }
  } catch (error) { notice(error.message || 'Connection settings could not be loaded.'); }
});
$('return-to-climate').addEventListener('click', async () => {
  try {
    const current = await hb.request('/plugin-config');
    await hb.updatePluginConfig(current.blocks.map(editableConfig));
    hb.hideSchemaForm(); hb.disableSaveButton(); setupOpen = false;
    $('connection-panel').hidden = true; $('climate-mount').hidden = false;
    $('web-account-password').value = ''; notice(); await climate?.reload();
  } catch (error) { notice(error.message || 'Could not reload saved configuration.'); }
});
$('web-account-save').addEventListener('click', async () => {
  const username = $('web-account-username'); const password = $('web-account-password');
  if (!username.value.trim() || password.value.length < 8) {
    $('web-account-result').textContent = 'Enter a username and a password of at least 8 characters.'; return;
  }
  $('web-account-save').disabled = true;
  try {
    await hb.request('/web/account', { username: username.value.trim(), password: password.value });
    password.value = ''; $('web-account-result').textContent = 'Web login saved. Existing web sessions were signed out.';
  } catch (error) { $('web-account-result').textContent = error.message || 'Web login could not be saved.'; }
  finally { $('web-account-save').disabled = false; }
});
setInterval(async () => {
  if (!setupOpen || document.hidden) return;
  try {
    const current = await hb.request('/plugin-config');
    if (current.revision !== setupRevision) {
      hb.disableSaveButton(); notice('Configuration changed elsewhere. Your form edits are still visible. Return to climate controls and reopen setup to load the latest configuration before saving.');
    }
  } catch { hb.disableSaveButton(); notice('Could not verify the current configuration. Reopen connection setup before saving.'); }
}, 4000);

try {
  const source = await fetch(new URL('./climate/index.html', import.meta.url));
  if (!source.ok) throw new Error('The packaged climate interface is missing. Reinstall the plugin package.');
  const documentSource = new DOMParser().parseFromString(await source.text(), 'text/html');
  for (const image of documentSource.body.querySelectorAll('img[src]')) {
    image.src = new URL('./climate/' + image.getAttribute('src').replace(/^\//, ''), import.meta.url).href;
  }
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./climate/styles.css', import.meta.url).href;
  document.head.append(css);
  $('climate-mount').replaceChildren(...documentSource.body.childNodes);
  await import('./climate/app.js');
} catch (error) {
  $('climate-mount').replaceChildren(); notice(error.message || 'Climate controls could not load. Connection setup remains available.');
}
