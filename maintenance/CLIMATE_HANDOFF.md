# Climate development checkpoint

> Current execution work: see [EXECUTION_ENGINE_HANDOFF.md](EXECUTION_ENGINE_HANDOFF.md). This file records the earlier beta.5 checkpoint; draft-only statements below are historical.


Updated: 2026-11-06 (Pacific)

## Objective and current state

Repository: `pponce/homebridge-nest-climate-cntrl`. Branch: `main`. Platform: `NestClimateCntrl`. npm package: `homebridge-nest-climate-cntrl`.

Current GitHub prerelease: **0.5.0-beta.5**, source `2ea81968f1930f0b3bbfe03ae867c5b22a2857b4`.

https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.5

GitHub publication is complete. npm publication has not been verified. The release asset publisher performs npm authentication and publication in the operator's terminal.

## Completed changes

- Three connection choices in Homebridge setup and configuration schema: direct HTTP, direct HTTPS, and HTTPS through a local reverse proxy.
- New `webDashboard.protocol: "proxy"` with an explicit `publicOrigin` such as `https://climate.example.com`.
- Proxy mode always binds HTTP to `127.0.0.1` on the configured port (9444 by default); it does not read or generate certificates.
- Requests require a loopback socket peer and the configured public Host. Mutations require the public HTTPS Origin and session CSRF token. Forwarded headers cannot change those decisions.
- Proxy sessions use the existing Secure, HttpOnly, SameSite=Strict cookie. Public links omit the internal backend port.
- Direct HTTP warnings and direct HTTPS certificate settings remain available. HTTPS remains the default.
- Network setup hides irrelevant certificate fields in proxy mode and displays its fixed listen address.
- README, setup guide, changelog, prerelease notes and verified publisher are updated for beta.5.

## Validation

Release workflow `42321968754` passed on source `2ea81968f1930f0b3bbfe03ae867c5b22a2857b4`.

All six supported Node/Homebridge combinations passed lint, coverage, tests and build. All three browser suites passed: embedded setup (including 360px proxy settings), standalone dashboard, and the real HTTPS-to-HTTP reverse proxy with browser-managed secure cookies, session reload, settings, actions, CSRF rejection and logout. The production tarball installed, registered and exposed the proxy configuration successfully. Publisher scenarios and ignored-file collision checks passed.

Local focused validation passed 29 dashboard/API tests, including a real local TLS-terminating proxy, rejected hosts/origins and spoofed forwarded headers. Full browser and dependency checks ran in GitHub CI because this local runtime cannot launch Chromium or fetch all npm dependencies.

The deployment on a real Nginx/Homebridge host and physical Nest hardware remains unverified. No live installation, credentials, DNS or Nginx configuration was changed during development.

## Release assets and publisher

Asset: `update-checkout-and-publish-beta.sh`.

SHA256: `e9f0396c829658eb1c9b76b0a78226a2e199a46633d1eeaffdf12d5f6d838abe`.

Package asset: `homebridge-nest-climate-cntrl-0.5.0-beta.5.tgz`.

SHA256: `e70bdf3b41f42b26643713ece6b5018ee554c24b25fa9a8c84b8dc911d0938ca`.

The publisher fast-forwards a clean main checkout, fetches submodules, verifies the GitHub package and publishes under npm's `beta` tag. It preserves local maintenance artifacts, rejects ignored-file collisions and does not repeat an upload recorded as accepted. It does not modify the running Homebridge installation.

Reports are written under `maintenance/releases/v0.5.0-beta.5/`. A report records verified, pending-verification or failed status. Registry propagation can be checked again without repeating an accepted upload.

## Feature boundaries and migration

Implemented: thermostats, native temperature sensors, Heat Links, Protect, Nest Home/Away, Eco switches, native temperature-source selection, optional HVAC fan presets, schedules, observed runtime, standalone dashboard settings and Homebridge source discovery.

Compatible existing legacy Google refresh tokens remain supported. New legacy-token issuance and an SDM integration are not included.

Mixed temperature-source previews and temperature, occupancy and external room-fan rules remain **inactive drafts**. Automatic compensation and rule execution are not implemented.

Cameras, doorbells, floodlights, Yale locks and weather are outside the climate scope. Refer to upstream Nest Accfactory with separate device ownership.

Moving from Accfactory/Plus requires the fresh cutover described in MIGRATION.md. Existing Climate beta installations update normally; beta.5 does not force accessory identity changes. Do not use experimental offline cache-rewrite helpers as the supported migration procedure.

## Next steps

1. Run the verified beta.5 publisher and inspect its npm result before claiming registry availability.
2. Install the published beta through the supported Homebridge update procedure and verify on real hardware.
3. For same-machine Nginx deployment, select HTTPS through reverse proxy, configure the public HTTPS origin, and forward HTTP to `127.0.0.1:9444` with the public Host preserved. Keep certificates and port-80 redirection in Nginx. Public DNS continues to target the proxy host's LAN addresses. See WEB_DASHBOARD.md.
4. Continue implementing bounded temperature control, combined occupancy and room-fan execution, including manual/Eco/schedule precedence and failure recovery.
5. Keep release assets immutable. Record future work under maintenance and keep public setup documentation independent of individual installations.

## Repository workflow

Preserve remote history and submodule gitlinks. If working from a synthetic local source snapshot, do not push that snapshot's history; inspect the current remote head and use expected-SHA updates. Keep project notes under maintenance and exclude credentials and private installation data.
