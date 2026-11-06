<p align="center"><img src="homebridge-ui/public/nest-climate-cntrl-icon-512.png" alt="Nest Climate Cntrl" width="160" height="160"></p>

# Nest Climate Cntrl

Nest thermostat, room-sensor and Heat Link controls for Apple Home, with a climate dashboard inside Homebridge.

**Public beta:** this version is still being tested on real equipment. Install the `beta` release and report issues with your thermostat model and Homebridge version.

**Moving from Nest Accfactory or Nest Accfactory Plus requires fresh setup and pairing.** The package is `homebridge-nest-climate-cntrl` and the platform is **`NestClimateCntrl`**. Recreate affected Apple Home room assignments, scenes and automations; follow the [cutover instructions](MIGRATION.md). Existing Climate Cntrl installations can update normally.

## What's included

- **Climate dashboard:** thermostat temperature, target, heating/cooling state, connection status and diagnostics.
- **Legacy Google authentication:** keeps support for compatible existing refresh tokens. If you already have a working legacy token, you can continue using it; this plugin cannot issue a new one.
- **Eco switches:** optional Apple Home switches to enter and leave Eco mode.
- **Native room sensors:** readings from associated Nest Temperature Sensors and a **Temperature controlled by** selector.
- **HVAC fan timers:** configurable default duration and optional 15-, 30- and 60-minute action switches. These operate the blower connected to Nest.
- **Schedules and runtime:** reported weekly setpoints, the next planned change and observed daily heating/cooling totals with a weekly chart.
- **Room-sensor preview:** select Nest and other Homebridge temperature sensors together and preview their average. Discover room fans and motion/occupancy sensors on accessible main and child bridges.

Eco and fan-preset switches are off by default. Separate humidity sensors and Eve history are also configurable.

**The mixed-sensor preview is read-only.** It does not automatically adjust heating or run room fans. Automatic room-fan coordination, software temperature compensation and combined Home/Away rules are planned.

## Supported devices

Nest thermostats, associated Nest Temperature Sensors and Nest Heat Links supported by the Nest/Google connection. Heat Links connect compatible thermostats to heating equipment; available hot-water controls depend on the model and installation. Nest Protect and Nest Home/Away accessories remain available.

This edition focuses on climate: **camera, doorbell, floodlight-camera, Nest × Yale lock and weather support have been removed.**

Need those capabilities? Use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory). If you want to install this plugin to use it's added capabilities, Nest Accfactory can run alongside this plugin with separate device ownership; see [coexistence guidance](MIGRATION.md#running-alongside-upstream).

## Get started

1. Use Homebridge **1.11.4+ or 2.4.0+** with Node **22 or 24**. Node **26** requires Homebridge **2.4.0+**.
2. Install **`homebridge-nest-climate-cntrl@beta`** through Homebridge's plugin installer. A child bridge is recommended for a new installation.
3. Open **Plugins → Nest Climate Cntrl → Settings**, add your account and save.
4. Restart the plugin's bridge, then select the optional Apple Home features you want.

Google issue-token/cookie credentials and compatible existing legacy refresh tokens are supported. Legacy Nest access tokens are available for supported accounts. **No SDM project is required.** See [account setup](AUTHENTICATION.md).

Live action buttons send commands immediately. Configuration changes use Homebridge's **Save** button and may require a bridge restart.

External discovery requires readable Homebridge accessories and the bridge's accessory-control configuration. Sensors or fans visible only in Apple Home are not accessible. Bridge PINs stay on the server.

Schedule entries show planned changes, not guaranteed hold-expiry times. Runtime is recorded while the plugin observes valid equipment state; it does not recover Nest history or estimate energy use.

## Help and credits

[Report a beta issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues) · [Release notes](https://github.com/pponce/homebridge-nest-climate-cntrl/releases) · [Migration](MIGRATION.md)

Maintained by [pponce](https://github.com/pponce), based on [Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) by n0rt0nthec4t and its contributors. Apache-2.0 licensed. Not affiliated with Google or Apple.
