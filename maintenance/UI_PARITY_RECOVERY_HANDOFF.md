# Config UI parity and restart recovery

Objective: one climate interface in Homebridge and the standalone web dashboard; resume previously active rules after fresh checks; preserve user pauses; accept explicitly confirmed built-in sensors without optional scheduling metadata.

Repository: pponce/homebridge-nest-climate-cntrl. Base main: 59e0c8f3dca280490fe64f5d66bbd743ad17ebfa (beta.19). Feature branch: feature/config-ui-parity-recovery. Target: beta.20.

Implemented locally: shared application packaging and Homebridge host transport; shared validated private climate routes; connection/schema setup with separate save handling; typed advanced rule/device schema; runtime labels; restart pause option default off; preserved room targets, pending commands and manual fan overrides; confirmed built-in sensor feedback separated from native sensor schedule mutation capability; sensor reconnect freshness.

Validation: focused automation, sensor, dashboard and configuration tests; browser fixtures updated for the shared application. Full Node/Homebridge, lint, coverage, browser and package validation pending in CI. Physical Nest and live Homebridge behavior not yet verified.

Decisions: no npm publication from this workspace. Active rules continue only after normal runtime checks. Explicit pauses and ambiguous command feedback stay paused. No missing scheduling mode is inferred. Native sensor-setting writes still need complete validated data. Homebridge outer Save is disabled during climate editing; native connection form saves use Homebridge, and revision polling blocks known stale form saves.

Next: pass CI on the feature branch, review the final diff, integrate into main, publish GitHub beta.20, then provide the pinned npm publication script. No live installation changes have been performed.
