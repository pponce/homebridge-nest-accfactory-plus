# Mixed temperature-group sensor setup checkpoint

Repository: `pponce/homebridge-nest-climate-cntrl`; integration branch: `main`.
Implementation base: `408262fa6ad3af116fa39370ffc8d9ae74e1ce61`.
Latest published package remains `0.5.0-beta.12`; this feature has not been released.

## Objective and completed changes

Add explicit, in-page setup approval when a saved and enabled temperature rule mixes Nest room sensors with non-Nest Homebridge temperature sensors.

- The dashboard offers setup after enabling or changing a mixed rule and on Resume. Cancel/Escape sends no sensor command; polling never opens another confirmation.
- A confirmed request writes native `RCS_CONTROL_MODE_HOLD` and the thermostat backplate selection together. Existing sensor schedules, associations, weekly temperature schedules, mode and Eco are retained.
- A persisted per-thermostat record stores the original native mode/selection and signatures of the original and expected held settings. Fresh native cloud observation and the exact expected signature are required before heating.
- Failed or unconfirmed writes have no automatic retry. Direct manual controls pause the group; changed native sensor/schedule signatures relinquish heating ownership and prevent restoration over the new settings.
- Explicit restoration pauses the group, waits for any compensated heating target to be confirmed restored, then restores saved native selection/mode and waits for cloud confirmation. Disabled/deleted rules retain recovery records; Overview exposes restoration for them. Restart never replays a native write automatically.
- Unsupported or ambiguous native multi-sensor formats remain unavailable. Missing native state is distinguished from a positively reported unsupported format; unknown state is never treated as the built-in sensor.

## Boundaries and decisions

Only positively known classic RCS control modes and source selections support automatic setup. The newer `sensorSelection` field, enabled multi-sensor grouping, malformed selections, foreign sensor references and unknown modes fail closed. This does not claim automatic 4th-generation native-averaging support. Manual changes in the Nest app do not guarantee a supported feedback shape.

Sensor setup is scoped to a mixed rule, not a fan rule or a group using only Nest sensors. A thermostat already reporting the required built-in HOLD state needs no write or setup confirmation. User approval is bound to the current saved rule and current native settings; changed state requires a fresh review.

## Source files

Protocol and mapped feedback: `src/nest-sensor-control.js`, `src/system.js`, `src/plugins/thermostat.js`.
Lifecycle and guarded writes: `src/temperature-sensor-setup.js`, `src/climate-automation.js`, `src/climate-dashboard.js`.
UI and preview: `homebridge-ui/dashboard/app.js`, `homebridge-ui/public/sensor-preview.js`.
Public guide: `WEB_DASHBOARD.md`.
Tests: `test/nest-sensor-control.test.js`, `test/temperature-sensor-setup.test.js`, `test/climate-controls.test.js`, `test/climate-automation.test.js`, `test/climate-dashboard.test.js`, `test/climate-sources.test.js`, `test/coverage-baseline.json`, `maintenance/checks/sensor-setup-browser.mjs`, `maintenance/checks/run-dashboard-browser.mjs`.

## Validation

92 focused protocol, lifecycle, automation and dashboard tests pass locally. The 13 new lifecycle scenarios cover consent, fresh feedback, timeout/failure, manual precedence, deletion during preparation, target restoration feedback, native restoration failure and restart recovery. Another 16 source tests pass, including the new absent-trait/unknown-state preview checks.

Measured focused coverage: native protocol module 100% lines/branches/functions; setup lifecycle 100% lines, 94.93% branches and 100% functions; dashboard 100% lines, 98.11% branches and 94.87% functions. New floors were added without reducing existing floors.

The dedicated browser suite is included in the regular browser runner. Local Chromium could not launch because `socket()` returned EPERM before assertions. Full compatibility, lint, build, coverage and browser checks must run in GitHub before reporting integrated validation. Full local web-server tests also require the complete repository/dependencies; the current partial snapshot lacks some unchanged dependencies.

No live thermostat or Homebridge installation was changed. No npm publication or release was performed for this feature. Physical device behavior remains unverified.

## Exact next steps

1. Integrate only the reviewed changed-file manifest on current `main`, preserving the independently completed npm-download helper correction.
2. Run all compatibility/browser checks and resolve any failures; record the resulting commit and workflow IDs here.
3. On a supported thermostat, create a mixed-sensor temperature rule, save enabled, cancel setup and verify no sensor change or heating command.
4. Approve setup; verify the Nest app reports thermostat sensor control with native sensor scheduling held and paired sensors retained. Confirm group heating starts only after the dashboard reports confirmation.
5. Pause/disable the group and use Restore. Verify the original target is restored before the native sensor selection/schedule mode returns.
6. Change native settings manually during a trial and verify the plugin pauses instead of overriding the new choice. Verify retained restoration visibility after deleting a prepared group.
7. Request the next GitHub beta when ready; npm publication remains a separate maintainer-run action.

## Copyable handoff

```text
Objective: consent-based native Nest sensor setup for mixed Nest/non-Nest temperature groups.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main; source base 408262fa6ad3af116fa39370ffc8d9ae74e1ce61.
Implemented: native HOLD + backplate selection, in-page consent, exact fresh readback gate, persisted recovery, guarded explicit restoration, unknown/multi-sensor fail-closed handling.
Decision: retain saved sensor schedule and paired sensors; manual changes win; never retry native writes automatically; restore heating target before native sensor mode.
Local validation: 92 focused tests plus 16 source tests passed; new module coverage floors added without reducing existing floors.
Pending: GitHub compatibility/browser validation and physical thermostat trial; current latest release remains beta.12.
No live installation changes, npm publication or feature release performed.
Next: integrate reviewed files, pass CI, then run the supported-thermostat consent/readback/restoration trial.
```
