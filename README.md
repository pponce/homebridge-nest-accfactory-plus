<p align="center"><img src="homebridge-ui/public/nest-climate-cntrl-icon-512.png" alt="Nest Climate Cntrl" width="160" height="160"></p>

# Nest Climate Cntrl

Bring Nest thermostats, room temperatures and climate controls into Apple Home, with a visual admin interface in Homebridge and an optional dashboard for your computer or phone.

See how different rooms feel, use supported Nest controls, and prepare temperature groups, Homebridge room-fan rules and Home/Away rules from multiple sensors.

**Public beta:** this version is still being tested on real equipment. Install the `beta` release and report issues with your thermostat model and Homebridge version.

**Moving from Nest Accfactory or Nest Accfactory Plus requires fresh setup and pairing.** The package is `homebridge-nest-climate-cntrl` and the platform is **`NestClimateCntrl`**. Recreate affected Apple Home room assignments, scenes and automations; follow the [cutover instructions](MIGRATION.md). Existing Climate Cntrl installations can update normally.

## What's included

| Feature | What you can do in this beta |
| --- | --- |
| **Visual setup and admin dashboard** | Configure accounts and accessories in Homebridge. Open a separate web dashboard with sign-in, thermostat status, sensor search, settings and guided rule editors. |
| **Temperature groups with Nest and other sensors** | Select one sensor or average multiple readings from associated Nest sensors, other Homebridge temperature sensors, or both. Save a desired room temperature and preview the group; automatic thermostat adjustments are **not yet available**. |
| **Homebridge ceiling and room fans** | Discover fans and draft temperature-based or heating/cooling-based rules. Preview whether a run condition is met; automatic room-fan commands are **not yet available**. |
| **Home/Away from multiple signals** | Combine available Nest Home/Away, motion and occupancy inputs in a saved rule draft. Preview “any” or “all” logic; combined Home/Away automation is **not yet available**. |
| **Live Nest controls** | Use supported Eco controls, select a native Nest temperature source, and run the thermostat's HVAC blower with timed actions. |
| **Schedules and runtime** | Inspect reported weekly setpoints, the next planned change and observed heating/cooling totals with a weekly chart. |

