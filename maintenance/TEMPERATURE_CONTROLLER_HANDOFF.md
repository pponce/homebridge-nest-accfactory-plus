# Temperature controller display checkpoint

Objective: each Overview thermostat card identifies its controlling temperature rule or native Nest temperature sensor through a read-only expandable display.

Repository: `pponce/homebridge-nest-climate-cntrl`. Integration branch: `main`. Feature branch: `feature/temperature-controller-status`. Release target: `v0.5.0-beta.17`.

## Implemented

- The heading identifies the applied temperature rule by name or Nest’s positively reported built-in/official room sensor.
- Expanded information lists only native Nest sensors and temperature rules assigned to that thermostat. Third-party temperature sensors are inputs to temperature rules, never standalone controller choices.
- Runtime reporting distinguishes active control, the normal update interval, target feedback, restoration, paused/disabled rules, blocked execution and unavailable status. No new thermostat action is introduced.
- Rule feedback comes from the running engine, independent of unsaved editor drafts. Expanding the display sends no commands and expanded details survive polling.
- A known built-in sensor remains visible without a paired-sensor list. Unknown native selections stay unknown. Automatic sensor setup and heating eligibility remain independently validated.
- Public dashboard documentation and controller/engine/browser regressions cover the current behavior.

## Validation checkpoint

128 focused tests passed locally (77 controller, automation and sensor tests; 51 dashboard, source and web-server tests). JavaScript syntax and whitespace checks passed. Local Chromium cannot launch because this execution environment disallows a required socket. GitHub Test run [42650106631](https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42650106631) and dashboard run [42650106460](https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42650106460) passed on feature commit `07b904e71e6e4519f1cd54776f41e743cf5aa672`: all six Node/Homebridge combinations, lint, full tests, coverage floors, builds, migration checks, browser suites and production-package verification. Browser fixtures verify no writes from the display, distinct controller states, native-sensor diagnostics and mobile bounds. Physical thermostat behavior has not been tested.

Review: [PR #14](https://github.com/pponce/homebridge-nest-climate-cntrl/pull/14). PR #14 was merged after explicit approval in commit `d4518ce3c3d286f013545bea704421cc5e269d73`. Release metadata and helpers now target beta.17. npm publication is performed separately by the maintainer-run script.

## Next steps

1. Complete beta.17 release validation and confirm GitHub package/helper assets.
2. Provide the pinned beta.17 npm publication block.
3. After installation, verify both thermostat cards, compare native sensor reporting with Nest, and check applied/paused temperature rules. No npm publication or live thermostat settings changes are part of this work.

## Copyable handoff

```text
Objective: read-only per-thermostat temperature controller information.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main. Release target: v0.5.0-beta.17.
Completed: applied rule name, native sensor name, associated official sensors and assigned temperature rules; active/interval/pending/restoring/paused/disabled/waiting/unavailable states; no selector or Apply action.
Decisions: non-native sensors require a climate temperature rule. Only confirmed native selections are displayed as selected. Display does not grant sensor-control or heating eligibility.
Local validation: 128 focused tests passed; syntax/diff checks passed. Chromium is blocked locally by socket restrictions.
GitHub validation: Test 42650106631 and dashboard 42650106460 passed for 07b904e71e6e4519f1cd54776f41e743cf5aa672, including all six runtime combinations and browser suites.
Merged: PR #14 in d4518ce3c3d286f013545bea704421cc5e269d73 after explicit approval.
Pending: beta.17 GitHub release validation, pinned npm publication script and hardware verification.
Next: wait for validated GitHub assets, then provide the npm publication block; no assistant-run npm publication or live settings changes.
```
