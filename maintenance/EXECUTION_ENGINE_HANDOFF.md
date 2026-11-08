# Climate execution engine checkpoint

Updated: 2026-11-08. Work in progress; do not treat this checkpoint as a release sign-off.

## Objective and repository

Implement live, opt-in execution for temperature groups, Homebridge room-fan rules and combined Home/Away rules, with a usable dashboard and an installable build for hardware trials.

Repository: `pponce/homebridge-nest-climate-cntrl`. Implementation branch: `feature/climate-execution`. Base main: `d0a0b424d8c01be2c39c8708ccc3680d0bb483d1`. First implementation commit: `7f791571d77b98962b4aba27c6a2efcc9d8914ac`; formatted source: `6113c85fa618756f937e58b73fe143ba0a58fcdf`.

## Implemented

- `src/climate-automation.js`: serialized polling, persisted command ownership, bounded heating target compensation, manual/schedule precedence, feedback tracking, fan hysteresis, motion holds, Away delays, overrides, restart reconciliation and conditional restoration.
- Heating scope: single/equal-average sources; Heat mode, Eco off, built-in Nest sensor, one enabled group per thermostat. Defaults: ±1.5 °C adjustment, five-minute minimum changes, 9–32 °C absolute range. No cooling/range compensation, weighted groups or scheduled groups.
- `homebridge-ui/climate-access.js`: fresh capability/state validation and authenticated HAP PUT for configured writable fans; no retry of uncertain writes. One enabled owner per fan. Fans already running before rule ownership are not switched off by that rule.
- `src/climate-presence.js`: distinct stable read-only HomeKit occupancy accessories, unknown/fault handling, cached restoration and removal. No writes to Google Home/Away or Eco. Polling can miss motion pulses shorter than a poll interval.
- Platform starts execution independently of browser/web listener availability. Native thermostat commands pause software compensation. Temperature/fan rules require explicit Resume after restart; presence holds and timed overrides are reconciled automatically.
- Rule validation, schema, authenticated/CSRF-protected command endpoint, enable toggles, runtime status, pause/resume and one-hour presence overrides. Existing drafts remain disabled.
- README and WEB_DASHBOARD.md have live-rule explanations and supervised trial instructions in the working tree.

## Verification so far

- 68 focused local engine, source, native-control, dashboard and web API tests passed before the latest small fixture updates. Engine coverage at that point: 91.30% lines, 88.20% branches, 90.14% functions. New module coverage floors were added without reducing existing floors.
- CI run `42537098781`: formatting and all browser suites passed, including embedded setup, standalone desktop/mobile execution controls and HTTPS reverse proxy sessions.
- Compatibility matrix failed on older extracted-method fixtures lacking `climateWrites`. Local fixes for `test/protobuf-hvac.test.js` and `test/system-set.test.js` are prepared; they need the next CI run.
- Local npm dependency download is blocked (registry 403), and Chromium cannot open its required socket. Full runtime, HAP, coverage/build and browser checks run in GitHub CI.
- No real thermostat/fan installation was modified. No npm publication is authorized or performed.

## Next steps

1. Commit the fixture corrections and pending docs to the implementation branch, preserving remote history and expected-head checks. The branch-specific validation workflow formats touched modules and then tests that formatted commit across all supported Node/Homebridge combinations.
2. Inspect all CI failures, finish meaningful tests and any fixes, and verify the final exact source revision. Add a real platform startup/lifecycle test if coverage requires it; do not lower existing coverage floors.
3. Review remaining execution edge cases, especially command races, cleanup/recovery and rule changes. Check documentation links and ensure embedded setup text directs users to live rules accurately.
4. Prepare the next beta version, release notes and a complete install script with START/END markers, no `exit` or `set -e`, and stop → hb-service add → start. Keep generated reports/downloads under the existing project folder. Do not create backups without permission.
5. Fast-forward main only after checks pass, create the tested GitHub prerelease package, and provide exact first temperature-group/fan setup steps. Ask before npm publication.

The local checkout is a synthetic snapshot with pre-existing changes. Do not push its Git history. Use GitHub tree/commit/ref tools against the inspected remote base and preserve submodule entries. Private deployment details and credentials do not belong in public documentation.
