# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address over HTTPS or optional HTTP. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and organize climate rule drafts.

This feature is available in 0.5.0-beta.2 and is under beta testing. Automatic room-temperature control, room-fan actions, and combined occupancy rules are not enabled by saving a draft.

## Enable web access

1. Open **Homebridge → Plugins → Nest Climate Cntrl → Settings → Web dashboard**. The Nest bridge must be running.
2. Create a **web username and password**. Use at least 8 characters for the password. This account is separate from your Google and Homebridge accounts.
3. Select **Enable standalone dashboard**. Save with Homebridge's **Save** button and restart the Nest child bridge.
4. Select **Refresh web access**, then **Open climate dashboard**. The default HTTPS port is **9444**.

The plugin creates a local self-signed HTTPS certificate when you have not supplied one. OpenSSL must be available on the Homebridge host. Your browser will ask you to trust the certificate before the first visit. Under **Network and connection settings**, you can choose a listen address and port, set the address used in links, or supply both a certificate and private-key file.

The web server is off by default. Enable it on the network where you intend to use it. With a reverse proxy, set the public hostname under **Address shown in dashboard links**, forward to the dashboard's HTTPS port, and preserve that hostname in the upstream Host header. Use a certificate trusted by the proxy or explicitly trust the local certificate. Visit the proxy's HTTPS address directly; the Homebridge link includes the dashboard's listening port.

## HTTP mode

HTTPS is the default. Under **Network and connection settings → Connection protocol**, choose **HTTP · unencrypted**, save and restart the Nest bridge. The port remains configurable; the default is 9444. Open `http://<homebridge-host>:9444`.

**HTTP sends passwords and dashboard data unencrypted. Use it only on a trusted local network.** This warning appears in setup, before sign-in, in the dashboard and in the startup log. HTTP still requires the web login and validates browser origins and changes. It does not generate or read TLS certificates. Certificate paths stay saved for switching back to HTTPS.

## Use a hostname and trusted certificate

1. Point your internal DNS hostname, such as `climate.example.com`, to the Homebridge host's LAN address.
2. Keep **Connection protocol** set to **HTTPS**. Keep **Listen address** at `0.0.0.0` or select the host's LAN IP. Keep **Web port** at `9444` unless that port is already in use.
3. Set **Address shown in dashboard links** to the hostname only, without `https://`, a port or a path.
4. Set **TLS certificate path** to the full-chain PEM file (server certificate followed by its intermediate certificates). Set **TLS private key path** to the matching PEM private-key file. The files must exist on the Homebridge host and be readable by its service user; keep the private key restricted.
5. Save, restart the Nest child bridge and open `https://climate.example.com:9444`. Use the hostname covered by the certificate, rather than its IP address. A trusted, valid certificate covering the hostname avoids the certificate warning.

A wildcard certificate for `*.example.com` can cover `climate.example.com`. Restart the Nest child bridge after replacing or renewing certificate files; the listener reads them at startup.

To use `https://climate.example.com` without a port, put Nginx or another reverse proxy on port 443. The plugin listens on ports 1024–65535. Keep the dashboard backend on HTTPS and preserve the external Host header. Verify the backend certificate using a trusted chain or an explicitly trusted local certificate. HTTP mode is for direct HTTP access and does not trust forwarded headers to turn an HTTP connection into an HTTPS browser origin.

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

Each child bridge has its own web account and local certificate. If you enable dashboards for multiple Nest child bridges, assign a different port to each one.

## Add to your phone

On iPhone or iPad, open the dashboard in Safari, select **Share → Add to Home Screen**, and choose **Add**. The plum climate icon and app name are supplied automatically. The dashboard opens in a compact app layout and adapts to narrow screens.

Keep the Homebridge host reachable while using it. The dashboard does not cache account data or provide offline climate control.
