# Nest Climate Cntrl — feature plan

Updated: 2026-11-09

Execution status: beta.6 implements opt-in bounded heating groups, Homebridge room-fan execution and combined occupancy accessories. See [EXECUTION_ENGINE_HANDOFF.md](EXECUTION_ENGINE_HANDOFF.md) for validation and remaining hardware trials. The design below includes future scope; weighting, scheduled groups, cooling/range compensation and derived-presence climate actions are not implemented.

This file tracks maintainer planning for the thermostat and heating direction of `pponce/homebridge-nest-climate-cntrl`. It is not a list of released features. The selected product name is **Nest Climate Cntrl**; repository rename is complete; the first climate beta uses the new package name.

## Feature roadmap

| Workstream | Agreed direction |
| --- | --- |
| Thermostat dashboard | Status, schedules, runtime and diagnostics inside the plugin's Homebridge settings. Verify completion against the active implementation branch. |
| Native thermostat controls | Eco controls, a “Temperature controlled by” selector for native sources, and optional HVAC fan-timer controls disabled by default. Verify completion against the active implementation branch. |
| Room and ceiling fans | Select accessible Homebridge fans and coordinate them with heating/cooling. Keep room fans distinct from the thermostat's HVAC blower. Temperature hysteresis and reported HVAC activity rules are implemented for beta.6. |
| Coexistence and migration | Alias `NestClimateCntrl`; no weather; fresh child-bridge cutover from Accfactory/Plus, new pairing and rebuilt Apple Home assignments. Existing Climate installations update normally. |
| Combined Climate Home/Away sensor | **Implemented for beta.6; physical hardware trials pending.** Optional occupancy sensor combines Google home status with a searchable Homebridge sensor picker and configurable presence rules. |
| Mixed room-sensor control | **Single/equal-average heating control implemented for beta.6.** Weighting and scheduled groups remain pending. Combine genuine Nest sensors and other accessible Homebridge temperature sensors in one group. |

## Coexistence, identity and migration

### Agreed product direction

- The climate plugin will not expose weather accessories. Discovery, ingestion fetches and UI/schema options are removed. Verify owned cached weather cleanup during migration; legacy source remains pending distribution cleanup.
- Target Homebridge platform alias: **`NestClimateCntrl`**.
- Upstream may run alongside this plugin for cameras and doorbells. Keep each physical or virtual accessory assigned to one plugin, including Nest Home/Away and Protect when enabled.
- Prefer separate child bridges for new dual-plugin setups. Accfactory/Plus users make a fresh cutover with a new Climate child bridge, pairing and Apple Home assignments.
- Guide the maintainer through the fresh cutover described in `MIGRATION.md`. No live change has been performed. Warn older-package users in setup and the next beta release notes; no new npm publication is authorized yet.

### Identity contract

The pinned shared `HomeKitDevice.generateUUID` derives an accessory UUID from:

```js
api.hap.uuid.generate(identityNamespace + '_' + serialNumber.toUpperCase())
```

It also supports equivalent runtime UUID APIs for the other supported backends. Upstream uses its developer-chosen plugin identifier, `homebridge-nest-accfactory`, as that prefix. It is not a Google-assigned namespace.

Latest product decision: fresh cutover from Accfactory/Plus is the supported setup. Do not run the offline ownership migration helper. `IDENTITY_NAMESPACE = 'homebridge-nest-climate-cntrl'` applies to new devices. `LEGACY_IDENTITY_NAMESPACE = 'homebridge-nest-accfactory'` applies only when that matching UUID was restored to this platform. Cache restoration is recorded per runtime API; it does not inspect or claim another plugin's accessories. If both expected UUIDs exist, the current Climate identity takes precedence. Package/display renames do not change either fixed namespace.

Migrated legacy UUIDs remain stable on subsequent cache restoration. Newly added devices use the Climate namespace even in migrated installations. Publishing the same device from both plugins still creates duplicate ownership; use device exclusions regardless of namespace. The public setup requires new pairing and rebuilt Apple Home assignments for Accfactory/Plus users. Existing Climate installations retain their identities.

