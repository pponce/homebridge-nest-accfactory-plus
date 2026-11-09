# Heating response and tuning checkpoint

## Objective and repository

Add thermostat heating-type settings, bounded local response history and per-temperature-rule interval/adjustment recommendations, with explicit Apply. Repository: `pponce/homebridge-nest-climate-cntrl`. Delivered on `main`. Implementation/validation branch: `feature/heating-response`. Base: `ea2391f884bb53362afea2d19e15c077a00324a7` (v0.5.0-beta.8).

## Implementation

- `src/heating-response.js` owns passive observation, bounded persistence, cycle qualification, confidence and recommendations. Raw history retains up to 48 hours/2,880 samples per rule; summaries retain 30 days/128 cycles. Collection is off by default, enabled per thermostat and independent of rule enablement.
- Starting suggestions: forced air 10 minutes/1°C; radiators 20 minutes/0.75°C; in-floor radiant 30 minutes/0.5°C. These are provisional plugin heuristics, not manufacturer specifications.
- Learned suggestions require six usable cycles across three days, spanning at least 48 hours. Higher confidence requires 12 cycles/five days/96 hours and consistent offsets. Evidence includes lag, mean warming rate, coast duration/rise, near-target Nest-to-room difference and overshoot.
- Heat must start under observation and its coast must settle. Missing/stale inputs, downtime, changing setpoints and implausible cycles invalidate partial observations. Response can first appear after heating stops. Restart retains completed evidence but never resumes a partial cycle.
- Sensor-set, target, thermostat, aggregation, heating-type and time-zone changes reset the observation period. Reordering identical sensors does not. Disabling collection clears its local history.
- `ClimateAutomation` collects using its existing inputs and queue, including external temperatures for disabled rules when observation is enabled. Storage failures remain separate from equipment execution. Existing target compensation, command limits, native precedence and restart/resume behavior are retained.
- Authenticated GET `/api/heating-response` presents recommendations. CSRF-protected POST `/api/heating-response/apply` validates current config revision and recommendation identity, saving only the requested rule's interval and offset. No explicit equipment command is sent by Apply; active rules use saved values on their normal check.
- Settings includes each thermostat's Heating response & tuning section, evidence, confidence and per-rule Apply controls. Pending edits disable Apply. Temperature differences convert correctly to Fahrenheit. Live updates replace recommendation content without rebuilding settings inputs.

## Validation

- 90 local tests pass across observation, rule execution, external sources, config and dashboard API suites. Checks cover multi-day qualification, sensor resets, interruptions, post-shutoff radiant response, persistence/retention/failures, disabled-rule collection, optimistic Apply conflicts and session/CSRF boundaries.
- All four GitHub browser suites pass, including the real-server heating fixture: explicit Apply, no equipment commands, Celsius/Fahrenheit differences, pending-edit protection, completed-save synchronization, refresh focus and mobile layout. Desktop and 390px phone screenshots were visually reviewed. Local Chromium is prohibited by the environment, so browser validation ran in GitHub.
- All six Node/Homebridge configurations pass project lint, tests, coverage, build and migration restoration. Final tested implementation: `b8c6f8d44c37f22621192434c4b6587f7213052a`; workflow run: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42551239263.
- Local build and production-package inclusion/import checks pass for the observer, execution engine and configuration modules. No package was uploaded.
- Exact-revision fixture screenshots: https://github.com/pponce/homebridge-nest-climate-cntrl/tree/review/heating-response. They contain synthetic data only.

## Important decisions and pending work

- Collecting observations never automatically applies guidance. Applying starting/learned recommendations is a separate, explicit per-rule action.
- Confidence is observational, not statistical or proof of causality. Numeric presets and recommendation formulas are documented in `WEB_DASHBOARD.md`.
- The live schedule-time-zone field belongs in the heating section; accessory settings identify the restart requirement separately.
- The main promotion adds only this completion note after the tested implementation. Documentation-only completion metadata does not repeat the already-passed code checks.
- No npm publication or new release was requested or performed. Package/release markers remain v0.5.0-beta.8; this feature is unreleased source on main.
- Next release task: select a new beta version, update versioned helpers/release marker and prerelease notes, then run the existing release workflow. Obtain publication authorization before uploading to npm.
- After installation: select heating type and enable observation in Settings, save, and leave it running through at least six complete cycles across three days/48 hours. Check sensor/source availability, local history retention, evidence and recommendation confidence against actual room behavior. Apply to an individual rule only when its proposed limits are desired.
- Physical heating behavior and multi-day real-home learning have not been verified by the synthetic tests.