**Rule drafts are inactive.** You can test discovery, readings and condition previews now. Saving or restarting does not enable automatic temperature, room-fan or combined Home/Away actions. See the [first-rule walkthroughs](WEB_DASHBOARD.md#try-your-first-rules).

### Temperature groups: choose the rooms that matter

A temperature group represents the rooms whose readings you want to consider together. For example, give a group the name **Downstairs comfort**, choose the Nest thermostat serving that area, and enter a desired temperature of **21 °C**.

| Example | Sources to select | Group reading |
| --- | --- | --- |
| Nest sensors only | Living-room Nest sensor at 20 °C and dining-room Nest sensor at 22 °C | Equal average: 21 °C |
| Other Homebridge sensors only | Office sensor at 19 °C and study sensor at 21 °C | Equal average: 20 °C |
| Nest and other sensors together | Living-room Nest sensor at 20 °C and a Homebridge-exposed desk sensor at 22 °C | Equal average: 21 °C |

Choose **One selected sensor** to focus on a single room, or **Equal average of selected sensors** for a group. The readings and desired temperature are available as a preview and saved draft. Having Nest maintain that group temperature automatically is planned; the draft does not change the thermostat's setpoint.

A group does not create a separate physical heating/cooling zone or turn third-party sensors into native Nest sensors. For a live native Nest option, use **Temperature controlled by** to select one associated Nest Temperature Sensor where supported. [Create your first temperature group](WEB_DASHBOARD.md#temperature-group-example).

### Room fans: plan comfort around temperature or HVAC activity

For a ceiling fan exposed by another Homebridge plugin, draft a rule to run when the selected rooms average above **24 °C**, with a **1 °C turn-off gap** intended to prevent repeated on/off changes near the threshold. Alternatively, select **Thermostat is heating** or **Thermostat is cooling** as the run condition.

The dashboard discovers compatible fans and previews the current condition. Fan switching and the turn-off behavior are not executed by drafts. These room fans are separate from the **Nest HVAC blower**, whose supported timer controls work now. [Create a room-fan draft](WEB_DASHBOARD.md#room-fan-example).

### Home/Away: bring several presence signals together

Draft a **Home presence** rule using Nest Home/Away, a hallway motion sensor and an office occupancy sensor. Choose **Any selected source is positive** so the preview reports a Home condition when any one of those signals is positive, or choose **All selected sources are positive** for a stricter condition.

Motion holds and an Away delay can be saved in the draft, for example **10 minutes** and **20 minutes**. The current preview checks the latest readings; it does not run those timers, change Eco or Google's Home/Away state, or create a combined HomeKit occupancy accessory. Existing native Nest Home/Away support remains available. [Explore a presence draft](WEB_DASHBOARD.md#homeaway-example).

### Admin interface and visual configuration

Use **Homebridge → Plugins → Nest Climate Cntrl → Settings** for account setup, per-device options, room-sensor previews and web access. The optional standalone dashboard has four areas:

- **Overview:** thermostat cards, supported live controls, schedules and runtime.
- **Sensors & fans:** searchable temperature, motion, occupancy and fan sources, with bridge availability.
- **Climate rules:** guided editors for temperature groups, Home/Away and room-fan drafts, with current-signal previews.
- **Settings:** dashboard and supported accessory options, saved with a clear indication when a bridge restart is needed.

The layout adapts to desktop and phone screens. Web access has its own sign-in and supports direct HTTP, direct HTTPS with certificates in the plugin, or HTTPS through a local reverse proxy such as Nginx. [Set up the web dashboard](WEB_DASHBOARD.md).

### More Nest options

- **Legacy Google authentication:** keeps support for compatible existing refresh tokens. If you already have a working legacy token, you can continue using it; this plugin cannot issue a new one.
- **Eco switches:** optional Apple Home switches to enter and leave Eco mode.
- **HVAC fan timers:** configurable default duration and optional 15-, 30- and 60-minute action switches. These operate the blower connected to Nest.

Eco and fan-preset switches are off by default. Separate humidity sensors and Eve history are also configurable.

## Supported devices

Nest thermostats, associated Nest Temperature Sensors and Nest Heat Links supported by the Nest/Google connection. Heat Links connect compatible thermostats to heating equipment; available hot-water controls depend on the model and installation. Nest Protect and Nest Home/Away accessories remain available.

This edition focuses on climate: **camera, doorbell, floodlight-camera, Nest × Yale lock and weather support have been removed.**

Need those capabilities? Use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory). Nest Accfactory can run alongside this plugin with separate device ownership; see [coexistence guidance](MIGRATION.md#running-alongside-upstream).

## Get started

1. Use Homebridge **1.11.4+ or 2.4.0+** with Node **22 or 24**. Node **26** requires Homebridge **2.4.0+**.
2. Install **`homebridge-nest-climate-cntrl@beta`** through Homebridge's plugin installer. A child bridge is recommended for a new installation.
3. Open **Plugins → Nest Climate Cntrl → Settings**, add your account and save.
4. Restart the plugin's bridge, then select the optional Apple Home features you want.

Google issue-token/cookie credentials and compatible existing legacy refresh tokens are supported. Legacy Nest access tokens are available for supported accounts. **No SDM project is required.** See [account setup](AUTHENTICATION.md).

Live action buttons send commands immediately. Configuration changes use Homebridge's **Save** button and may require a bridge restart.

External discovery requires readable Homebridge accessories and the bridge's accessory-control configuration. Sensors or fans visible only in Apple Home are not accessible. Bridge PINs stay on the server.

Schedule entries show planned changes, not guaranteed hold-expiry times. Runtime is recorded while the plugin observes valid equipment state; it does not recover Nest history or estimate energy use.

## Web dashboard

Open **Plugins → Nest Climate Cntrl → Settings → Web dashboard**, create a web username/password, then enable web access, save and restart the Nest child bridge. Select **Open climate dashboard** to visit its address, usually `https://<homebridge-host>:9444`.

The phone-friendly interface shows thermostat status, native controls, sensors, schedules and runtime. It also lets you save supported settings and prepare temperature, occupancy and room-fan rule drafts. **These drafts are inactive; saving one does not control your devices.**

On iPhone, open the address in Safari and choose **Share → Add to Home Screen** for the plum app icon. Choose direct **HTTP** for simple local access (passwords and dashboard data travel unencrypted), direct **HTTPS** with certificate settings in the plugin, or **HTTPS through reverse proxy** so Nginx handles certificates and redirects. Proxy mode uses HTTP on `127.0.0.1:9444`, requires your public HTTPS origin, and generates links without the internal port. Direct HTTPS is the default; its generated local certificate needs browser trust unless you supply a trusted certificate. Web access is off by default. See [complete setup and network options](WEB_DASHBOARD.md).

## Help and credits

[Report a beta issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues) · [Release notes](https://github.com/pponce/homebridge-nest-climate-cntrl/releases) · [Migration](MIGRATION.md)

Maintained by [pponce](https://github.com/pponce), based on [Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) by n0rt0nthec4t and its contributors. Apache-2.0 licensed. Not affiliated with Google or Apple.
