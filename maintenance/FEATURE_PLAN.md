# Nest Climate Cntrl — feature plan

Updated: 2026-11-06

This file tracks maintainer planning for the thermostat and heating direction of `pponce/homebridge-nest-accfactory-plus`. It is not a list of released features. The selected product name is **Nest Climate Cntrl**; package/repository migration is a separate workstream.

## Feature roadmap

| Workstream | Agreed direction |
| --- | --- |
| Thermostat dashboard | Status, schedules, runtime and diagnostics inside the plugin's Homebridge settings. Verify completion against the active implementation branch. |
| Native thermostat controls | Eco controls, a “Temperature controlled by” selector for native sources, and optional HVAC fan-timer controls disabled by default. Verify completion against the active implementation branch. |
| Room and ceiling fans | Select accessible Homebridge fans and coordinate them with heating/cooling. Keep room fans distinct from the thermostat's HVAC blower. Detailed behavior remains to be designed. |
| Mixed room-sensor control | **Approved for the feature plan; implementation pending.** Combine genuine Nest sensors and other accessible Homebridge temperature sensors in one thermostat control group. Details below. |

## Mixed room-sensor control

### Objective and scope

Let a user choose which rooms influence a Nest thermostat, regardless of whether their temperature readings come from genuine Nest sensors or other Homebridge accessories. Support a mixed selection in the same group; do not require choosing one sensor brand or ecosystem.

This is optional software-managed control, disabled by default. The plugin calculates bounded changes to Nest's target temperature. It does not register third-party devices as native Nest sensors or emulate their Bluetooth protocol.

The group controls one thermostat/HVAC zone. It does not create independent physical room zones.

### Supported input sources

| Source | Planned access |
| --- | --- |
| Thermostat's own measured temperature | Existing Nest/Google connection; preserve the physical reading separately from any normalized remote-sensor display value. |
| Genuine Nest room sensors | Existing Nest/Google connection, using individual sensor identities and readings. |
| Other Homebridge temperature sensors | Readable standard temperature characteristics on accessible main or child bridges. |
| Sensors visible only in Apple Home | Outside the initial scope unless another integration makes their readings available to Homebridge. |

Reuse the bridge-discovery approach from `pponce/homebridge-harmony-home-control` where appropriate, adapting it for read-only temperature services. Its current picker filters for writable services, so it cannot be reused unchanged.

Use stable source identities, deduplicate genuine Nest sensors that also appear through Homebridge, and exclude synthetic readings derived from this controller to prevent feedback loops. Access remains subject to the bridge's supported accessory-control configuration and authentication.

### Selection and aggregation

Planned options:

- One preferred room/sensor.
- Equal average of selected sensors.
- Weighted average, with explicit relative influence per sensor.
- Scheduled changes to selected rooms or their weights.

Expose source name, bridge, measured temperature, availability, and freshness information where the provider supplies it. A successful Homebridge read is not proof of a new physical measurement, and an unchanged temperature is not proof of a stale sensor. Define eligibility using the available source health and timestamp information.

Configure these options per thermostat through the settings dashboard. Keep the user's desired room temperature separate from the compensated target actually sent to Nest.

### Coordination with Nest

Use one software controller per thermostat. Keep native sensor selection and software-managed groups as explicit modes within “Temperature controlled by.”

The initial design uses Nest's built-in sensor as the thermostat's internal control source while the plugin reads the selected room sensors. Genuine Nest room sensors remain input candidates even when they are not selected for native control; verify this behavior on supported hardware.

Before enabling adjustments:

1. Confirm the actual temperature source controlling Nest and obtain its trustworthy reading.
2. Establish how to keep that source stable and detect native schedule/source changes.
3. Confirm valid selected sensor data, thermostat mode, and the user's desired room target.

A starting compensation model is:

```text
Nest target = desired room target
            + (Nest's actual control temperature - selected-room temperature)
```

Apply unit normalization, device-supported rounding, a configurable bounded offset, absolute target limits, and a tolerance/minimum update interval. Validate the control behavior under changing room temperatures; the formula alone is not a tested controller.

Do not overwrite measured temperatures to make the physical thermostat appear to accept external data. If Nest changes its active source unexpectedly, pause compensation and explain the reason rather than continuing with an assumed source.

### Manual changes, failures and recovery

- Respect Off, Eco/away behavior, user-defined schedules, manual changes and equipment limits. Final precedence must be explicit before implementation.
- Recognize acknowledgments of the plugin's own writes so they are not mistaken for manual overrides. A direct manual change should pause software compensation under the selected override policy.
- For failed/invalid inputs, apply a visible, configured policy: use the remaining eligible sensors only when allowed, or suspend the group and return to normal Nest control.
- Restore settings only when they are still owned by this controller; never overwrite a newer manual change using an old snapshot.
- Persist enough controller intent to reconcile restart state without immediately replaying an obsolete adjustment.
- On a cloud failure, stop issuing adjustments and show the last confirmed thermostat state.
- **A stopped Homebridge host or unavailable Nest connection cannot send a fallback command.** Nest may continue with its last accepted compensated target. Bound adjustments accordingly and explain this limitation in setup.
- Preserve Nest's built-in equipment protections. Avoid rapid target/mode changes and validate actual HVAC behavior, including cycling, on hardware.

### Dashboard behavior

Show the selected group, contributing sensors, effective room temperature, desired room target, actual Nest target, adjustment, and controller state (active, paused, degraded, or unavailable).

Provide enable/pause controls and a clear route back to native Nest control. Sensor selection should identify names and bridges, include child bridges, and keep the original physical sensor accessories available.

Resolve the Apple Home representation before implementation: the user must be able to distinguish the desired room target from the physical Nest target without breaking existing accessory identities.

### Proposed delivery sequence and validation

1. **Read-only discovery and preview:** list sensor sources, verify deduplication and health handling, calculate the proposed room temperature/adjustment without writing thermostat settings.
2. **Heating pilot:** implement a single preferred sensor and equal-average groups, bounded compensation, stable native-source handling, manual overrides, disable/recovery behavior and dashboard status.
3. **Expanded selection:** weighted averages and scheduled groups after the core controller is validated. Cooling and heat/cool range modes require their own design and verification before enabling them.

Acceptance checks should cover mixed Nest/non-Nest groups, main/child bridges, Celsius/Fahrenheit conversion, missing/invalid readings, duplicate inputs, unknown measurement age, source changes, manual commands, restart, cloud loss and all-sensors-unavailable behavior.

Use deterministic control tests and a read-only preview before a hardware trial. No live thermostat changes or npm publication are authorized by this planning entry.

## Continuation checkpoint

- **Objective:** add mixed room-sensor control to the planned Nest Climate Cntrl feature set.
- **Repository:** `pponce/homebridge-nest-accfactory-plus`.
- **Plan branch/path:** `main`, `maintenance/FEATURE_PLAN.md`.
- **Completed in this update:** recorded the approved mixed-source scope, proposed control architecture, dependencies, behavior requirements and validation sequence.
- **Implementation/testing:** planning document only; no feature code or hardware behavior changed or tested.
- **Open decisions:** source-control commands and hardware verification; freshness policy when a provider has no measurement timestamp; manual override/schedule precedence; adjustment defaults; Apple Home target representation.
- **Next step:** reconcile with the thermostat dashboard development branch, then implement read-only sensor discovery and a calculation preview. Validate Nest's physical control-temperature field and native-source selection before implementing thermostat writes.
