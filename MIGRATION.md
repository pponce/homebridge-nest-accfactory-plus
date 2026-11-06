# Moving to Nest Climate Cntrl beta

**The Homebridge platform name changes from `NestAccfactory` to `NestClimateCntrl`.** The npm package changes from `homebridge-nest-accfactory-plus` to `homebridge-nest-climate-cntrl`.

This is a separate beta package, not an automatic update of the old package. Installing it does not migrate your existing configuration or Apple Home accessories.

## Before changing an existing installation

1. Record the installed plugin version and whether it uses the main bridge or a child bridge.
2. Run the read-only migration preflight supplied with the [beta release](https://github.com/pponce/homebridge-nest-climate-cntrl/releases). It reports configuration/cache structure without exporting credentials, pairing keys, device names or serial numbers.
3. Choose whether to keep the current Apple Home accessories or create a separate beta bridge.
4. Create a Homebridge backup before applying the chosen migration.

**Do not change only the platform field and restart.** Homebridge stores plugin and platform ownership in its accessory cache. An unhandled change can orphan accessories and affect room assignments, scenes and automations.

## Option A: preserve existing Apple Home accessories

The plugin can reuse restored legacy accessory UUIDs, but the complete plugin/platform cache-association migration is **not yet validated for this beta**. Keep the existing installation unchanged until its configuration and cache have been inspected and a migration procedure has been tested for that layout.

Retain the existing bridge username, pairing and service identities. Do not clear the shared accessory cache or remove the bridge from Apple Home to attempt a preserving migration.

## Option B: separate beta child bridge

This is the supported starting point for testing as a new installation. It creates **new Apple Home accessories**; room assignments, scenes and automations are not transferred.

1. In Homebridge, disable the old Nest child bridge before allowing the beta to control the same devices. Keep its configuration and Apple Home pairing for rollback. If Nest runs on the main bridge, review that layout before changing it.
2. Install `homebridge-nest-climate-cntrl@beta` using the Homebridge plugin installer.
3. Open its settings and configure the same account credentials privately. Set only the climate devices it should own.
4. Enable a **new child bridge** through Homebridge's UI. Use its newly generated identity and pair that bridge with Apple Home.
5. Confirm temperature readings, modes and normal manual control before enabling optional Eco or HVAC fan switches.
6. Assign the new accessories to rooms and rebuild any desired scenes/automations.

For an `hb-service` installation, the installation sequence is **stop → add the plugin → start**. The release helper performs inspection and npm publication only; it does not install the beta or edit live configuration.

To roll back a separate-bridge trial, disable the beta child bridge, then re-enable the original child bridge. Do not leave both controlling the same thermostat.

## Running alongside upstream

Use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) for cameras, doorbells, floodlight cameras, Yale locks or weather. Give every physical or virtual accessory one owner: exclude climate devices managed here from upstream, and avoid duplicate Protect or Home/Away accessories. Separate child bridges are recommended for a new dual-plugin installation.

## Identity and preview behavior

New accessories use the stable `homebridge-nest-climate-cntrl` UUID namespace. A matching legacy UUID restored to this platform retains its `homebridge-nest-accfactory` identity. Without a restored cache entry, the device is treated as new.

Mixed Google/non-Google temperature groups, room-fan discovery and presence-sensor discovery are read-only previews. They do not enable automatic temperature compensation, room-fan actions or combined Home/Away rules.
