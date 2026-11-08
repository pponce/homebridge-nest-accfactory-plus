# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address using direct HTTP, direct HTTPS, or HTTPS through a local reverse proxy. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and organize climate rule drafts.

The dashboard is under beta testing. Automatic room-temperature control, room-fan actions, and combined occupancy rules are not enabled by saving a draft.

Start with [web access](#enable-web-access), then try a [temperature group](#temperature-group-example), [room-fan rule](#room-fan-example), or [Home/Away rule](#homeaway-example). For a proxy deployment, see [HTTPS through a reverse proxy](#https-through-a-reverse-proxy).

## Admin interface at a glance

The standalone dashboard provides a visual interface for daily use and supported configuration:

| Area | What to use it for |
| --- | --- |
| **Overview** | Check temperatures, targets, heating/cooling activity and account connectivity. Use supported native Nest controls and inspect schedules and observed runtime. |
| **Sensors & fans** | Discover configured Homebridge main and child bridges. Search and filter temperature, motion, occupancy and fan sources; inspect their readings and availability. |
| **Climate rules** | Build named temperature groups, Home/Away rules and room-fan rules with source pickers and current-signal previews. All rules remain inactive drafts. |
| **Settings** | Change the dashboard name and supported accessory options. Save changes with account credentials and bridge identity preserved; the dashboard identifies options requiring a restart. |

Use **Homebridge → Plugins → Nest Climate Cntrl → Settings** for Google/Nest account setup and web login, certificate and network settings. Its **Room sensors & fans** section also offers a read-only temperature preview. Named rule drafts are managed in the standalone dashboard's **Climate rules** area.

Both interfaces use visual controls rather than requiring hand-edited JSON. The standalone dashboard adapts to desktop and phone screens and can be [added to an iPhone or iPad Home Screen](#add-to-your-phone).

## Enable web access

1. Open **Homebridge → Plugins → Nest Climate Cntrl → Settings → Web dashboard**. The Nest bridge must be running.
2. Create a **web username and password**. Use at least 8 characters for the password. This account is separate from your Google and Homebridge accounts.
3. Select **Enable standalone dashboard**. Save with Homebridge's **Save** button and restart the Nest child bridge.
4. Select **Refresh web access**, then **Open climate dashboard**. The default HTTPS port is **9444**.

The web server is off by default. Under **Network and connection settings → Connection mode**, choose how browsers reach it:

| Connection mode | Browser connection | Certificate owner | Backend |
| --- | --- | --- | --- |
| HTTP · unencrypted | `http://<host>:9444` | None | HTTP on the selected listen address |
| HTTPS · certificates in plugin (default) | `https://<host>:9444` | Plugin uses supplied PEM files or generates a local certificate | HTTPS on the selected listen address |
| HTTPS through reverse proxy | Your public HTTPS origin, such as `https://climate.example.com` | Nginx or another proxy on the same machine | HTTP at `127.0.0.1:9444` only |

Save and restart the Nest child bridge after changing network settings. All three modes require the separate web login. The web port is configurable from 1024–65535.

## Try your first rules

You can test **discovery, current readings, condition previews, and saving/reopening drafts**. Automatic thermostat adjustments, room-fan switching and combined Home/Away execution are not available in this version. There is no activation switch for these drafts, and a restart does not activate them.

### Find your sources

1. Sign in to the standalone dashboard and open **Sensors & fans**.
2. Select **Discover sources**. Associated Nest devices appear as the Nest account connects; discovery adds compatible services from configured Homebridge main and child bridges.
3. Check **Bridge connections & source availability** if a source is missing. Homebridge accessory control (`-I`) must be enabled on the source bridge, and that bridge must be reachable with its configured credentials.
4. Search for the rooms you want to include. The **Temperature**, **Presence** and **Fans** filters help you inspect each type.

Third-party devices must expose a compatible temperature, motion, occupancy or fan service through Homebridge. Devices available only in Apple Home are not discoverable here. A fan needs a writable standard on/off control to be eligible for the rule preview; a generic switch is not automatically treated as a fan.

Discovery records when a value was read, which may differ from when the sensor measured it. Refresh discovery when external readings become stale. A missing or stale selected source requires attention; it is not silently dropped from a group or treated as evidence that nobody is home.

### Temperature group example

**Goal:** plan a comfortable downstairs area using more than one room's temperature.

1. Open **Climate rules → Temperature**. Select **Create temperature group**, or the **+** button if a draft already exists.
2. Name it **Downstairs comfort** and select the Nest thermostat serving those rooms.
3. Enter **21** in **Desired room temperature (°C)**. Rule temperature inputs use Celsius; 21 °C is 69.8 °F.
4. Choose **Equal average of selected sensors** under **Combine readings**.
5. Select two or more temperature inputs. You can use associated Nest sensors, other Homebridge temperature sensors, or a mix. For example, a Nest living-room sensor at **20 °C** and a Homebridge dining-room sensor at **22 °C** give a group average of **21 °C**. Choose **One selected sensor** and select exactly one input if only one room should be considered.
6. Inspect **Current signals · preview only**, then select **Save changes**. Reload the page and confirm that the group name, selected sensors and desired temperature were saved.

The desired temperature is a draft goal; saving it does **not** set the thermostat target or activate a controller. A group describes the rooms to consider together and does not create an independent physical HVAC zone. Third-party sensors remain Homebridge sources; they are not paired to the thermostat as native Nest sensors.

The temperature average can be shown even when the illustrative control estimate is paused. That estimate currently requires a connected thermostat in **Heat** mode, with **Eco off** and its built-in sensor confirmed as the active temperature source. It is an estimate only, not a validated control algorithm. You do not need to change a working thermostat configuration just to save the group and inspect its average.

For live native sensor selection, use the thermostat's **Temperature controlled by** control on **Overview**, where supported. This chooses a single associated Nest sensor; it does not activate the multi-sensor draft.

### Room-fan example

**Goal:** plan when a Homebridge-exposed ceiling or room fan would run as a room warms up.

1. Discover the fan under **Sensors & fans**. Confirm that it is available and exposes standard on/off control.
2. Open **Climate rules → Room fans** and select **Create fan rule** or **+**.
3. Name it **Living room cooling** and select the ceiling or room fan under **Choose your room fans**.
4. Choose **Temperature above threshold** for **Run condition**. Enter **24** for **Above temperature (°C)** and **1** for **Turn-off gap (°C)**.
5. Select the temperature sensors for that room. Multiple selected readings are averaged. To consider the same rooms as your temperature group, select the same sources here; the fan draft has its own source selection.
6. Inspect the preview. An average of **25 °C** meets the **above 24 °C** condition; **23 °C** does not. To test both results without changing the room, temporarily place the threshold below and then above the displayed average. No fan command is sent. Restore your intended threshold and select **Save changes**.

The turn-off gap expresses the intended separation between starting and stopping a fan to avoid rapid switching. It is saved but not simulated by the current snapshot preview. Fan speed and direction are not configured by this rule editor.

For a different use case, choose **Thermostat is heating** or **Thermostat is cooling**, then select the thermostat. The preview checks its reported activity, such as whether a circulation fan's run condition would be met during heating. These rules also remain inactive.

**Nest HVAC fan timers are a separate live feature.** Where the thermostat supports a blower, its controls on **Overview** can run that blower immediately for a chosen duration. They do not operate the third-party room fans selected in these drafts.

### Home/Away example

**Goal:** consider activity from several parts of the home when planning a presence rule.

1. Open **Climate rules → Home & away** and select **Create presence rule** or **+**.
2. Name it **Home presence**. Select the available **Nest Home/Away** input, a hallway **motion** sensor and an office **occupancy** sensor. Nest Home/Away appears when the plugin has its state; other sensors must be exposed through Homebridge.
3. Set **Consider home when** to **Any selected source is positive**. For example, office occupancy can satisfy the preview's Home condition even when hallway motion is clear. **All selected sources are positive** requires every selected input to be positive at the same time.
4. Enter **10** for **Motion hold (minutes)** and **20** for **Delay before Away (minutes)** to record your intended timing.
5. Inspect the current positive-source count and Home condition, then select **Save changes**. To check another snapshot, trigger a selected motion sensor and refresh **Discover sources**.

The preview evaluates current readings only. It does not keep motion positive for the saved hold or wait out the Away delay. Unavailable readings cannot establish an Away condition.

This draft does not change Google's Home/Away state, activate Eco, or expose a new combined HomeKit occupancy accessory. Native Nest Home/Away remains separate. The combined rule is preparation for future automation.

## HTTP mode

HTTPS is the default. Under **Network and connection settings → Connection mode**, choose **HTTP · unencrypted**, save and restart the Nest bridge. The port remains configurable; the default is 9444. Open `http://<homebridge-host>:9444`.

**HTTP sends passwords and dashboard data unencrypted. Use it only on a trusted local network.** This warning appears in setup, before sign-in, in the dashboard and in the startup log. HTTP still requires the web login and validates browser origins and changes. It does not generate or read TLS certificates. Certificate paths stay saved for switching back to HTTPS.

## Use a hostname and trusted certificate

1. Point your internal DNS hostname, such as `climate.example.com`, to the Homebridge host's LAN address.
2. Keep **Connection mode** set to **HTTPS**. Keep **Listen address** at `0.0.0.0` or select the host's LAN IP. Keep **Web port** at `9444` unless that port is already in use.
3. Set **Address shown in dashboard links** to the hostname only, without `https://`, a port or a path.
4. Set **TLS certificate path** to the full-chain PEM file (server certificate followed by its intermediate certificates). Set **TLS private key path** to the matching PEM private-key file. The files must exist on the Homebridge host and be readable by its service user; keep the private key restricted.
5. Save, restart the Nest child bridge and open `https://climate.example.com:9444`. Use the hostname covered by the certificate, rather than its IP address. A trusted, valid certificate covering the hostname avoids the certificate warning.

A wildcard certificate for `*.example.com` can cover `climate.example.com`. Restart the Nest child bridge after replacing or renewing certificate files; the listener reads them at startup.

For an IPv6 connection to the dashboard, set **Listen address** to `::`, save and restart the Nest bridge. The default `0.0.0.0` listens on IPv4 only. On systems with dual-stack support, `::` accepts IPv4 as well. Keep the hostname under **Address shown in dashboard links**. IPv6 addresses in a proxy URL need brackets, for example `https://[::1]:9444` for a proxy running on the same host.

## HTTPS through a reverse proxy

Choose this mode when Nginx or another reverse proxy runs on the **same machine** as Homebridge and should own the certificate and HTTP-to-HTTPS redirect.

1. Point the public DNS name to the proxy host's LAN IPv4 and/or IPv6 addresses. Do not point DNS to `127.0.0.1`.
2. In Homebridge's web dashboard settings, choose **HTTPS through reverse proxy**.
3. Set **Public HTTPS origin** to the browser address, such as `https://climate.example.com`. Do not add a path, query, credentials, or the internal backend port. Include a public port only if the proxy actually serves HTTPS on a nonstandard port.
4. Keep **Web port** at `9444`, or choose another unused port. The plugin automatically binds to **`127.0.0.1`**, regardless of a saved direct-mode listen address. The setup UI displays this fixed address.
5. No certificate or private-key paths are needed in the plugin. Any saved paths are ignored in this mode; no certificate is generated or read.
6. Configure the proxy backend as **HTTP to `127.0.0.1:9444`** and preserve the browser's **Host** and **Origin** headers. Keep TLS certificates and the HTTP-to-HTTPS redirect at the proxy.
7. Save, restart the Nest child bridge, apply the proxy configuration, and open the public HTTPS address. **Open climate dashboard** uses that address without the internal backend port.

The relevant Nginx configuration for a hostname on port 443 is:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name climate.example.com;
    return 301 https://climate.example.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name climate.example.com;
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9444;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For an existing Nginx site, keep its port-80 redirect and port-443 certificate configuration and change the backend settings. Use the service editor if another application manages the Nginx file. Validate with `sudo nginx -t` before reloading Nginx. Nginx can accept IPv4 and IPv6 clients while using this IPv4 loopback backend. No IPv6 or LAN-address fallback backend is needed.

Only loopback requests with the configured public Host are accepted. Mutations also require the exact public HTTPS Origin and, after sign-in, the session's CSRF token. Cookies remain `Secure`, `HttpOnly`, and `SameSite=Strict`. `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` do not override the configured origin or socket peer. Login throttling is shared by requests through the local proxy. This mode supports a dedicated origin, not a URL subpath, a remote proxy, or a proxy in a separate container network.

If the proxy returns **502**, confirm that the Nest bridge has restarted, the backend is HTTP rather than HTTPS, and the port matches. If the dashboard returns **403**, check the public origin and preserved Host header. Direct access to a LAN IP on port 9444 is unavailable in this mode.

For direct HTTPS without supplying certificates, the plugin generates a local self-signed certificate using OpenSSL. Browsers need to trust it before signing in. A proxy can also forward to the direct HTTPS listener with a trusted backend certificate and preserved public Host; select direct HTTPS for that arrangement.

## Live actions and observations

Live thermostat action buttons send a command immediately. A successful request means the API accepted the command; the displayed state changes after the thermostat reports it.

An **HVAC fan** is the blower connected to Nest. A **room fan** is a separate fan exposed by another Homebridge plugin. Draft room-fan rules do not control that fan. Accessories available only in Apple Home cannot be discovered automatically by this dashboard.

Runtime totals reflect periods observed by the plugin. Gaps are unknown, and runtime is not an energy-consumption measurement.

## Saving settings

Review your changes and select **Save**. Configuration changes are written to the existing Nest Climate Cntrl entry; account credentials, child-bridge identity, and unrelated plugin settings are retained. The dashboard identifies settings that need a child-bridge restart. Draft rules remain drafts after saving or restarting.

If another settings page saves while you are editing, the dashboard asks you to reload instead of overwriting the newer configuration. Copy any unsaved choices you want to keep, reload, and apply them to the latest settings.

Use Homebridge's plugin settings for account credentials and the web server's network settings. Web sessions expire and are cleared when the Nest bridge restarts. To replace a forgotten web password, create a replacement login from the authenticated Homebridge settings page; existing web sessions are signed out.

Each child bridge has its own web account and, when using direct HTTPS, its own certificate settings. If you enable dashboards for multiple Nest child bridges, assign a different port to each one.

## Add to your phone

On iPhone or iPad, open the dashboard in Safari, select **Share → Add to Home Screen**, and choose **Add**. The plum climate icon and app name are supplied automatically. The dashboard opens in a compact app layout and adapts to narrow screens.

Keep the Homebridge host reachable while using it. The dashboard does not cache account data or provide offline climate control.
