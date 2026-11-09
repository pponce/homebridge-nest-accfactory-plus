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

Local Chromium is blocked by runtime socket restrictions; the dependency registry is inaccessible locally. GitHub Test run **42579578892** and Release run **42579578897** passed on `c90160f191db37421d890d9ec2fef710b06fdde2`: all six Node/Homebridge configurations, lint, full tests, coverage floors, builds, all browser suites, production-only package installation and release-helper tests. The browser fixture waits for refresh completion before checking sensor labels. Release workflow screenshots are retained as an artifact. Physical thermostat behavior has not been tested.

Published GitHub prerelease: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.15

- Release commit: `c90160f191db37421d890d9ec2fef710b06fdde2`.
- Package SHA-256: `5df67b93ad7204ae33b2f33d96998322e79a7cfdcf3f30449a4e96270c1041ef`.
- Installer SHA-256: `1b12d3095231241e7a9fcc85a40599741abd36ea0442379428f6e0291e194ffb`.
- Complete pinned installer block: `maintenance/install-beta15.sh`. It runs the tested release installer, which verifies the package before stopping Homebridge and uses stop → add → start.
- npm has not been published by the assistant. The release includes the separate maintainer-run publication helper.

## Next steps

1. GitHub release validation is complete.
2. Install the tested GitHub package with `maintenance/install-beta15.sh`; no npm publication is needed for direct installation.
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
GitHub checks: Test 42579578892 and Release 42579578897 passed all gates.
Published: v0.5.0-beta.15 at c90160f191db37421d890d9ec2fef710b06fdde2.
Pending: installation, physical sensor comparison and the diagnostic report.
Next: install beta.15, refresh Overview, download sensor diagnostics, inspect the two thermostats' issue codes. No npm publication or live settings changes performed by the assistant.
```

## Installer download recovery

The beta.15 release installer stopped on a GitHub package download HTTP 504 before any Homebridge service command. Commit `a0edf649623d3e77894395e570112e1aba51a14c` adds retries and the documented GitHub release-asset API fallback already used by the publication helper. Both package and checksum downloads use the fallback, with release tag/asset identity validation and package checksum verification before installation.

Fourteen isolated installer checks pass, covering primary/fallback paths, failed downloads, missing/duplicate/wrong assets, JSON instead of package bytes, invalid/mismatched checksums, stop/add/start failures and keeping the caller shell open. Published beta.15 assets and package contents are unchanged.

`maintenance/install-beta15.sh` now pins the corrected helper at that commit with SHA-256 `c2da9622c5cce8ccd601751d83504cf8754d3739b1561cf6844447ab37961c7e`. Run the complete block, refresh the dashboard, then download the two-thermostat sensor diagnostics report. No live installation or npm publication was performed by the assistant.
