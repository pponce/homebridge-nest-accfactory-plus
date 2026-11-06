# Moving to Nest Climate Cntrl

**Moving from Nest Accfactory or Nest Accfactory Plus requires a fresh installation and Apple Home pairing.** This is a hard cutover: existing accessory room assignments, scenes and automations do not transfer. Recreate the affected setup using the new accessories.

The package is `homebridge-nest-climate-cntrl` and the Homebridge platform is **`NestClimateCntrl`**. Changing the old `NestAccfactory` platform name alone is not a supported upgrade.

Already using `NestClimateCntrl`, including 0.5.0-beta.1? Keep your existing Climate child bridge and update normally. This cutover applies to the older Nest Accfactory packages; it is not a reset required for every beta.

## Before starting

- Keep your working account credentials available privately before uninstalling the old plugin. Compatible existing legacy Google refresh tokens remain supported; a new token cannot be issued by this plugin.
- Note the rooms, scenes and automations that use the old Nest accessories so you can recreate their assignments.
- Identify the old Nest child bridge. If Nest shares the main bridge with other plugins, remove only its accessories during cleanup; do not remove or reset the shared bridge.
- This is a public beta. Verify normal thermostat operation before enabling optional controls.

## Fresh cutover

1. Disable the old Nest plugin or its dedicated child bridge in Homebridge. Do this before the new plugin starts controlling the same devices.
2. Install **`homebridge-nest-climate-cntrl@beta`** through Homebridge's plugin installer.
3. Open **Plugins → Nest Climate Cntrl → Settings** and configure your account using the same working credentials. Choose the devices and optional features you want. Use [account setup](AUTHENTICATION.md) for authentication guidance.
4. Enable a **new child bridge** through Homebridge's UI. Let Homebridge generate its identity; do not copy the old bridge's username or pairing data.
5. Save and restart, then pair the new child bridge with Apple Home using its QR code.
6. Check device discovery, temperatures, heating/cooling modes and normal manual control. Assign the new accessories to rooms and rebuild affected scenes and automations.
7. Remove the old **dedicated Nest bridge** from Apple Home after the new devices work. Uninstall the old plugin and remove its unused configuration in Homebridge. Use Homebridge's accessory cleanup controls for any remaining old Nest entries, selecting only those entries.

For an `hb-service` installation, use **stop → add the plugin → start**. Keep the old Nest platform disabled while setting up the new one. Do not clear Homebridge's entire accessory cache or reset unrelated bridges.

## Keep Accessories Of Uninstalled Plugins

This setting may stay enabled. It retains old cached accessories when a plugin is uninstalled; it does not transfer them to `NestClimateCntrl` or make them work with the new plugin. Remove the old Nest bridge and any remaining old Nest cached entries as described above. Turning this setting off globally is not required.

## Running alongside upstream

Use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) for cameras, doorbells, floodlight cameras, Yale locks or weather. Keep it installed if you need those capabilities, and exclude the climate devices managed here.

Give each physical or virtual accessory one owner, including Protect and Nest Home/Away. Separate child bridges are recommended. When upstream retains other devices on its bridge, keep that bridge paired and remove only the accessories transferred to Climate Cntrl.

## What carries forward

Working account credentials can be reused, including compatible existing legacy Google refresh tokens. Newly paired Climate accessories use this plugin's own stable identities. Rooms, scenes and automations associated with the old bridge need to be recreated.

Mixed Google/non-Google temperature groups, room-fan discovery and presence-sensor discovery remain previews. Automatic temperature compensation, room-fan actions and combined Home/Away execution are not enabled.
