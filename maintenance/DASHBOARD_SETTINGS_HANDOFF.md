# Dashboard settings checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Baseline: 79bc82c130ffd3b8dc7c14fd6e9b43b7e4182884. Release target: v0.5.0-beta.10; previous release v0.5.0-beta.9.

## Objective

Provide Nest schedule time-zone choices with automatic detection, clarify thermostat versus selected source roles, and offer a scoped child-bridge restart after changes that require it.

## Completed changes

- Automatic zone from the thermostat TimezoneTrait, then its explicitly paired home; validated named zones only. No browser or host inference.
- Existing manual choices take priority. Embedded and standalone pickers offer common friendly names and other supported zones. Live updates preserve selection and focus.
- Schedule previews, rule execution and heating evidence use the effective zone; changes reset evidence and pause active scheduled holds.
- Rule editor explains that only selected sources count toward the average; the controlled Nest need not be a source.
- Time-zone commit: 97d684176c212c04d1d9a7462b2ae1d93a1163ca on main. All six compatibility configurations and browser suites passed (Test run 42556905883).
- Added scoped child restart through authenticated loopback Homebridge UI API, revision checks, pending-save protection, and browser reconnection. No signals, shell commands, or live installation patches.
- Merged duplicate native/Homebridge occupancy inputs by serial identity; saved source aliases remain supported and generated rule outputs stay excluded.

## Pending

- Combined code commit d18235105e2ab646b8f5b1f3d6e3137642f70884 passed all six compatibility configurations and browser suites in Test run 42558226404.
- Publisher and installer helper fixtures passed for beta.10; version/lock/release-marker metadata agrees.
- Release workflow, asset verification, and installed-system confirmation pending. No live installation has been changed.
- User requested GitHub beta.10 release and npm publisher script. Prepare only after required checks; do not publish npm from this environment.

## Decisions and next steps

Homebridge UI source documents short-lived service-token authentication in src/core/auth/auth.service.ts, the child metadata GET endpoint in src/modules/status/status.controller.ts, and PUT /api/server/restart/:deviceId in src/modules/server/server.controller.ts. Use these supported APIs; do not signal processes or patch installations. Keep credentials entirely server-side and restart only this identified child bridge.

Finish restart feature, test failure paths and browser reconnection, inspect GitHub checks, then record exact completion status here.

## Discussion queued for a later feature

Temperature-based fan speed remains a proposal, not part of beta.10. Suggested settings: desired temperature, start gap, stop gap, minimum running speed, maximum speed, and temperature gap at maximum speed. Example 72°F target, start at 74°F/25%, 76°F/50%, cap at 78°F/75%, stop at 72.5°F. Only fans exposing writable speed would participate. Discussed respecting supported device steps and manual overrides. No speed-control implementation or device changes are authorized by the discussion alone.
