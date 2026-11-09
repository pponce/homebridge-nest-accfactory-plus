# Heating response and tuning checkpoint

## Objective and repository

Add thermostat heating-type settings, bounded local response history and per-temperature-rule interval/adjustment recommendations, with explicit Apply. Repository: `pponce/homebridge-nest-climate-cntrl`. Target: `main`. Implementation/validation branch: `feature/heating-response`. Base: `ea2391f884bb53362afea2d19e15c077a00324a7` (v0.5.0-beta.8).

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
- Chromium cannot start in this environment because its process-singleton socket is prohibited. The real-server browser fixture is included in the existing GitHub browser runner.
- npm dependency downloads are blocked in this environment. The existing GitHub validation workflow runs formatting, the six Node/Homebridge combinations, package/coverage checks, migration and browser fixtures on the feature branch before promotion to main.

## Important decisions and pending work

- Collecting observations never automatically applies guidance. Applying starting/learned recommendations is a separate, explicit per-rule action.
- Confidence is observational, not statistical or proof of causality. Numeric presets and recommendation formulas are documented in `WEB_DASHBOARD.md`.
- All six compatibility configurations and all four browser suites passed on implementation revision `978de3a919df3860cbe805a768b513969c1535e9`, in GitHub Actions run `42550745332`. This includes project lint, coverage, build and migration restoration.
- Desktop and 390px mobile screenshots were inspected. A final UI-only adjustment places the live schedule-time-zone field in the heating section; browser captures reset scroll/focus and clear toasts for review. Final branch validation runs before main promotion.
- Screenshot artifacts are stored on `review/heating-response`; the publication helper records the exact tested source revision.
- No npm publication or new release is requested by this feature task. Installed-system observation still needs multiple days of real heating cycles after a future install.
