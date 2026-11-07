# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address using direct HTTP, direct HTTPS, or HTTPS through a local reverse proxy. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and organize climate rule drafts.

The dashboard is under beta testing. Automatic room-temperature control, room-fan actions, and combined occupancy rules are not enabled by saving a draft.

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

## What you can do

| Area | Available controls |
| --- | --- |
| Overview | Current temperatures and targets, heating/cooling state, account connectivity, and observed runtime |
| Thermostat controls | Supported Eco changes, native Nest temperature-source selection, and HVAC fan timers |
| Sources | Readings and availability for associated Nest sensors and discoverable Homebridge temperature, motion, occupancy, and fan services |
| Rules | Save draft temperature groups, occupancy rules, and room-fan rules for review |
| Settings | Change supported climate presentation and accessory options while preserving stored account credentials and bridge identity |

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
