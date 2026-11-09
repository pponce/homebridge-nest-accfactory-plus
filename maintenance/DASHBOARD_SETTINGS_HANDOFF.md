# Dashboard settings checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Released: v0.5.0-beta.10 at d2cbf15a721fccc8427ce80bd52f8979868d5b8c; previous release v0.5.0-beta.9.

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

## Validation and release

- Combined code commit d18235105e2ab646b8f5b1f3d6e3137642f70884 passed all six compatibility configurations and browser suites in Test run 42558226404.
- Publisher and installer helper fixtures passed for beta.10; version/lock/release-marker metadata agrees.
- Release workflow 42558419266 passed all six compatibility configurations, browser suites, package checks, and publication-helper checks. GitHub prerelease v0.5.0-beta.10 is published; its tag points to d2cbf15a721fccc8427ce80bd52f8979868d5b8c.
- GitHub asset digests verified: package SHA256 62f85fb5053bf74699cbac7a96b1f95c4d425fd1c73f53fb6cf21c140ebe250d; publisher b5b6d37b88edf83db59b5361353cf54a76a7dae0396bc2b4c15467ffc7118c78; installer d2712f13cff7b1043f03adcac6b3e27731dcfd7958f7886a45cc6638a7a9f5ca.
- Lockfile changes for the release are limited to version values and whitespace.
- Maintainer-run npm publication and installed-system confirmation remain pending. No live installation has been changed.

## Decisions and next steps

Homebridge UI source documents short-lived service-token authentication in src/core/auth/auth.service.ts, the child metadata GET endpoint in src/modules/status/status.controller.ts, and PUT /api/server/restart/:deviceId in src/modules/server/server.controller.ts. Use these supported APIs; do not signal processes or patch installations. Keep credentials entirely server-side and restart only this identified child bridge.

Run the checksum-verified beta.10 publisher from the existing checkout. Confirm its final verified result, then install using the release installer or Homebridge's normal plugin update flow. Refresh the dashboard and explicitly Resume enabled temperature/fan rules. Confirm the detected zone and manual override, one native Nest presence input with saved selections preserved, and child restart/reconnection after a setting that requires restart. Verify unavailable restart access offers Homebridge guidance. Do not publish npm from this development environment.

## Related feature

Temperature-based fan speed is implemented on main and validated at 7e0cd70ff87e54250777fc155bf882b434b93d89. It is not part of beta.10. See [FAN_SPEED_HANDOFF.md](FAN_SPEED_HANDOFF.md) for implementation, testing and next-release details.
