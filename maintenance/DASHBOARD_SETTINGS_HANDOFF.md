# Dashboard settings checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Baseline: 79bc82c130ffd3b8dc7c14fd6e9b43b7e4182884. Latest release: v0.5.0-beta.9.

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

- Compatibility/browser CI, final review, and installed-system confirmation. No live installation has been changed.
- User requested GitHub beta.10 release and npm publisher script. Prepare only after required checks; do not publish npm from this environment.

## Decisions and next steps

Homebridge UI source documents short-lived service-token authentication in src/core/auth/auth.service.ts, the child metadata GET endpoint in src/modules/status/status.controller.ts, and PUT /api/server/restart/:deviceId in src/modules/server/server.controller.ts. Use these supported APIs; do not signal processes or patch installations. Keep credentials entirely server-side and restart only this identified child bridge.

Finish restart feature, test failure paths and browser reconnection, inspect GitHub checks, then record exact completion status here.
