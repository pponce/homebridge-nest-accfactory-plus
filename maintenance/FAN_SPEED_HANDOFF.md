# Temperature-based fan speed checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Released: v0.5.0-beta.11 at c7174c1462d330d893a125d81874e5bd35898857. Previous release: v0.5.0-beta.10.

## Objective

Add optional room-fan speed control based on the temperature above a comfort target, with separate start/stop gaps and a user-defined maximum speed. Existing on/off rules retain their behavior.

## Implementation

- Run condition `temperature-speed`; stored Celsius target/gaps and percentage minimum/maximum speeds.
- Shared linear curve and HAP speed-step model; both Fan and Fanv2 use readable/writable RotationSpeed. Timed/additional-authorization characteristics are excluded. Fresh feedback is required.
- Nearest supported positive speed between minimum and cap; ties use the lower step. Never send a speed above the cap. Unsupported fans do not fall back to on/off.
- Set speed first, wait for feedback, then explicitly turn on only if needed. Speed setters that also start fans need no separate on command.
- One minute between normal adjustments, five percentage-point deadband except curve endpoints, immediate reduction to a lower cap.
- Power/speed changes outside the rule pause it. Persisted ownership permits bounded restoration; previously running fans remain running at their earlier speed within the cap. An owned fan stops when no supported restoration speed fits a reduced cap. Reconnection retries restoration; bridge restart requires Resume.
- Standalone editor includes F/C inputs, live curve table, per-fan supported-step preview and execution feedback. Embedded source discovery labels speed-capable fans.
- Documentation in README.md and WEB_DASHBOARD.md; new runtime module src/fan-speed-control.js and shared model homebridge-ui/public/fan-speed.js.

## Validation

Focused engine, curve, HAP discovery/write, configuration and web tests: 81 passed locally. New runtime module measured 100% lines, 99.14% branches and 100% functions. Coverage floor added without reducing existing floors. Package dry-run confirms that the controller, shared model and dashboard are included.

Feature commit 7e0cd70ff87e54250777fc155bf882b434b93d89 passed all six compatibility configurations (Node 22/24/26 and supported Homebridge 1/2 combinations), lint/build/coverage, migration checks and all browser suites in Test run 42560596789. The real-dashboard browser fixture passed Fahrenheit/Celsius, curve display, supported caps, saved configuration, disabled-draft behavior, staged startup, manual overrides, focus preservation and mobile layout. A multi-fan command conflict retains ownership of other changed fans so they can be restored.

## GitHub release

Release workflow 42561068585 passed all six compatibility configurations, browser suites, production-package installation checks and both publication-helper fixture suites. GitHub prerelease v0.5.0-beta.11 is published and its tag matches c7174c1462d330d893a125d81874e5bd35898857.

Verified GitHub asset SHA256 digests:

- Package: 3cb4ef18ece72011aa8c8044eee33510fccaaa3d4466342c878695bdd8eeac3a
- Publisher: 407bc7b32fa958158e79ba4c606b458a9ebeb1b18b42ddec2555a0bdf2357107
- Installer: 7d6584973b5af319df729e368177ed2c34e5dc50b284e17977b7efa355959293

## Remaining

Run the checksum-pinned beta.11 publication helper from the existing checkout; it publishes the tested release tarball with the npm beta tag and verifies registry integrity. Maintainer-run npm publication remains pending; no live installation was changed. Physical fan behavior still requires installed-system confirmation. After release, start with one fan, review reported speed steps, enable a conservative cap, and verify startup, speed adjustment, stop threshold and manual override. API acknowledgment and tests do not prove physical motor behavior; the rule limits the speed values it sends and cannot constrain manual controls or a fan’s internal startup behavior.

