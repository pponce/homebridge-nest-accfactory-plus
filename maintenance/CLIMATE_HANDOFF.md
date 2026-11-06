# Climate development checkpoint

Updated: 2026-11-06

## Objective and identity

Develop Nest Climate Cntrl in `pponce/homebridge-nest-accfactory-plus`, branch `feature/thermostat-dashboard`. Target platform alias is `NestClimateCntrl`; implementation and tested migration from `NestAccfactory` are pending. Preserve existing accessory UUID namespace and bridge pairing during the transition; package identity remains unchanged until its separate migration. Future repository/package name: `homebridge-nest-climate-cntrl`. No npm publication or live installation performed.

## Implemented

- Current discovery is restricted to thermostat, Temperature Sensor, Heat Link, Protect, Home/Away and weather modules (weather is now excluded from the agreed product scope and still needs removal); bypass video capability probes. Camera source/dependencies are still present pending final package cleanup.
- Custom Homebridge settings UI with accounts, thermostat status/actions, associated native sensor selection, optional HomeKit features, schedules, runtime coverage and redacted diagnostics.
- Optional Eco and 15/30/60-minute HVAC fan-preset switches, disabled by default. Presets do not replace the default duration.
- Authenticated loopback dashboard, restricted endpoint-file permissions, serialized UI commands, runtime persistence without extrapolating outages.
- Reconnect ownership guard, failed-start listener cleanup and legacy configuration editing.

## Validation

- 17 focused tests pass under Node 24.22.1.
- Dashboard module coverage: 100% lines, 96.26% branches, 93.55% functions.
- `npm run build` and build verification pass.
- GitHub Node 24 validation passed lint, 1,608 regression tests, all module coverage floors and build. Final PR matrix validates Node 22/24/26 with supported Homebridge versions.
- Chromium behavior tests passed in GitHub: masked credentials, saved config preservation, sensor command, offline controls, 375px layout and schema fallback. Local Chromium cannot launch because of execution restrictions. Full visual inspection and live Homebridge integration remain pending.
- Real thermostat Eco, sensor selection and HVAC fan behavior are not hardware verified.

## Remaining work

1. Run GitHub validation, resolve lint/regression/coverage failures without lowering existing floors. Temporary formatting/diagnostic workflow removed. Browser checks now run in the normal PR workflow.
2. Run browser checks and inspect desktop/mobile light/dark UI. Validate real Homebridge UI lifecycle/API integration, config save and restart.
3. Verify protocol commands against physical thermostat, associated sensors and Heat Link. Confirm no accessory duplication and camera/lock cache cleanup behavior.
4. Finish removal of camera-specific distribution/dependencies while retaining upstream provenance and existing tests as appropriate.
5. Approved plum icon exported at 100px and 512px and applied to README/UI.
6. Room/ceiling-fan coordination remains unimplemented. Investigate reusable accessible main/child bridge discovery from the Harmony Home Control project; do not confuse this with Nest HVAC blower presets.
7. Preserve and follow `maintenance/FEATURE_PLAN.md` for mixed native/external temperature sensors. Begin with read-only discovery and compensation preview. No external-sensor thermostat writes are enabled.
8. Implement target alias `NestClimateCntrl` with a tested config/cache transition, preserving the existing UUID prefix and bridge pairing. Guide the maintainer's current-install migration after feature completion and validation; do not assume changing config alone is sufficient. Plan package/repository rename and Homebridge verification updates separately. Ask before publishing npm.
9. Remove weather from discovery and UI/configuration; account for owned cached weather accessories. Configure upstream and the climate plugin to own disjoint device sets when both are installed.
10. Optional combined **Climate Home/Away** occupancy sensor is approved for the feature plan, not implemented. Combine Google's raw reported home state with user-selected accessible Homebridge motion/occupancy sensors. Include a searchable main/child-bridge picker, any/all rule groups, motion holds, Away delay, preview and dashboard manual overrides. Keep raw Google state separate; the combined sensor does not itself write Google mode or thermostat settings. Follow the recommended Google-plus-sensors preset, fault/restart behavior and validation sequence in `maintenance/FEATURE_PLAN.md`.

## Review location

Draft PR: https://github.com/pponce/homebridge-nest-accfactory-plus/pull/12

## Continuation details

Local repository was initialized from a source snapshot rather than a full remote clone. Do not push its synthetic history. Use remote GitHub commits/trees based on inspected remote main and preserve unrelated newer files. Local source snapshots have one extra trailing newline compared with fetched content; compare normalized content when checking upstream changes. Shared submodule files were fetched at pinned revisions for local validation; never replace remote gitlinks with those copies.
