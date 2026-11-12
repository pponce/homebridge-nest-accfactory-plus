# Overview rule explanations

## Objective

Show why each rule-assigned fan is on or off and at its reported speed, why each combined presence output is Home or Away, and how thermostat targets are calculated.

## Repository and branch

- Repository: `pponce/homebridge-nest-climate-cntrl`
- Branch: `feature/overview-rule-explanations`
- Pull request: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/28
- Base: released `v0.6.3`, commit `662bd0ca9b3112506daca93cc6ba3771ef1d6dbb`
- Local workspace: `homebridge-nest-climate-cntrl` under the current workspace. Its local snapshot commits are not remote ancestry; remote commits use the GitHub tree API.

## Completed changes

- `src/climate-explanations.js` captures display-safe evidence after completed engine evaluations. Explanations are not persisted with automation state.
- `src/climate-automation.js` exposes explanations and persists the last time each presence input was observed active. Reporting does not change the control decisions or hold/away timers.
- Overview displays one card per assigned fan, selected and competing rules, temperature inputs and average, run thresholds, speed curve and supported speed, pending feedback, cooldowns, manual overrides and restoration.
- Presence cards show current/last-known combined output, each input's detected and effective state, motion hold expiry, Away delay, manual override and unavailable input handling.
- Thermostat details show source readings, average, physical Nest temperature, bounded compensation, target origin, requested/reported targets and timing.
- UI uses DOM text nodes, marks stale status, and retains expanded fan/presence details through refreshes. Both dashboard hosts use the same application.
- Public documentation and an Unreleased changelog entry describe the current feature.

## Validation

- 105 automation tests pass locally, including five explanation regression scenarios.
- Existing dashboard/control/source tests pass locally (150 tests including automation).
- New explanation module coverage: 100% lines, 94.53% branches, 100% functions. Reviewed floor: 100/90/100.
- Local Chromium cannot launch because its required socket is unavailable; local Homebridge accessory tests lack the Homebridge package. CI supplies these dependencies.
- Browser regression fixture checks both hosts, mobile overflow, safe sensor-name rendering, reported/requested settings, holds, Away delay, overrides, unavailable/stale status, refresh persistence and absence of control requests.
- Full CI must be green before considering the branch ready.

## Decisions and remaining work

1. Use only saved rules and completed evaluation evidence. Do not recompute runtime decisions from unsaved UI drafts.
2. Source read timestamps and observed activity timestamps are not complete physical-device event history.
3. Preserve existing automation behavior. No live-device commands or installation changes were made.
4. Finish GitHub checks and resolve failures. Hardware behavior remains unverified until installation.
5. This feature is not yet versioned or published to npm. Prepare a versioned release and publication helper when requested.
