# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and organize climate rule drafts.

This feature is a development preview. Automatic room-temperature control, room-fan actions, and combined occupancy rules are not enabled by saving a draft.

## Enable web access

1. Open **Homebridge → Plugins → Nest Climate Cntrl → Settings → Web dashboard**. The Nest bridge must be running.
2. Create a **web username and password**. Use at least 12 characters for the password. This account is separate from your Google and Homebridge accounts.
3. Select **Enable standalone dashboard**. Save with Homebridge's **Save** button and restart the Nest child bridge.
4. Select **Refresh web access**, then **Open climate dashboard**. The default HTTPS port is **9444**.

The plugin creates a local self-signed HTTPS certificate when you have not supplied one. OpenSSL must be available on the Homebridge host. Your browser will ask you to trust the certificate before the first visit. Under **Network and HTTPS settings**, you can choose a listen address and port, set the address used in links, or supply both a certificate and private-key file.

The web server is off by default. Enable it on the network where you intend to use it. With a reverse proxy, set the public hostname under **Address shown in dashboard links**, forward to the dashboard's HTTPS port, and preserve that hostname in the upstream Host header. Use a certificate trusted by the proxy or explicitly trust the local certificate. Visit the proxy's HTTPS address directly; the Homebridge link includes the dashboard's listening port.

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
