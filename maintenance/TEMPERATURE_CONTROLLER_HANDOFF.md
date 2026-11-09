# Temperature controller display checkpoint

Objective: each Overview thermostat card identifies its controlling temperature rule or native Nest temperature sensor through a read-only expandable display.

Repository: `pponce/homebridge-nest-climate-cntrl`. Implementation branch: `feature/temperature-controller-status`. Target branch: `main`.

## Implemented

- The heading identifies the applied temperature rule by name or Nest’s positively reported built-in/official room sensor.
- Expanded information lists only native Nest sensors and temperature rules assigned to that thermostat. Third-party temperature sensors are inputs to temperature rules, never standalone controller choices.
- Runtime reporting distinguishes active control, the normal update interval, target feedback, restoration, paused/disabled rules, blocked execution and unavailable status. No new thermostat action is introduced.
- Rule feedback comes from the running engine, independent of unsaved editor drafts. Expanding the display sends no commands and expanded details survive polling.
- A known built-in sensor remains visible without a paired-sensor list. Unknown native selections stay unknown. Automatic sensor setup and heating eligibility remain independently validated.
- Public dashboard documentation and controller/engine/browser regressions cover the current behavior.

## Validation checkpoint

128 focused tests passed locally (77 controller, automation and sensor tests; 51 dashboard, source and web-server tests). JavaScript syntax and whitespace checks passed. Local Chromium cannot launch because this execution environment disallows a required socket; browser verification uses the existing GitHub workflow. Physical thermostat behavior has not been tested.

## Next steps

1. Complete GitHub Test checks for the feature commit, including all Node/Homebridge combinations and browser suites.
2. Inspect browser screenshots and resolve any layout or regression failures.
3. Include the changes in the next requested release. No package version or release marker is changed by this feature.
4. After installation, verify both thermostat cards, compare native sensor reporting with Nest, and check applied/paused temperature rules. No npm publication or live thermostat settings changes are part of this work.

## Copyable handoff

```text
Objective: read-only per-thermostat temperature controller information.
Repository/branch: pponce/homebridge-nest-climate-cntrl, feature/temperature-controller-status (targets main).
Completed: applied rule name, native sensor name, associated official sensors and assigned temperature rules; active/interval/pending/restoring/paused/disabled/waiting/unavailable states; no selector or Apply action.
Decisions: non-native sensors require a climate temperature rule. Only confirmed native selections are displayed as selected. Display does not grant sensor-control or heating eligibility.
Local validation: 128 focused tests passed; syntax/diff checks passed. Chromium is blocked locally by socket restrictions.
Pending: GitHub validation and browser review, then a separately requested release and hardware verification.
Next: inspect feature checks and fix any failures; do not publish npm or change live settings.
```