New software-generated climate-presence accessories need a stable purpose-specific identity, distinct from the existing Google Home/Away indicator.

### Migration work and acceptance

Update platform registration, schema alias, dashboard/config selection, examples and configuration migration consistently. Audit every `NestAccfactory` reference rather than performing an indiscriminate rename.

Homebridge caches both plugin and platform associations. UUID preservation alone does not establish safe alias migration. Design and test the transition before rollout, including old cached platform associations, restarts, supported Homebridge versions and both plugins installed. Any compatibility alias must not reintroduce ambiguous `NestAccfactory` routing with upstream installed.

Use a new Climate child bridge for the cutover. Keep the existing compatibility adapter for installations whose identities were already restored, but do not offer cache ownership rewriting in public setup. Remove only old Nest entries; never clear unrelated caches or reset a shared bridge. The experimental offline helper passed software tests but is not the selected migration path.

## Combined Climate Home/Away sensor — approved feature scope

**Implemented for beta.6; physical hardware trials pending.** Expose an optional plugin-owned **Climate Home/Away** occupancy sensor that combines Google's reported home status with configurable logic using user-selected Homebridge sensors. It is disabled by default and has its own stable identity per child bridge and rule.

### Output and Google input

Use a standard HomeKit OccupancySensor: Home maps to occupancy detected, Away to occupancy not detected. It reports the combined result and is read-only in HomeKit. Manual overrides belong in the dashboard or a separately designed, accurately represented control; do not make the occupancy characteristic writable.

Use the real Google Home/Away/structure status already read by the plugin as the default baseline. This is the home's reported presence state, not evidence inferred from the thermostat heating, cooling or blower activity.

Keep Google's raw reported status available in the dashboard. The combined accessory may coexist with a clearly named raw Google Home/Away accessory because they represent different facts and have distinct identities. Expose the same raw Google accessory from only one plugin when upstream is also installed.

Enabling or updating this sensor does not itself write Google's whole-home mode or change thermostat settings. Let users optionally use the combined state for configured climate actions, selected thermostats/room fans, or Apple Home automations. Those actions require their own explicit enablement and tested precedence with native Eco, schedules and manual changes.

Google whole-home Home/Away writes remain a separate unverified capability, outside this feature's initial scope, because they could affect other Google Home behavior and cameras handled by upstream.

### Sensor picker

Reuse the planned authenticated main/child-bridge discovery also needed for mixed temperature sensors and room fans, with capability-specific filters.

- Provide a searchable multi-select picker for accessible standard motion and occupancy/presence sensors, including camera motion sensors exposed by upstream.
- Show accessory name, service/sensor type, room where the provider supplies it, source plugin/bridge, current value and availability. Do not invent room metadata.
- Distinguish multiple sensor services on one accessory and identify inputs by stable bridge/accessory/service identity, not display name.
- Include main and child bridges that permit supported access. A camera must expose a readable motion/occupancy characteristic; video or an Apple Home-only notification is not sufficient.
- Show selected inputs that become unavailable with their saved rule association intact, and allow users to disable/remove them.
- Exclude this controller's combined output and other known derived feedback inputs. Deduplicate duplicate representations of the same source.
- Devices available only in Apple Home need an explicit automation/integration route; another Homebridge plugin cannot automatically enumerate them.
- Door/contact events may be considered later as supporting arrival hints with explicit rules; an open/closed contact alone does not establish whether someone is home.

### Rule editor and recommended starting behavior

Provide a visible rule builder with a simple default preset and optional advanced conditions; users should not need to edit JSON.

The recommended starting preset is **Google status plus selected sensors**:

