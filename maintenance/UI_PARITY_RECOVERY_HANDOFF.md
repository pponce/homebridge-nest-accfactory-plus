# Config UI parity and restart recovery

Objective: one climate interface in Homebridge and the standalone web dashboard; resume previously active rules after fresh checks; preserve user pauses; accept explicitly confirmed built-in sensors without optional scheduling metadata.

Repository: pponce/homebridge-nest-climate-cntrl. Base main: 59e0c8f3dca280490fe64f5d66bbd743ad17ebfa (beta.19). Feature branch: feature/config-ui-parity-recovery. Target: beta.20.

Implemented locally: shared application packaging and Homebridge host transport; shared validated private climate routes; connection/schema setup with separate save handling; typed advanced rule/device schema; runtime labels; restart pause option default off; preserved room targets, pending commands and manual fan overrides; confirmed built-in sensor feedback separated from native sensor schedule mutation capability; sensor reconnect freshness.

Validation: 127 focused tests passed. Feature head 1905898ce88c059bd9996f994326a4d6737e3a6b passed all six Node/Homebridge combinations, lint, coverage, build, migration, embedded/standalone browser and production package checks. Test run 42675040232 and dashboard run 42675040057 passed. All 23 publisher and 14 installer scenarios passed for beta.20. Physical Nest and live Homebridge behavior not yet verified.

Decisions: no npm publication from this workspace. Active rules continue only after normal runtime checks. Explicit pauses and ambiguous command feedback stay paused. No missing scheduling mode is inferred. Native sensor-setting writes still need complete validated data. Homebridge outer Save is disabled during climate editing; native connection form saves use Homebridge, and revision polling blocks known stale form saves.

Next: run maintenance/publish-beta20.sh to publish the tested beta.20 package to npm beta, then install/update through Homebridge and verify the live thermostat rule. No live installation changes have been performed.

Integration: PR #17 merged. Feature head 1905898ce88c059bd9996f994326a4d6737e3a6b. Main release commit f6d21c57650956b1a8afcb861da60f7943515a37. GitHub beta.20 is published. Main test run 42675437654 and release run 42675437704 passed every job, including browser, six compatibility combinations and production package validation. Publication wrapper prepared at maintenance/publish-beta20.sh, pinned to that commit and helper SHA256 ef97ffb62a77ee2bec7cb255bf43e9a2eeebe1572540ca18593776b08ba43a70. Release target and tag both match the release commit. GitHub asset metadata confirms the pinned helper checksum. Tarball SHA256: 07e6ae1f470fc28acdc5444786f70d70fab581275b2e97316f46cd4b731799cd. No npm publication or live Homebridge installation has been performed.


## Copy-and-paste handoff

```text
Objective: full Homebridge/web climate UI parity, automatic restart recovery, and confirmed built-in sensor support without optional scheduling metadata.
Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
Branch: feature/config-ui-parity-recovery merged to main through PR #17.
Release: v0.5.0-beta.20; commit f6d21c57650956b1a8afcb861da60f7943515a37; GitHub published.
Completed: shared application and save validation; complete climate editors/options; separate connection setup; runtime rule labels; restart pause option default off; preserved targets/manual policies; sensor validation and reconnect fixes.
Testing: 127 focused local tests; all six Node/Homebridge combinations, lint, coverage, build, migration, browser and production package checks; 23 publisher and 14 installer scenarios passed.
Decisions: retain intentional pauses and manual fan overrides; never infer missing native schedule/hold mode; require complete feedback for native sensor-setting writes; npm publishing stays with the maintainer.
Outstanding: physical Nest/HomeKit and live Homebridge verification after installation.
Next: run maintenance/publish-beta20.sh to publish npm beta. Update the plugin in Homebridge, reload its Settings, verify Upstairs Zone reports applied once requirements pass, then restart once to confirm automatic recovery. Resume any already-paused rule explicitly.
```
