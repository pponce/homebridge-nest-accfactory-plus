# Temperature-based fan speed checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Baseline: 531c1bf2e2329249cba9739a6c24294eb89a1eaf, following GitHub release v0.5.0-beta.10.

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

## Remaining

Prepare the next beta release when requested; beta.10 does not contain this feature. No release version changed and no npm publication or live installation performed. Physical fan behavior still requires installed-system confirmation. After release, start with one fan, review reported speed steps, enable a conservative cap, and verify startup, speed adjustment, stop threshold and manual override. API acknowledgment and tests do not prove physical motor behavior; the rule limits the speed values it sends and cannot constrain manual controls or a fan’s internal startup behavior.
