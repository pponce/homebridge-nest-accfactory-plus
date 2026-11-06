# Nest Climate Cntrl migration and coexistence

The development platform alias is `NestClimateCntrl`; the npm package remains `homebridge-nest-accfactory-plus`. Existing accessory UUIDs continue to use the `homebridge-nest-accfactory` namespace. Neither the display name nor the platform alias changes the UUID derived from a device serial number.

## Existing installations

**The alias/cache transition is not yet validated for rollout. Do not treat changing the platform field alone as a tested migration.** Homebridge also stores plugin/platform associations for cached accessories. Existing bridge identity, pairing, accessory identities and service identities must be preserved together.

The intended migration will retain the current bridge username and pairing and deliberately transfer the cache association from `NestAccfactory` to `NestClimateCntrl`. It will not clear shared caches, regenerate UUIDs or require re-pairing as a default step. A tested migration procedure will be provided before release. Apple Home rooms, scenes and automations have not yet been hardware-verified through this transition.

Keep the current installation unchanged until that procedure and the feature testing are complete. No cache or live configuration is rewritten merely by opening this settings page.

## New development installations

Use `"platform": "NestClimateCntrl"` with the existing package identifier. A separate child bridge is appropriate for a new dual-plugin setup; moving an existing installation to another bridge is a separate migration.

When upstream runs cameras and doorbells, configure disjoint accessory ownership: exclude thermostats, sensors, Heat Links and any Protect/Home-Away accessories managed by Climate Cntrl from upstream. Publishing the same device through both plugins can collide on a shared bridge because the historical UUID namespace is intentionally preserved.

Climate Cntrl does not discover weather, cameras, doorbells, floodlight cameras or Yale locks. Owned cached weather accessories also need verification in the final migration procedure.

## External source preview

Discovery requires Homebridge accessory control (`-I`) and valid bridge PINs in the local Homebridge configuration. The UI reads configured main and child bridges only. PINs remain server-side. Native Nest sensors use the existing Google connection. Accessories available only in Apple Home are outside scope.

Room sensor grouping is a read-only preview. It does not activate software temperature compensation, fan automation, combined presence rules or Google whole-home writes.
