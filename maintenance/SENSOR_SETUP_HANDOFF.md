# Mixed temperature-group sensor setup checkpoint

Repository: `pponce/homebridge-nest-climate-cntrl`; integration branch: `main`.
Implementation base: `408262fa6ad3af116fa39370ffc8d9ae74e1ce61`.
Feature commit: `5ace341b278f26c4190028c388af1cf26b1326cc`.
Validated code and browser-fixture commit: `1acdcf4c2efb076f7cf754cc7e2b052096fc0634`.
Latest GitHub prerelease: `0.5.0-beta.13`, published from `7e47a9854044f5a1015591c2fe1e4167578b1026`. The sensor setup feature is included.
Release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.13

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

108 focused protocol, lifecycle, automation, dashboard and source tests pass locally. The 13 new lifecycle scenarios cover consent, fresh feedback, timeout/failure, manual precedence, deletion during preparation, target restoration feedback, native restoration failure and restart recovery. The source checks include the absent-trait and reported-unknown preview regressions.

Measured focused coverage: native protocol module 100% lines/branches/functions; setup lifecycle 100% lines, 94.93% branches and 100% functions; dashboard 100% lines, 98.11% branches and 94.87% functions. New floors were added without reducing existing floors.

GitHub Test run **42570256155** passed on `1acdcf4c2efb076f7cf754cc7e2b052096fc0634`: all six Node/Homebridge configurations, lint, full tests, coverage floors, build, cache-migration checks, and all browser suites. Browser coverage includes the new mixed-sensor consent, cancellation, exact-state confirmation, pending feedback, unsupported states, restoration after deletion, unsaved-edit controls, stale confirmation, and mobile layout.

Workflow: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42570256155

Release run **42573852651** and Test run **42573852533** passed for beta.13, including all six compatibility configurations, browser suites, production-package installation/registration and publication/installer helpers.

No live thermostat or Homebridge installation was changed. npm publication remains maintainer-run. Physical device behavior remains unverified.

## Exact next steps

1. Run `maintenance/publish-beta13.sh` from the existing project environment, complete npm login/2FA if prompted, and verify the publication report and beta tag.
2. Update the installed Homebridge plugin separately. Refresh the dashboard and review/Resume enabled temperature and fan rules.
3. On a supported thermostat, create a mixed-sensor temperature rule, save enabled, cancel setup and verify no sensor change or heating command.
4. Approve setup; verify the Nest app reports thermostat sensor control with native sensor scheduling held and paired sensors retained. Confirm group heating starts only after the dashboard reports confirmation.
5. Pause/disable the group and use Restore. Verify the original target is restored before the native sensor selection/schedule mode returns.
6. Change native settings manually during a trial and verify the plugin pauses instead of overriding the new choice. Verify retained restoration visibility after deleting a prepared group.
7. Record physical results before claiming thermostat-model support beyond the recognized classic sensor-control format.

## Copyable handoff

```text
Objective: consent-based native Nest sensor setup for mixed Nest/non-Nest temperature groups.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main; validated code 1acdcf4c2efb076f7cf754cc7e2b052096fc0634.
Implemented: native HOLD + backplate selection, in-page consent, exact fresh readback gate, persisted recovery, guarded explicit restoration, unknown/multi-sensor fail-closed handling.
Decision: retain saved sensor schedule and paired sensors; manual changes win; never retry native writes automatically; restore heating target before native sensor mode.
Local validation: 108 focused tests passed; new module coverage floors added without reducing existing floors.
GitHub validation: Test run 42570256155 passed all six compatibility configurations and all browser suites.
Released: v0.5.0-beta.13 at 7e47a9854044f5a1015591c2fe1e4167578b1026; release run 42573852651 and Test run 42573852533 passed.
Pending: maintainer-run npm publication, installed update and physical thermostat trial.
No live installation changes or assistant-run npm publication performed.
Next: run the beta.13 npm publisher, update the installed plugin, then run the supported-thermostat consent/readback/restoration trial.
```

## npm publication retry

The release publisher has a documented GitHub asset API fallback in `408262fa6ad3af116fa39370ffc8d9ae74e1ce61`. Its 16 focused scenarios and all GitHub compatibility/browser checks passed in run 42568849145. The complete beta.12 retry block is `maintenance/publish-beta12-retry.sh`; it fetches the helper from the source host, falls back to pinned Git content if needed, and verifies SHA-256 `401d3ec1bc93fc6051cd9f491b7402756ebd1c5a2f9abc997b631fb49a47f659` before execution. This does not modify the published beta.12 assets.

## beta.13 publication pins

Complete pasteable block: `maintenance/publish-beta13.sh`. It fetches the release helper from source commit `7e47a9854044f5a1015591c2fe1e4167578b1026`, with pinned Git-content fallback.

- Publisher SHA-256: `f6bade192ad059cf2416941c35ac08ad9df1c26b88feeb9f924592c04e9dd9d0`.
- Tested package SHA-256: `e61fe231be1459a91eea0042bfdc9bfc6cdd4de8314cba2eabae2ce2b432de93`.
- npm channel: `beta`; keep `latest` unchanged.
