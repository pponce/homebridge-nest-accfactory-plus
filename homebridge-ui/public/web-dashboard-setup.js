// Web account provisioning stays in authenticated Homebridge Settings.
export function mountWebDashboardSetup({ host, homebridge, getConfig, changed }) {
  let live;
  let statusText;
  let openLink;
  let username;
  let password;
  let accountButton;
  let message;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) {
      node.textContent = text;
    }
    if (className) {
      node.className = className;
    }
    return node;
  };
  const settings = () => getConfig()?.webDashboard ?? {};
  const update = (key, value) => {
    const config = getConfig();
    config.webDashboard = { ...(config.webDashboard ?? {}), [key]: value };
    changed();
  };
  function input(parent, title, value, options = {}) {
    const label = el('label', title);
    const control = el('input');
    control.type = options.type ?? 'text';
    control.value = value ?? '';
    for (const [key, item] of Object.entries(options)) {
      control[key] = item;
    }
    label.append(control);
    parent.append(label);
    return control;
  }
  function showStatus() {
    if (!statusText) {
      return;
    }
    statusText.textContent = live?.available ? 'Web dashboard ready' : live?.enabled ? 'Waiting for web server' : 'Web dashboard off';
    statusText.className = 'pill' + (live?.enabled && !live.available ? ' warn' : '');
    openLink.hidden = true;
    if (live?.available && typeof live.url === 'string') {
      try {
        const url = new URL(live.url);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          openLink.href = url.href;
          openLink.hidden = false;
        }
      } catch {
        /* A malformed link is never opened. */
      }
    }
    accountButton.textContent = live?.accountConfigured ? 'Update web login' : 'Create web login';
    if (!username.value && live?.username) {
      username.value = live.username;
    }
  }
  async function refresh() {
    if (!statusText) {
      return;
    }
    try {
      live = await homebridge.request('/web/status');
      accountButton.disabled = false;
      showStatus();
      message.textContent =
        live?.error ||
        (live?.accountConfigured
          ? 'Your web login is configured. Updating it signs out current web sessions.'
          : 'Create a web login here, then enable the dashboard and save in Homebridge.');
    } catch {
      live = undefined;
      accountButton.disabled = true;
      statusText.textContent = 'Nest bridge unavailable';
      statusText.className = 'pill warn';
      openLink.hidden = true;
      message.textContent =
        'Start or restart the Nest bridge to create your web login. You can still edit and save the web server settings.';
    }
  }
  function render() {
    host.replaceChildren();
    const heading = el('div', undefined, 'heading');
    const intro = el('div');
    intro.append(
      el('h2', 'Standalone dashboard'),
      el('p', 'A dedicated web address for your home’s climate, sensors, and rule drafts. Works on your computer or phone.'),
    );
    statusText = el('span', 'Checking web access…', 'pill');
    statusText.setAttribute('role', 'status');
    heading.append(intro, statusText);
    host.append(heading);
    const enable = el('label', undefined, 'check');
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = settings().enabled === true;
    toggle.onchange = () => update('enabled', toggle.checked);
    enable.append(toggle, document.createTextNode('Enable standalone dashboard'));
    host.append(enable, el('p', 'Save with Homebridge’s Save button and restart the Nest bridge to apply network settings.', 'help'));
    const httpWarning = el(
      'p',
      'HTTP sends passwords and dashboard data unencrypted. Use only on a trusted local network.',
      'notice',
    );
    httpWarning.setAttribute('role', 'note');
    httpWarning.hidden = settings().protocol !== 'http';
    host.append(httpWarning);
    const grid = el('div', undefined, 'grid');
    username = input(grid, 'Web username', live?.username ?? 'admin', { autocomplete: 'username', maxLength: 64 });
    password = input(grid, 'Web password', '', { type: 'password', autocomplete: 'new-password', minLength: 8, maxLength: 128 });
    host.append(
      grid,
      el(
        'p',
        'Use at least 8 characters. This separate web login is stored privately; it is not your Google or Homebridge password.',
        'help',
      ),
    );
    const actions = el('div', undefined, 'actions');
    accountButton = el('button', 'Create web login');
    accountButton.type = 'button';
    accountButton.disabled = true;
    accountButton.onclick = async () => {
      if (!username.value.trim() || password.value.length < 8) {
        message.textContent = 'Enter a username and a password with at least 8 characters.';
        return;
      }
      accountButton.disabled = true;
      try {
        await homebridge.request('/web/account', { username: username.value.trim(), password: password.value });
        password.value = '';
        await refresh();
        message.textContent = 'Web login saved. Enable the dashboard, save configuration, and restart the Nest bridge if needed.';
      } catch (error) {
        message.textContent = error?.message || 'Web login could not be saved. Try again after refreshing the bridge.';
      } finally {
        accountButton.disabled = false;
      }
    };
    const refreshButton = el('button', 'Refresh web access');
    refreshButton.type = 'button';
    refreshButton.onclick = refresh;
    openLink = el('a', 'Open climate dashboard ↗', 'button-link');
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.hidden = true;
    actions.append(accountButton, refreshButton, openLink);
    message = el('p', '', 'help');
    message.setAttribute('role', 'status');
    host.append(actions, message);
    const advanced = el('details');
    advanced.append(el('summary', 'Network and connection settings'));
    const network = el('div', undefined, 'grid');
    const protocolLabel = el('label', 'Connection mode');
    const protocol = el('select');
    protocol.setAttribute('aria-label', 'Connection mode');
    for (const [value, text] of [['https', 'HTTPS · certificates in plugin'], ['http', 'HTTP · unencrypted'], ['proxy', 'HTTPS through reverse proxy']]) {
      const option = el('option', text);
      option.value = value;
      protocol.append(option);
    }
    protocol.value = ['http', 'proxy'].includes(settings().protocol) ? settings().protocol : 'https';
    protocolLabel.append(protocol);
    network.append(protocolLabel);
    const publicOrigin = input(network, 'Public HTTPS origin', settings().publicOrigin, {
      type: 'url', placeholder: 'https://climate.example.com',
    });
    publicOrigin.onchange = () => update('publicOrigin', publicOrigin.value.trim());
    const bind = input(network, 'Listen address', settings().host ?? '0.0.0.0', { placeholder: '0.0.0.0' });
    bind.onchange = () => update('host', bind.value.trim());
    const port = input(network, 'Web port', settings().port ?? 9444, { type: 'number', min: 1024, max: 65535 });
    port.onchange = () => {
      if (port.checkValidity()) {
        update('port', Number(port.value));
      } else {
        port.reportValidity();
      }
    };
    const displayHost = input(network, 'Address shown in dashboard links', settings().displayHost, {
      placeholder: 'Optional hostname or IP address',
    });
    displayHost.onchange = () => update('displayHost', displayHost.value.trim());
    const certificate = input(network, 'TLS certificate path', settings().certificatePath, { placeholder: 'Optional PEM file' });
    certificate.onchange = () => update('certificatePath', certificate.value.trim());
    const key = input(network, 'TLS private key path', settings().keyPath, { placeholder: 'Optional PEM file' });
    key.onchange = () => update('keyPath', key.value.trim());
    const connectionHelp = el(
      'p',
      'For HTTPS, leave both certificate paths empty to create a local certificate, or supply your full-chain PEM and matching private key. Homebridge must be able to read both files. Restart the Nest bridge after changing or renewing certificates.',
      'help',
    );
    const proxyHelp = el(
      'p',
      'Run Nginx or another proxy on the same machine. The plugin listens over HTTP at 127.0.0.1 on the web port. The proxy handles the HTTPS certificate and HTTP-to-HTTPS redirect, and must preserve the public Host header. Enter the browser’s HTTPS origin without a path. No certificate files are needed in the plugin.',
      'help',
    );
    const showProtocol = () => {
      const plain = protocol.value === 'http';
      const proxy = protocol.value === 'proxy';
      httpWarning.hidden = !plain;
      certificate.disabled = plain || proxy;
      key.disabled = plain || proxy;
      certificate.parentElement.hidden = proxy;
      key.parentElement.hidden = proxy;
      displayHost.parentElement.hidden = proxy;
      displayHost.disabled = proxy;
      bind.value = proxy ? '127.0.0.1' : settings().host ?? '0.0.0.0';
      bind.disabled = proxy;
      publicOrigin.parentElement.hidden = !proxy;
      publicOrigin.disabled = !proxy;
      publicOrigin.required = proxy;
      connectionHelp.hidden = plain || proxy;
      proxyHelp.hidden = !proxy;
    };
    protocol.onchange = () => {
      update('protocol', protocol.value);
      showProtocol();
    };
    showProtocol();
    advanced.append(
      network,
      connectionHelp,
      proxyHelp,
    );
    host.append(advanced, el('p', 'On iPhone, open the dashboard in Safari and choose Share → Add to Home Screen.', 'help'));
    showStatus();
  }
  return { render, refresh };
}