1. Google Home or any selected positive occupancy signal asserts Home.
2. A selected motion event asserts Home and starts or refreshes that input's configurable Home hold period.
3. A sensor that reports continuous occupancy keeps Home while occupied; its occupied value must not expire merely because no new event arrives. Source health and validity are checked separately.
4. Google Away may produce combined Away only after all selected presence conditions/holds clear and the configured Away delay has elapsed.
5. Unavailable inputs do not count as clear or Away. Show degraded/unknown state and follow an explicit fallback policy; do not manufacture a definitive departure from missing data.

Allow named rule groups with **any/all** conditions, source selection, active-state conditions appropriate to the sensor, motion hold time and Away delay. Make rule priority understandable: a positive Home condition wins over an Away condition unless an explicit manual override is active. Prevent immediate Home/Away oscillation.

Use a preview to show exactly which conditions currently match, why the combined result is Home/Away, and any pending timers before the user enables the accessory or climate actions.

Google's baseline is enabled by default. A sensor-only or inactivity-driven Away policy is an advanced opt-in mode that needs explicit setup and validation; lack of motion does not prove an empty home, especially while sleeping.

### Manual control, failures and restart

- Provide Force Home, Force Away and Resume Automatic in the dashboard, with a visible override duration/expiry policy. An active override wins over rules until released/expired.
- Missing/unreachable/stale inputs must not count as vacancy. A successful read is not proof of a new physical observation; unchanged occupied values are not inherently stale.
- Define startup and recovery behavior using valid current source state and valid persisted hold/override information. Do not publish a transient Away simply because initial sensor reads are incomplete.
- If a reliable combined state is unavailable, expose supported fault/status information and dashboard uncertainty; a binary occupancy characteristic must not silently imply verified vacancy.
- Keep the latest confirmed state and its source explanation visible during failures. Do not repeat climate/cloud writes when the result has not changed.
- Keep Google's reported state and the combined state distinct to avoid loops or misrepresenting Google state.

### Delivery and validation

1. Read-only sensor discovery and picker across accessible main/child bridges.
2. Rule editor, deterministic evaluator and preview with source health, holds and manual overrides.
3. Optional derived occupancy accessory with a stable purpose-specific identity; validate restart/configuration changes without recreating it.
4. Optional integration with climate actions after the sensor and precedence behavior are verified.

Cover Google Home/Away plus conflicting sensor signals, any/all rules, motion refresh and hold expiry, continuously occupied sensors, Away delay, manual overrides, absent/invalid readings, restart, removed sources, duplicate sources and feedback exclusion. Validate the actual Homebridge/HomeKit accessory lifecycle and cross-plugin inputs before claiming hardware support.

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
- **Repository/branch:** `pponce/homebridge-nest-climate-cntrl`, `feature/thermostat-dashboard`.
- **Planning files:** `maintenance/FEATURE_PLAN.md` and `maintenance/CLIMATE_HANDOFF.md`.
- **Decisions recorded:** no weather; platform alias `NestClimateCntrl`; new Climate namespace for new devices; fresh cutover from Accfactory/Plus with new pairing and rebuilt Apple Home assignments; existing Climate installations retain their bridge.
- **Approved feature recorded:** optional combined Climate Home/Away occupancy sensor using Google status plus user-selected Homebridge motion/occupancy sensors, a searchable main/child-bridge picker, configurable rules/holds/Away delay, preview and manual overrides. Google whole-home writes remain outside the initial scope.
- **Existing implementation/testing:** see `maintenance/CLIMATE_HANDOFF.md`. Alias, weather discovery removal, configured main/child-bridge temperature/fan/presence discovery, mixed temperature preview and cache-aware identity selection are implemented. Automatic sensor, room-fan and combined-presence control remain pending.
- **Open decisions:** source-control commands and hardware verification; source health/measurement-age policy; manual override/schedule precedence; climate action defaults; Apple Home target/presence representation.
- **Next steps:** validate real read-only sensor discovery and native physical-source semantics; develop the presence-rule preview and fan behavior design; guide the fresh cutover and verify normal live thermostat behavior. Enable thermostat compensation only after its source, manual-override and recovery behavior are verified.
