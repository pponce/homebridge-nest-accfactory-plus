# Dashboard temperature units checkpoint

Updated: 2026-11-08 (Pacific).

## Objective and repository

Provide a shared Celsius/Fahrenheit preference in both the standalone dashboard and Homebridge configuration UI, publish a tested GitHub beta, and supply the npm publisher for the maintainer to run.

Repository: `pponce/homebridge-nest-climate-cntrl`. Branch: `feature/dashboard-temperature-units`, fast-forwarded to `main`. Base: `82342652ca969e531781f3ec7b30dfa00791fc83`. Beta.7 source: `e25bec05e589972da2b4c0e48ea07cdd62d124fd`.

## Completed changes

- Standalone: **Settings → Your dashboard → Temperature units**.
- Homebridge custom configuration: **Dashboard preferences → Temperature units**. The standard schema form also exposes **Dashboard temperature units** under **Web dashboard**.
- Shared persisted platform option: `dashboardTemperatureUnit`, `C` or `F`, default `C`. The authenticated dashboard config API exposes it as `config.temperatureUnit`, validates the enum and excludes preference-only changes from bridge-restart detection.
- Thermostat readings, schedules, source lists, previews, execution status, room targets, fan thresholds, adjustment limits and hysteresis display in the selected units. Nest and Apple Home retain their own display-unit settings.
- Shared conversion functions in `homebridge-ui/public/climate-utils.js` distinguish absolute temperatures from differences. Rules and commands continue to use Celsius internally. Switching units does not rewrite rule values, including fractional targets.
- Converted input ranges, required values and browser validity checks block unsupported entries. Explicit selector names support assistive technology and reliable UI automation.
- README, setup guide, beta.7 notes, package schema, tarball checks and versioned install/publish helpers are updated. No npm publication is performed by GitHub release creation.

## Verification

- 56 focused engine/dashboard/API tests pass locally, including conversion boundaries, preference persistence, unchanged rule data and credentials, and no restart for a preference-only change.
- Branch validation `42545692051` passes all six supported Node/Homebridge combinations and embedded, standalone desktop/mobile and HTTPS reverse-proxy browser suites. Browser tests cover preference save/reload/discard, Fahrenheit targets and gaps, converted limits, unchanged rules on unit-only saves and no direct Nest commands from preference changes.
- Publisher scenarios and installer failure/recovery checks pass locally. npm publisher result reports correctly identify beta.7.
- Release validation run: `42545865990`. Main Test run: `42545866073`. Both passed. GitHub beta.7 is published; production tarball installation and both helper scenario suites passed. npm publication is left to the maintainer’s explicitly requested terminal script.
- Physical equipment was not contacted or changed. Temperature compensation remains the beta.6 heating-only engine; no control algorithm changes are part of the unit preference.

## Release assets

https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.7

- Package SHA256: `086cc4b9d6de234f1b11edc596add4d144b85ae721160c1b5a9edc252da792d8`.
- npm publisher SHA256: `6564f9845bb747cf1184f98b342ede2acabbd4a0b635084f369433595e35b855`.
- Installer SHA256: `16b183f1b8372bfdd06bae3d1f74755c9b76d6ec61d7ad8bf61547e7d5a3b994`.

All hashes were verified against GitHub release asset metadata. The publisher and installer have distinct purposes; running the publisher does not update the running plugin.

## Next steps

1. Run the beta.7 publisher from the existing project checkout when ready to publish to npm's `beta` tag. It verifies the tested GitHub tarball, authenticates in the operator's terminal, avoids repeating accepted uploads and prints a report-copy command. It does not install or restart Homebridge.
2. Install beta.7, select Fahrenheit in either configuration UI and save. Refresh other open dashboards. A unit-only change does not need a bridge restart; an installation restart still requires explicit Resume for enabled temperature/fan rules.
3. Confirm existing targets retain their meaning and test a temperature group/fan rule using the desired display units. Record real hardware observations before expanding execution scope.

Keep project notes in `maintenance/`, exclude private deployment data and credentials, and preserve remote Git history/submodule entries. The local source snapshot has pre-existing changes; do not push its synthetic Git history.
