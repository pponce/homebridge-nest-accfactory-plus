# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address using direct HTTP, direct HTTPS, or HTTPS through a local reverse proxy. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and run climate automation rules.

The dashboard and execution engine are under beta testing. Each rule is disabled by default. Enable and save individual rules to run bounded heating control, room-fan actions or combined occupancy sensing.

Start with [web access](#enable-web-access), then try a [temperature group](#temperature-group-example), [room-fan rule](#room-fan-example), or [Home/Away rule](#homeaway-example). For a proxy deployment, see [HTTPS through a reverse proxy](#https-through-a-reverse-proxy).

## Admin interface at a glance

The standalone dashboard provides a visual interface for daily use and supported configuration:

| Area | What to use it for |
| --- | --- |
| **Overview** | Check temperatures, targets, heating/cooling activity and account connectivity. Use supported native Nest controls and inspect schedules and observed runtime. |
| **Sensors & fans** | Discover configured Homebridge main and child bridges. Search and filter temperature, motion, occupancy and fan sources; inspect their readings and availability. |
| **Climate rules** | Build named temperature groups, Home/Away rules and room-fan rules with source pickers and current-signal previews. Enable selected rules and inspect their live execution status, timers and pause/resume controls. |
| **Settings** | Change the dashboard name and supported accessory options. Save changes with account credentials and bridge identity preserved; the dashboard identifies options requiring a restart. |

Use **Homebridge → Plugins → Nest Climate Cntrl → Settings** for Google/Nest account setup and web login, certificate and network settings. Its **Room sensors & fans** section also offers a read-only temperature preview. Named rules are managed in the standalone dashboard's **Climate rules** area.

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

Create each rule with **Enable automatic execution** off to inspect its inputs first. Turning it on and selecting **Save changes** starts that rule without a bridge restart. The **Execution status** panel reports the running engine; **Current signals · preview only** is a separate snapshot of the editor's inputs.

The engine checks rules approximately every **15 seconds**, including when no browser is open. Slow bridge responses can extend this interval. Motion inputs are polled, so very short pulses between polls may be missed. Sensors that maintain an occupancy state are useful alongside motion sensors.

### Find your sources

1. Sign in and open **Sensors & fans → Discover sources**. Associated Nest sensors appear as the Nest account connects; discovery adds compatible services from configured Homebridge main and child bridges.
2. Check **Bridge connections & source availability** if a source is missing. Homebridge accessory control (`-I`) must be enabled on the source bridge, and that bridge must be reachable with its configured credentials.
3. Use the **Temperature**, **Presence** and **Fans** filters to inspect readings and availability.

Third-party devices must expose a compatible temperature, motion, occupancy or fan service through Homebridge. Devices available only in Apple Home are not discoverable here. Room fans need standard writable on/off control; a generic switch is not automatically treated as a fan. Combined Climate presence outputs are excluded from discovery to prevent feedback loops.

Discovery records when a value was read, which may differ from when the sensor measured it. Enabled rules refresh their inputs automatically. A missing or stale selected source is not silently dropped from a temperature average or treated as evidence that nobody is home.

### Temperature group example

**Goal:** use the temperatures in the occupied rooms to guide a Nest thermostat's heating target.

1. On **Overview**, confirm that the thermostat is online and that **Temperature controlled by** is **Thermostat sensor**. If needed, select it and apply the change. Use **Heat** mode and turn **Eco off** through your normal Nest controls. The engine does not change modes or native sensor selection for you.
2. If Nest reports a weekly schedule, open **Settings** and set **Nest schedule time zone** to the thermostat's IANA time zone, for example `America/Los_Angeles`. Save this before enabling the group.
3. Open **Climate rules → Temperature → Create temperature group**, or use **+**. Name it **Downstairs comfort** and select the thermostat serving those rooms.
4. Enter **21** in **Desired room temperature (°C)**. Rule inputs use Celsius; 21 °C is 69.8 °F. Live heating targets must be between 9 and 32 °C.
5. Choose **Equal average of selected sensors** and select two or more inputs. A Nest living-room sensor at **20 °C** plus a Homebridge dining-room sensor at **22 °C** averages **21 °C**. Nest-only, other Homebridge-only and mixed groups are supported. For a single room, choose **One selected sensor** and select exactly one input.
6. Review **Maximum target adjustment (°C)** and **Minimum update interval (minutes)**. Defaults are **1.5 °C** and **5 minutes**; a **0.5 °C** adjustment limit is a useful starting point for a small, supervised trial.
7. Turn on **Enable automatic execution** and select **Save changes**. Watch **Execution status** for the group reading, desired room target, physical Nest target and command feedback. It can take a polling cycle and device feedback for a change to appear.
8. Confirm the target on the physical thermostat or in Nest. Use **Pause rule** to finish the trial. The engine restores its previous target only while it still owns that setting and Nest remains in the same control context.

The heating controller starts with:

```text
Nest target = desired room temperature
            + built-in Nest temperature
            - selected-room temperature
```

It limits that adjustment, rounds on the device's Celsius/Fahrenheit grid, and keeps the final target between 9 and 32 °C. For example, if Nest reads 22 °C, the selected rooms average 20 °C and the desired room temperature is 21 °C, the unbounded target is 23 °C. With the default 1.5 °C limit, the target is capped at 22.5 °C.

Only one enabled group can control a thermostat. A group does not create an independent physical HVAC zone or pair third-party devices as native Nest sensors. This heating pilot does not compensate in Cool or Heat/Cool range mode and does not provide weighted or scheduled groups.

Change the **desired room temperature in Climate rules**. Apple Home continues to show Nest's physical target; changing it directly pauses the software group. Manual target/mode changes, Eco, a native sensor change, a lock or a Nest schedule boundary take priority. Select **Resume automatic control** when you want a new room-temperature hold.

### Room-fan example

**Goal:** run a Homebridge-exposed ceiling or room fan when the selected rooms become warm.

1. Discover the fan under **Sensors & fans** and confirm **On/off capable**. Start with the fan off for this trial.
2. Open **Climate rules → Room fans → Create fan rule**, or use **+**. Name it **Living room cooling** and select the fan.
3. Choose **Temperature above threshold**, set **Above temperature (°C)** to **24**, and **Turn-off gap (°C)** to **1**.
4. Select the temperature sources. Multiple readings are averaged. To consider the same rooms as a temperature group, select the same sources here; the fan rule has its own selection.
5. Review the preview, turn on **Enable automatic execution**, and select **Save changes**. Above 24 °C, the rule starts the fan. Once running, it keeps the fan on through the gap and returns it to its previous state at **23 °C or below**.
6. For a supervised trial without changing the room temperature, save a threshold slightly below the current average and observe the fan starting. Then save a threshold whose **threshold minus turn-off gap** is above the average and observe it stopping. Allow at least **one minute between normal fan commands**, plus the polling interval.
7. Restore the threshold you want, or use **Pause rule** to end the trial.

An enabled rule does not stop a fan that was already running before the rule took control. A manual fan change pauses the rule instead of being repeatedly overwritten. Only one enabled rule can own a given fan. Speed and direction are not set by these rules.

To circulate air with the HVAC system, choose **Thermostat is heating** or **Thermostat is cooling** and select the thermostat. The fan follows its reported activity. **Nest HVAC fan timers** are separate controls on **Overview** for the blower connected to Nest; they do not operate these room fans.

### Home/Away example

**Goal:** publish a combined occupancy sensor using activity from several parts of the home.

1. Open **Climate rules → Home & away → Create presence rule**, or use **+**.
2. Name it **Climate Home presence**. Select the home's **Nest Home/Away** input, a hallway **motion** sensor and an office **occupancy** sensor. Nest status appears when the plugin has its state; other sensors must be exposed through Homebridge.
3. Choose **Any selected source is positive**. Nest reporting Home, positive office occupancy or a held motion detection can each establish Home. **All selected sources are positive** requires all selected inputs to be positive; choose that only if it matches your intended meaning.
4. Set **Motion hold (minutes)** to **10** and **Delay before Away (minutes)** to **20**. The hold extends a motion signal; continuous occupancy remains positive while the sensor reports occupancy. The Away delay starts only after the Home condition clears and all inputs are available.
5. Enable the rule and **Save changes**. A separate occupancy accessory with the rule's name appears in Apple Home. Watch **Execution status** for Home/Away, source faults, and pending timers.
6. To test the timers, use short hold/delay values and trigger a selected sensor. Return to your intended durations afterward. If Nest still reports Home, an **Any** rule should remain Home; do not expect motion inactivity alone to make it Away.
7. Use **Force Home · 1 hour** or **Force Away · 1 hour** for a timed override. **Resume automatic presence** ends it early. Overrides and valid motion holds survive a restart, while the Away delay is re-established from current readings.

Unavailable inputs cannot establish Away. The last confirmed state is retained with fault information; unknown startup state is not published as a confirmed departure. The sensor is read-only in Apple Home. It does not change Google's Home/Away state, activate Eco or directly run another climate rule. Use the combined occupancy sensor in your own Apple Home automations for additional actions you choose.

### Pausing, restarts and connection loss

- **Pause rule** immediately requests a stop to automatic control. Settings still owned by that rule return to their previous values when the equipment is reachable. A newer manual setting is preserved.
- Turning off **Enable automatic execution** or deleting a rule takes effect after **Save changes**. Disabling a presence rule removes its combined occupancy accessory.
- Temperature and room-fan rules require **Resume automatic control after a Nest bridge restart**. Review equipment state first. Presence rules reconcile saved holds/overrides with current readings automatically.
- If the Homebridge host stops abruptly, or Nest/the source bridge cannot be reached, it is impossible to send a fallback command. **The thermostat or room fan may retain its last commanded state.** A graceful shutdown attempts to restore owned settings.
- Failed or unconfirmed commands pause the rule. Check the actual equipment and its connection before resuming. A successful API response is not proof that the equipment reached the requested state.

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

An **HVAC fan** is the blower connected to Nest. A **room fan** is a separate fan exposed by another Homebridge plugin. Room-fan rules control it only when explicitly enabled. Accessories available only in Apple Home cannot be discovered automatically by this dashboard.

Runtime totals reflect periods observed by the plugin. Gaps are unknown, and runtime is not an energy-consumption measurement.

## Saving settings

Review your changes and select **Save**. Configuration changes are written to the existing Nest Climate Cntrl entry; account credentials, child-bridge identity, and unrelated plugin settings are retained. The dashboard identifies settings that need a child-bridge restart. Enabled rule changes apply without a restart. Disabled rules remain drafts. After a bridge restart, resume temperature and fan rules explicitly.

If another settings page saves while you are editing, the dashboard asks you to reload instead of overwriting the newer configuration. Copy any unsaved choices you want to keep, reload, and apply them to the latest settings.

Use Homebridge's plugin settings for account credentials and the web server's network settings. Web sessions expire and are cleared when the Nest bridge restarts. To replace a forgotten web password, create a replacement login from the authenticated Homebridge settings page; existing web sessions are signed out.

Each child bridge has its own web account and, when using direct HTTPS, its own certificate settings. If you enable dashboards for multiple Nest child bridges, assign a different port to each one.

## Add to your phone

On iPhone or iPad, open the dashboard in Safari, select **Share → Add to Home Screen**, and choose **Add**. The plum climate icon and app name are supplied automatically. The dashboard opens in a compact app layout and adapts to narrow screens.

Keep the Homebridge host reachable while using it. The dashboard does not cache account data or provide offline climate control.
