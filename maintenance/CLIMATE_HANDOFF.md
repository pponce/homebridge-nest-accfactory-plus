# Climate development checkpoint

Updated: 2026-11-06 (Pacific)

## Objective and current state

Repository: `pponce/homebridge-nest-climate-cntrl`. Branch: `main`. Platform: `NestClimateCntrl`. npm package: `homebridge-nest-climate-cntrl`.

Current GitHub prerelease: **0.5.0-beta.4**, source `73355729305ac81b6073348e37a8aa8b67061027`.

https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.4

GitHub publication is complete. npm publication has not been verified. The release asset publisher performs npm authentication and publication in the operator's terminal.

## Completed changes

- Optional HTTP dashboard mode with HTTPS retained as the default.
- Unencrypted-password and dashboard-data warnings in setup, sign-in, the dashboard and startup logs.
- Separate HTTP and HTTPS session-cookie names; login, origin checks and CSRF validation remain required.
- HTTP starts without loading or generating TLS certificates.
- Accessible protocol selector, editable hostname and certificate settings, and HTTPS reverse-proxy guidance.
- Web dashboard passwords accept 8–128 characters.
- Publisher checks derive the version from package.json. Release workflow changes trigger validation as well as version-marker changes.

## Validation

Release workflow `42318424986` and normal Test workflow `42318424971` passed.

Checks cover six supported Node/Homebridge combinations, embedded and standalone browser suites, production-only package installation, ten publisher scenarios and a real Git ignored-file collision. Browser checks include HTTP warnings, warning suppression on HTTPS, 360px layout, text contrast and touch targets.

Targeted local validation passed all 26 web/dashboard tests, including an actual HTTP listener, session-cookie separation, origin/CSRF checks, logout and no TLS setup in HTTP mode.

These automated checks do not establish real Nest hardware behavior or successful operation of an individual installation's reverse proxy.

## Release assets and publisher

Asset: `update-checkout-and-publish-beta.sh`.

SHA256: `97d95a90671dcfca8f4b7de0c130e2cc25e60c06f2eebf7941fcbfc463cc2450`.

Package asset: `homebridge-nest-climate-cntrl-0.5.0-beta.4.tgz`.

SHA256: `feb71356f2509ead02779fb11769f0425b481f71bdfc9a2a7934ee2d9fdd54c4`.

The publisher fast-forwards a clean main checkout, fetches submodules, verifies the GitHub package and publishes under npm's `beta` tag. It preserves local maintenance artifacts, rejects ignored-file collisions and does not repeat an upload recorded as accepted. It does not modify the running Homebridge installation.

Reports are written under `maintenance/releases/v0.5.0-beta.4/`. A report records verified, pending-verification or failed status. Registry propagation can be checked again without repeating an accepted upload.

## Feature boundaries and migration

Implemented: thermostats, native temperature sensors, Heat Links, Protect, Nest Home/Away, Eco switches, native temperature-source selection, optional HVAC fan presets, schedules, observed runtime, standalone dashboard settings and Homebridge source discovery.

Compatible existing legacy Google refresh tokens remain supported. New legacy-token issuance and an SDM integration are not included.

Mixed temperature-source previews and temperature, occupancy and external room-fan rules remain **inactive drafts**. Automatic compensation and rule execution are not implemented.

Cameras, doorbells, floodlights, Yale locks and weather are outside the climate scope. Refer to upstream Nest Accfactory with separate device ownership.

Moving from Accfactory/Plus requires the fresh cutover described in MIGRATION.md. Existing Climate beta installations update normally; beta.4 does not force accessory identity changes. Do not use experimental offline cache-rewrite helpers as the supported migration procedure.

## Next steps

1. Run the verified beta.4 publisher and inspect its npm result before claiming registry availability.
2. Install the published beta through the supported Homebridge update procedure and verify on real hardware.
3. For dashboard deployment, follow WEB_DASHBOARD.md. Match the proxy's upstream protocol to the listener, preserve the external Host and configure trusted backend certificates when verification is enabled. Use `::` when an IPv6 listener is required.
4. Continue implementing bounded temperature control, combined occupancy and room-fan execution, including manual/Eco/schedule precedence and failure recovery.
5. Keep release assets immutable. Record future work under maintenance and keep public setup documentation independent of individual installations.

## Repository workflow

Preserve remote history and submodule gitlinks. If working from a synthetic local source snapshot, do not push that snapshot's history; inspect the current remote head and use expected-SHA updates. Keep project notes under maintenance and exclude credentials and private installation data.
