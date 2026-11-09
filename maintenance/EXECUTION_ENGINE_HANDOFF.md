# Climate execution engine checkpoint

Updated: 2026-11-09. Beta.6 GitHub prerelease published; physical hardware trials pending.

## Objective and repository

Implement live, opt-in execution for temperature groups, Homebridge room-fan rules and combined Home/Away rules, with a usable dashboard and an installable build for hardware trials.

Repository: `pponce/homebridge-nest-climate-cntrl`. Implementation branch: `feature/climate-execution`. Base main: `d0a0b424d8c01be2c39c8708ccc3680d0bb483d1`. Released source: `05ae065e33ce51f28fcde5da44b0aa0cd0ca16d6`. First implementation commit: `7f791571d77b98962b4aba27c6a2efcc9d8914ac`; formatted source: `6113c85fa618756f937e58b73fe143ba0a58fcdf`.

## Implemented

- `src/climate-automation.js`: serialized polling, persisted command ownership, bounded heating target compensation, manual/schedule precedence, feedback tracking, fan hysteresis, motion holds, Away delays, overrides, restart reconciliation and conditional restoration.
- Heating scope: single/equal-average sources; Heat mode, Eco off, built-in Nest sensor, one enabled group per thermostat. Defaults: ±1.5 °C adjustment, five-minute minimum changes, 9–32 °C absolute range. No cooling/range compensation, weighted groups or scheduled groups.
- `homebridge-ui/climate-access.js`: fresh capability/state validation and authenticated HAP PUT for configured writable fans; no retry of uncertain writes. One enabled owner per fan. Fans already running before rule ownership are not switched off by that rule.
- `src/climate-presence.js`: distinct stable read-only HomeKit occupancy accessories, unknown/fault handling, cached restoration and removal. No writes to Google Home/Away or Eco. Polling can miss motion pulses shorter than a poll interval.
- Platform starts execution independently of browser/web listener availability. Native thermostat commands pause software compensation. Temperature/fan rules require explicit Resume after restart; presence holds and timed overrides are reconciled automatically.
- Rule validation, schema, authenticated/CSRF-protected command endpoint, enable toggles, runtime status, pause/resume and one-hour presence overrides. Existing drafts remain disabled.
- README and WEB_DASHBOARD.md have live-rule explanations and supervised trial instructions in the working tree.

## Verification

- Final branch run `42538425477`, main Test run `42538638694`, and release run `42538638579` all passed on the released source. The release additionally installed the production tarball, verified plugin registration and execution-module exports, and exercised publisher/installer scenarios.

- CI run `42537635516` passed on formatted commit `d38270098652bb23ddcb53ed764a84d0770f17f8`: all six supported Node 22/24/26 and Homebridge 1.11.4/2.4.0/2.5.0 combinations, including lint, coverage, build, real HAP lifecycle and cache restoration.
- Embedded setup, standalone desktop/mobile and HTTPS-to-HTTP reverse-proxy browser suites passed, including enable/save/pause/resume and existing authentication/CSRF checks.
- Final review added regressions for Fahrenheit target feedback rounding, minimum-interval preservation after a sensor outage and timezone changes without a bridge restart. All 71 focused engine, source, native-control, dashboard and API tests pass locally. These final changes are included in the passing final CI and release runs.
- Engine coverage before these additions: 91.30% lines, 88.20% branches, 90.14% functions. New module coverage floors were added without reducing existing floors.
- Local dependency downloads and Chromium are unavailable in this environment. Complete runtime/browser/package checks run in GitHub CI.
- No real thermostat/fan installation was modified. No npm publication is authorized or performed.

## Release and first hardware trial

GitHub prerelease: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.6

Package SHA256: `c8649f03e107cf501973e348d874bf30f2def8b286cf3289ca64dd579dc6512e`. Installer SHA256: `8e7870995efd7d6659e371d63361d2038c560730750f132e83147e76b546915e`. Both are verified against GitHub asset metadata. The installer is `maintenance/install-execution-beta.sh`; it downloads the GitHub release package into the existing project folder and runs stop → hb-service add → start. It attempts to start Homebridge even when package installation fails. It does not publish to npm or change Nginx/DNS.

1. Install the GitHub beta on a test installation. Open Climate rules, select a Heat/Eco-off thermostat using its built-in sensor, choose valid group sources and a modest adjustment limit, then explicitly enable/save. If Nest has a weekly schedule, set the thermostat's IANA timezone first.
2. Observe actual Nest target/room readings, manual-change pause and Pause restoration. For a room fan, begin with it off and test threshold start, hysteresis stop and manual override. Temperature/fan rules require Resume after a bridge restart.
3. Enable one combined presence rule and verify Apple Home occupancy, fault behavior, holds, Away delay and timed overrides. Polling may miss motion pulses shorter than 15 seconds.
4. Record hardware results before expanding scope. Ask before npm publication.

The beta.6 npm publisher release asset labels its result report beta.5; this is cosmetic and does not affect the installed package or execution installer. The checkout helper is corrected after release, with a version-report regression assertion. Use the current checkout helper if npm publication is approved; keep the released assets immutable.

The local checkout is a synthetic snapshot with pre-existing changes. Do not push its Git history. Use GitHub tree/commit/ref tools against the inspected remote base and preserve submodule entries. Private deployment details and credentials do not belong in public documentation.
