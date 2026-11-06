# Nest Climate Cntrl — feature plan

Updated: 2026-11-06

This file tracks maintainer planning for the thermostat and heating direction of `pponce/homebridge-nest-accfactory-plus`. It is not a list of released features. The selected product name is **Nest Climate Cntrl**; package/repository migration is a separate workstream.

## Feature roadmap

| Workstream | Agreed direction |
| --- | --- |
| Thermostat dashboard | Status, schedules, runtime and diagnostics inside the plugin's Homebridge settings. Verify completion against the active implementation branch. |
| Native thermostat controls | Eco controls, a “Temperature controlled by” selector for native sources, and optional HVAC fan-timer controls disabled by default. Verify completion against the active implementation branch. |
| Room and ceiling fans | Select accessible Homebridge fans and coordinate them with heating/cooling. Keep room fans distinct from the thermostat's HVAC blower. Detailed behavior remains to be designed. |
| Coexistence and migration | Target alias `NestClimateCntrl`; no weather; preserve existing accessory UUIDs and guide the installed-version migration after validation. Details below. |
| Sensor-assisted climate presence | Proposed: selected accessible Homebridge motion/occupancy inputs can inform climate presence. Existing Google Home/Away reporting stays distinct; implementation and policy decisions pending. |
| Mixed room-sensor control | **Approved for the feature plan; implementation pending.** Combine genuine Nest sensors and other accessible Homebridge temperature sensors in one thermostat control group. Details below. |

## Coexistence, identity and migration

### Agreed product direction

- The climate plugin will not expose weather accessories. The current implementation still loads `weather.js`; remove its discovery and UI/configuration surface deliberately, including owned cached weather accessories, before release.
- Target Homebridge platform alias: **`NestClimateCntrl`**.
- Upstream may run alongside this plugin for cameras and doorbells. Keep each physical or virtual accessory assigned to one plugin, including Nest Home/Away and Protect when enabled.
- Prefer separate child bridges for new dual-plugin setups. For an existing installation, preserve its current bridge pairing/username during the alias migration; moving accessories to a different bridge is a separate operation.
- Guide the maintainer through the existing-install migration after the feature work and migration validation are ready. No live installation change or npm publication is authorized by this planning update.

### Identity contract

The pinned shared `HomeKitDevice.generateUUID` derives an accessory UUID from:

```js
api.hap.uuid.generate(identityNamespace + '_' + serialNumber.toUpperCase())
```

It also supports equivalent runtime UUID APIs for the other supported backends. Upstream uses its developer-chosen plugin identifier, `homebridge-nest-accfactory`, as that prefix. It is not a Google-assigned namespace.

Preserve `IDENTITY_NAMESPACE = 'homebridge-nest-accfactory'` for existing accessories. The fork already separates this persistence prefix from package registration in `src/identity.js`. Changing the display name, platform alias or npm package does not require changing that prefix. A new namespace would change existing accessory UUIDs.

Shared namespace plus different serial numbers produces distinct accessories. Publishing the same device from both plugins produces duplicate ownership and potentially a UUID collision on one bridge; solve that with device ownership/exclusions, not by renumbering existing thermostats.

New software-generated climate-presence accessories need a stable purpose-specific identity, distinct from the existing Google Home/Away indicator.

### Migration work and acceptance

Update platform registration, schema alias, dashboard/config selection, examples and configuration migration consistently. Audit every `NestAccfactory` reference rather than performing an indiscriminate rename.

Homebridge caches both plugin and platform associations. UUID preservation alone does not establish safe alias migration. Design and test the transition before rollout, including old cached platform associations, restarts, supported Homebridge versions and both plugins installed. Any compatibility alias must not reintroduce ambiguous `NestAccfactory` routing with upstream installed.

Preserve bridge identity and accessory/service identities; avoid blanket cache clearing or removal/re-pairing as the default procedure. Verify existing thermostat rooms, scenes and automations on hardware before claiming those survive.

## Sensor-assisted climate presence — proposed design

The maintainer asked whether motion/occupancy sensors exposed through Homebridge, including camera motion from the upstream plugin, can influence climate Home/Away behavior. Record this as a proposed feature; final behavior and implementation remain pending.

### Current behavior and intended boundary

The existing Nest Home/Away accessory is a read-only HomeKit occupancy sensor reporting Google's structure mode. Updating its displayed occupancy alone does not change Google's Home/Away state or thermostat behavior.

Add a separate, accurately labeled **Climate presence** state, or an explicitly selected presence-source mode, for software-managed climate decisions. Keep Google's reported home state visible as its own factual value. Do not silently change the meaning or identity of the existing Nest status accessory.

The initial proposal influences only this plugin's configured climate actions. Writing Google's whole-home Home/Away mode requires separate protocol/capability verification and an explicit opt-in design: it could affect other Google Home behavior and cameras handled by upstream.

### Inputs and behavior

- Reuse planned authenticated main/child-bridge discovery for readable standard MotionSensor and OccupancySensor services. A camera must expose a usable motion/occupancy characteristic; video or an Apple Home-only notification is not sufficient.
- Sensors visible only in Apple Home require an explicit automation/integration route; they are not automatically visible to another Homebridge plugin.
- Let users select trusted indoor sensors. Any selected positive occupancy/motion event can assert or extend Home under the selected policy.
- Start with a Home-assist policy: motion can keep or restore climate presence to Home, while departure uses a more reliable source or explicit user action.
- Offer automatic Away after a configurable inactivity interval only as an opt-in policy. No motion does not prove an empty home, especially while sleeping.
- Missing/unreachable/stale inputs must not count as vacancy. Define restart and unknown-age handling without inventing sensor timestamps.
- Respect manual overrides and user-defined precedence among Google state, sensor inputs, schedules and climate actions. Avoid repeated cloud writes.
- Exclude the controller's own derived presence state from its input picker to prevent feedback loops.
- Show selected inputs, the reason for Home/Away, source health, any inactivity countdown and the active override in the dashboard.

Validate cross-plugin and child-bridge inputs, motion refresh, inactivity timing, unavailable inputs, restarts, manual overrides and cloud failures before enabling real climate actions.

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

- **Objective:** develop Nest Climate Cntrl with mixed room sensors, room-fan coordination and safe coexistence with upstream camera/doorbell support.
- **Repository/branch:** `pponce/homebridge-nest-accfactory-plus`, `feature/thermostat-dashboard`.
- **Planning files:** `maintenance/FEATURE_PLAN.md` and `maintenance/CLIMATE_HANDOFF.md`.
- **Decisions recorded:** no weather; target platform alias `NestClimateCntrl`; preserve existing accessory UUID namespace; guide the installed-version migration after feature completion and migration verification.
- **Proposal recorded:** sensor-assisted climate presence using accessible Homebridge motion/occupancy sensors; Home-assist first, automatic Away optional, Google whole-home writes a separate unverified capability.
- **Existing implementation/testing:** see `maintenance/CLIMATE_HANDOFF.md`. This update changes planning documentation only; it does not implement the alias, weather removal or presence control, and adds no new runtime/hardware test results.
- **Open decisions:** source-control commands and hardware verification; source health/measurement-age policy; manual override/schedule precedence; climate action defaults; Apple Home target/presence representation; migration of cached platform associations.
- **Next steps:** reconcile feature implementation with these requirements; remove weather; design and test the alias transition before rollout; build read-only main/child-bridge discovery and preview for temperature and presence sources before enabling control writes.
