# Climate development checkpoint

Updated: 2026-11-06

## Objective and identity

Develop Nest Climate Cntrl in `pponce/homebridge-nest-accfactory-plus`, branch `feature/thermostat-dashboard`. Preserve `NestAccfactory`, package identity and accessory UUID namespace during development. Future repository/package name: `homebridge-nest-climate-cntrl`. No npm publication or live installation performed.

## Implemented

- Restrict discovery to thermostat, Temperature Sensor, Heat Link, Protect, Home/Away and weather modules; bypass video capability probes. Camera source/dependencies are still present pending final package cleanup.
- Custom Homebridge settings UI with accounts, thermostat status/actions, associated native sensor selection, optional HomeKit features, schedules, runtime coverage and redacted diagnostics.
- Optional Eco and 15/30/60-minute HVAC fan-preset switches, disabled by default. Presets do not replace the default duration.
- Authenticated loopback dashboard, restricted endpoint-file permissions, serialized UI commands, runtime persistence without extrapolating outages.
- Reconnect ownership guard, failed-start listener cleanup and legacy configuration editing.

## Validation

- 15 focused tests pass under Node 24.22.1.
- Dashboard module coverage: 100% lines, 90.82% branches, 90.32% functions.
- `npm run build` and build verification pass.
- Full lint/regression/coverage pending: local dependency download unavailable; eslint missing.
- Browser behavior script prepared; local Chromium cannot launch because its Unix socket is prohibited by the execution environment. No visual validation claimed.
- Real thermostat Eco, sensor selection and HVAC fan behavior are not hardware verified.

## Remaining work

1. Run GitHub validation, resolve lint/regression/coverage failures without lowering existing floors. Development workflow formats only changed climate files; remove it before final merge once normal PR checks are green.
2. Run browser checks and inspect desktop/mobile light/dark UI. Validate real Homebridge UI lifecycle/API integration, config save and restart.
3. Verify protocol commands against physical thermostat, associated sensors and Heat Link. Confirm no accessory duplication and camera/lock cache cleanup behavior.
4. Finish removal of camera-specific distribution/dependencies while retaining upstream provenance and existing tests as appropriate.
5. Produce climate-focused icon and apply it to README/UI.
6. Room/ceiling-fan coordination remains unimplemented. Investigate reusable accessible main/child bridge discovery from the Harmony Home Control project; do not confuse this with Nest HVAC blower presets.
7. Preserve and follow `maintenance/FEATURE_PLAN.md` for mixed native/external temperature sensors. Begin with read-only discovery and compensation preview. No external-sensor thermostat writes are enabled.
8. Plan package/repository rename, migration and Homebridge verification updates separately. Ask before publishing npm.

## Continuation details

Local repository was initialized from a source snapshot rather than a full remote clone. Do not push its synthetic history. Use remote GitHub commits/trees based on inspected remote main and preserve unrelated newer files. Local source snapshots have one extra trailing newline compared with fetched content; compare normalized content when checking upstream changes. Shared submodule files were fetched at pinned revisions for local validation; never replace remote gitlinks with those copies.
