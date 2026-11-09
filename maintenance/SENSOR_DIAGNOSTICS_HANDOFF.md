# Sensor selection and diagnostics checkpoint

Objective: show a positively known selected sensor independently of whether automatic native sensor setup is supported, and provide read-only diagnostics for every thermostat.

Repository: `pponce/homebridge-nest-climate-cntrl`. Integration branch: `main`. Implementation base: `c7501dd42da5a74b0dd5e54e4e29356f57cba9ab`. Release target: `0.5.0-beta.15`.

## Completed changes

- `src/nest-sensor-control.js` exposes a separate display-only selection and explicit validation issues. Existing setup/heating eligibility still uses the strictly validated source and supported flag. Ambiguous multi-sensor formats stay unknown.
- Overview shows known built-in and remote sensor names while explaining automatic setup limitations independently. Unknown selection is never displayed as the thermostat sensor by default.
- Overview includes a diagnostics download for all thermostats, after a fresh dashboard read. It includes names, connection/update status and validation reasons. Explicit field selection excludes credentials, identifiers, signatures, temperature data and schedules.
- Browser coverage exercises supported and unsupported controls, missing mode/list/selection, multi-sensor ambiguity, two-thermostat JSON download, privacy canaries, read-only requests, disconnected feedback and mobile layout.
- Public setup guide, release notes and release/install/publication version pins target beta.15. npm publication remains separate and requires maintainer authorization.

## Validation

132 focused protocol, setup lifecycle, automation, dashboard, controls, sources and web tests passed locally. Native sensor validation has 100% line, branch and function coverage. JavaScript syntax and diff checks passed.

Local Chromium is blocked by runtime socket restrictions; the dependency registry is inaccessible locally. Full lint, compatibility, build, browser and production-package verification run in GitHub before release publication. Physical thermostat behavior has not been tested.

## Next steps

1. Verify the beta.15 release workflow and all six Node/Homebridge combinations succeed.
2. Install the tested GitHub package with the supplied installer; no npm publication is needed for direct installation.
3. Refresh Overview and compare each thermostat's displayed sensor with the Nest app.
4. Open Diagnose Nest sensor selection and download the report. Inspect issue codes before deciding whether protocol handling needs a follow-up change.
5. Review and Resume desired temperature/fan rules after the bridge restart. Do not change native scheduling merely to collect diagnostics.

## Copyable handoff

```text
Objective: independent current-sensor display and read-only diagnostics for Nest sensor setup.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main.
Base: c7501dd42da5a74b0dd5e54e4e29356f57cba9ab. Target: v0.5.0-beta.15.
Completed: display-only selection, explicit validation reasons, all-thermostat JSON download, privacy and read-only browser regressions, public documentation and release pins.
Safety decision: display feedback cannot authorize automatic setup or heating; existing strict eligibility and restoration gates remain in effect.
Local checks: 132 focused tests pass; sensor protocol coverage 100% lines/branches/functions; syntax/diff checks pass.
Pending: GitHub release gates, installation, physical sensor comparison and the diagnostic report.
Next: install beta.15, refresh Overview, download sensor diagnostics, inspect the two thermostats' issue codes. No npm publication or live settings changes performed by the assistant.
```
