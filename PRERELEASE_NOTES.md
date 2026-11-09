## v0.5.0-beta.16

**Field help for climate rules and SSH-friendly npm authorization.**

- Small information icons beside rule fields explain temperature groups, Home/Away logic, fan run conditions, speed settings, source selections and priority.
- Open help with a hover, keyboard focus or phone tap. Escape, an outside click or a second tap dismisses it. Help fits the viewport in light and dark themes.
- Fan temperature examples use the current draft and selected units, including the turn-off temperature, the point where speed begins increasing and the temperature for maximum speed.
- The npm publication helper prints login and authorization links for opening on your own computer. It waits for approval in the terminal and does not launch a browser from SSH.
- With `--github-release`, the publication helper creates or reuses the tested GitHub release before publishing the verified package to npm with the `beta` tag.
- The installer can retrieve release files through the GitHub asset API when the direct release download fails. Package checksums are verified before installation.

After updating, refresh the dashboard. Hover over an information icon in **Climate rules** to inspect a setting. Review enabled temperature and fan rules and **Resume** those you want to run after the bridge restart.

See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.16/WEB_DASHBOARD.md#try-your-first-rules).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.15

**Clear sensor selection and thermostat diagnostics.**

- Thermostat cards display a recognized current sensor independently of automatic sensor setup availability. Unknown or ambiguous selections are explicitly labeled.
- Automatic setup explains which native information is missing or unsupported, including sensor scheduling mode, paired-sensor list and active selection.
- **Overview → Diagnose Nest sensor selection → Download sensor diagnostics** refreshes status and downloads one read-only JSON report for all thermostats. Reports include names, connection status and validation checks; credentials, device IDs, signatures, temperatures and schedules are excluded.
- Mixed temperature groups require confirmed built-in sensor and hold feedback before controlling heating. Displaying a sensor does not enable unsupported setup or heating commands.

After updating, refresh the dashboard. Review enabled rules and **Resume** those you want to run after the bridge restart. To investigate sensor setup, download the report and compare each thermostat's displayed selection with the Nest app.

See the [sensor setup and diagnostics guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.15/WEB_DASHBOARD.md#assisted-nest-sensor-setup-for-mixed-groups).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.14

**Drag fan rules into priority order.**

- In **Climate rules → Room fans**, drag a rule's dotted handle up or down. The top matching enabled rule controls each shared fan. Numbered positions and a **Highest priority** badge show the order.
- Reorder with a mouse or touch, the **Move up / Move down** buttons, or the drag handle's **Up/Down** and **Home/End** keys. A drop indicator shows the destination; **Escape** cancels a drag. Fan rules stay in a vertical list on small screens.
- Changes remain a draft until **Save changes**. **Discard** restores the saved order. Saved numeric priorities load in their existing order; new rules start at the bottom. Disabled rules retain their position without competing for control.
- Shared-fan handoffs preserve the original fan state and command cooldown. Missing readings in a higher-priority rule still block lower-priority fallback, and manual fan overrides remain in effect until resumed.

After updating, refresh the dashboard and review and **Resume** enabled temperature/fan rules. Arrange fan rules in the desired order, save, and check **Execution status** for the controlling rule.

See the [shared-fan priority guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.14/WEB_DASHBOARD.md#multiple-rules-for-one-fan).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.13

**Assisted Nest sensor setup for mixed temperature groups.**

- When a saved, enabled temperature group combines Nest room sensors with other Homebridge temperature sensors, the dashboard offers an in-page setup confirmation after saving or when resuming the rule.
- **Prepare thermostat** selects Nest's built-in sensor and holds native sensor scheduling. The saved sensor schedule and paired sensors are preserved, and Nest room sensors remain inputs to the group's average. Weekly temperature schedules, HVAC mode and Eco settings are retained.
- Heating control waits for fresh Nest feedback confirming the requested sensor state. Cancelling sends no sensor command. A changed rule or changed native settings requires a fresh review.
- **Restore Nest sensor settings** pauses the group, waits for any heating target it still owns to be restored, then restores the saved native sensor selection and schedule mode. The restoration action remains available on Overview after the group is disabled or deleted.
- Manual Nest changes take priority. Failed or unconfirmed sensor writes are not retried automatically, and restoration cannot overwrite a later change to the native sensor settings.
- Automatic setup supports recognized classic Nest sensor controls. Unknown or unsupported native multi-sensor formats remain unavailable; this release does not claim automatic setup support for 4th-generation native averaging.
- The npm publication helper includes a GitHub asset API fallback for release downloads and verifies the tested package before publication.

After updating, refresh the dashboard and review and **Resume** enabled temperature/fan rules. For a mixed temperature group, approve sensor setup when prompted and check both the Nest app and dashboard execution status during the first trial. Physical thermostat behavior still requires confirmation on the installed system.

See the [assisted sensor setup guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.13/WEB_DASHBOARD.md#assisted-nest-sensor-setup-for-mixed-groups).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.12

**Independent fan triggers, shared-fan priorities, and in-page confirmations.**

- Choose when a room fan should run: above a temperature threshold, while Nest is actively heating, or while Nest is actively cooling. For every trigger, choose **Use last setting**, **Fixed speed**, or **Temperature-based speed**. Temperature-based speed uses the selected room readings and comfort target; it does not change the thermostat target.
- Assign multiple rules to the same fan with distinct priorities from 0–100. The highest-priority eligible rule controls each fan. Missing required readings in a higher-priority rule block lower-priority fallback until those readings recover.
- Rule handoffs preserve the fan's original state and share its command cooldown. Fixed and temperature-based speeds respect the fan's supported steps and configured limits.
- A manual power or speed change suspends automatic control of that fan across its rules until **Resume**. Other fans can continue under their applicable rules.
- Confirm discard, delete, and unsaved sign-out inside the dashboard. **Keep editing** receives initial focus, Escape cancels, and a failed reload preserves pending edits.
- Saved fan rules retain their existing trigger and speed behavior when loaded.

After updating, refresh the dashboard and review and **Resume** enabled temperature/fan rules. For a shared fan, start with one heating or cooling rule and one temperature rule, assign distinct priorities, and confirm the fan's physical response.

See the [room-fan setup guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.12/WEB_DASHBOARD.md#temperature-based-fan-speed).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.11

**Temperature-based speed for Homebridge room fans.**

- Choose **Climate rules → Room fans → Run condition → Temperature-based speed**. Set a comfort target, separate start/stop gaps, minimum running speed, maximum speed, and the temperature gap for maximum speed. Selected temperature readings are averaged equally.
- A linear curve increases airflow as the room gets warmer. For example, a 72 °F target can start at 74 °F/25%, reach 76 °F/50%, cap at 78 °F/75%, and release control at 72.5 °F. The comfort target does not change a thermostat target.
- The editor previews the curve in Fahrenheit or Celsius and shows supported steps for each selected fan. The closest supported step is chosen within the configured limits; a 70% cap on a 25/50/75/100% fan therefore permits at most 50%.
- Speed mode requires fresh, readable and writable Homebridge fan-speed control. A speed command is confirmed before a separate on command is sent when needed. Normal adjustments are spaced at least one minute apart, with small changes ignored except at curve limits. A reduced cap can lower an owned fan's speed immediately.
- Manual power or speed changes pause the speed rule. When demand clears or control is released, fans started by the rule turn off; previously running fans return to their earlier speed within the cap. Failures affecting one fan retain restoration ownership for other fans already changed by the rule.

Existing on/off and HVAC-follow rules retain their settings. After updating, refresh the dashboard and review and **Resume** enabled temperature/fan rules. Begin with one speed-capable fan and confirm its physical response. A rule's cap limits its commands; it does not restrict manual controls or the fan's internal behavior.

See the [fan-speed setup guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.11/WEB_DASHBOARD.md#temperature-based-fan-speed).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.10

**Schedule time zones, child-bridge restarts, and clear presence inputs.**

- **Nest schedule time zone** offers Automatic detection and named choices in both configuration interfaces. Automatic uses the zone reported by the thermostat, or its paired Nest home. Manual selections take priority; the picker shows the detected value and source. Named zones handle daylight-saving changes.
- Schedule previews, scheduled heating control and heating-history day counts use the same effective zone. Unknown zones require a manual choice when a Nest weekly schedule is present. A changed effective zone starts fresh heating evidence and pauses an active scheduled hold.
- After saving accessory settings, **Restart child bridge** is available when Homebridge UI can identify and authorize this exact running Nest child bridge. The dashboard checks for reconnection and prompts you to sign in again. Pending edits must be saved or discarded first. Unavailable restart access offers guidance to restart through Homebridge.
- Nest Home/Away appears once in the presence source picker when the same accessory is also discovered through Homebridge. Existing selections of that Homebridge copy remain supported. Each enabled Home presence rule exposes one combined occupancy output, excluded from its own input picker.
- Temperature-rule guidance explains which thermostat is controlled and which readings contribute to the room average. The controlled thermostat is an optional input to that average.

After updating, refresh the dashboard and review and **Resume** enabled temperature/fan rules. Fan rules support on/off control in this release. See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.10/WEB_DASHBOARD.md).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.9

**Heating response & tuning for each thermostat.**

- Choose **Forced air**, **Radiators** or **In-floor radiant** under **Settings → Thermostat settings → your thermostat → Heating response & tuning**. Each saved temperature rule has provisional starting guidance for its minimum update interval and maximum target adjustment.
- Enable **Observe heating response locally** to collect room temperatures, Nest targets and heating-state history, including while the dashboard is closed or the rule is disabled. Collection is optional and never applies settings automatically.
- Learned recommendations use complete heating cycles across multiple days, with evidence for response delay, warming rate, continued warming after shutoff, persistent Nest-to-room differences and room overshoot. Radiant response can begin after heating stops.
- Each recommendation shows confidence and an explicit **Apply to this rule** button. Applying saves only the selected rule's update interval and maximum adjustment. Pending edits and changed configurations must be resolved before applying.
- Changing the selected sensors, desired room temperature or heating type starts a new observation period. Local history is bounded, and temperature differences display in the selected Celsius/Fahrenheit units.

Learned suggestions require at least **six usable cycles across three days**, spanning at least **48 hours**. Their confidence describes observational evidence; comfort and real equipment response should be assessed after applying a suggestion.

Existing Climate installations update normally. Refresh the dashboard after installation, and review and **Resume** enabled temperature/fan rules after the bridge restart. See the [heating setup and tuning guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.9/WEB_DASHBOARD.md#heating-response--tuning).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.8

**Live Homebridge sensor readings throughout the climate dashboard.**

- External temperature sensors, room fans and presence sources refresh automatically every 30 seconds while the dashboard is visible.
- Returning to the browser tab or using **Refresh status** refreshes Nest and external readings together.
- Rule readings and previews update in place, preserving unsaved values, selected sensors, search text and keyboard focus.
- Unreachable or stale sources remain unavailable until a successful fresh read. Background and signed-out dashboards do not poll.

Existing Climate installations update normally. Refresh the dashboard after installing, and review and Resume enabled temperature/fan rules after the bridge restart. See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.8/WEB_DASHBOARD.md#find-your-sources).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.7

**Choose Celsius or Fahrenheit for your climate dashboard.**

- In the standalone dashboard, open **Settings → Your dashboard → Temperature units**. In the Homebridge plugin configuration UI, use **Dashboard preferences → Temperature units**. The standard configuration form also exposes the preference under **Web dashboard**.
- The selected units apply to thermostat readings and schedules, sensor lists, temperature-group targets and adjustment limits, fan thresholds and turn-off gaps, previews and execution status.
- Existing targets retain the same meaning when units change. Temperature differences use the correct conversion: a 1 °C gap is a 1.8 °F gap. Nest and Apple Home keep their own display-unit settings.
- Save the preference to share it across browsers and devices. A unit-only change does not require a bridge restart. Refresh another open dashboard to load the saved preference.

The live execution engine supports bounded heating groups, Homebridge room-fan rules and combined occupancy sensors. Rules remain opt-in; review the [first-rule walkthroughs](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.7/WEB_DASHBOARD.md#try-your-first-rules). Existing Climate installations update normally without re-pairing. Accfactory/Plus users follow [MIGRATION.md](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.7/MIGRATION.md).

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.6

**Opt-in climate automation for live equipment trials:**

- **Temperature groups:** use one sensor or an equal average of associated Nest and other Homebridge temperature sensors to guide Nest heating. Configure a desired room temperature, bounded target adjustment and minimum update interval. Heat mode, Eco off and the built-in Nest control sensor are required; cooling/range compensation is outside this pilot.
- **Room fans:** control compatible Homebridge fans above a temperature threshold or during reported Nest heating/cooling activity. Hysteresis and a minimum command interval reduce repeated switching. Rules release only settings they still own and respect manual fan changes.
- **Combined Home/Away:** expose a separate read-only Apple Home occupancy sensor using Nest status, motion and occupancy inputs, with any/all logic, motion holds, an Away delay and timed dashboard overrides. This does not change Google's whole-home mode or Eco settings.
- **Execution controls:** enable individual rules, view live status and waiting/paused reasons, and use pause/resume controls. Saving applies enabled rules without restarting the bridge. Existing and newly created drafts remain disabled until explicitly enabled.
- **Recovery and precedence:** direct manual thermostat changes and Nest schedule boundaries take priority. Missing inputs cannot establish Away. Temperature and fan rules require explicit Resume after a bridge restart. Commands are tracked before transmission, and uncertain writes are not retried automatically.

Follow the [live-rule setup and testing guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.6/WEB_DASHBOARD.md#try-your-first-rules). The engine polls approximately every 15 seconds; brief motion pulses between polls may be missed. If the host or equipment connection fails, Nest or a room fan may retain its last commanded state. Review actual equipment behavior during initial trials.

The direct HTTP, direct HTTPS and same-machine reverse-proxy connection modes remain supported. Existing Climate Cntrl installations can update without re-pairing their thermostats or changing web credentials. A combined occupancy accessory is added only when its presence rule is enabled.

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

## v0.5.0-beta.5

**Three web dashboard connection modes:**

- **HTTP · unencrypted:** simple direct access, with visible warnings that passwords and dashboard data travel unencrypted.
- **HTTPS · certificates in plugin:** direct encrypted access using supplied full-chain/private-key PEM files or a generated local certificate. This remains the default.
- **HTTPS through reverse proxy:** Nginx or another proxy on the same machine handles the browser certificate and HTTP-to-HTTPS redirect. The plugin listens over HTTP at `127.0.0.1:9444` and needs no certificate files.

For proxy mode, enter the **Public HTTPS origin**, such as `https://climate.example.com`, and preserve that Host header at the proxy. Dashboard links use the public address without the internal backend port. Host, Origin, authentication and CSRF checks remain enforced, cookies retain `Secure`, `HttpOnly`, and `SameSite=Strict`, and forwarded headers cannot bypass the local-proxy restriction. The backend port is configurable; this mode supports a proxy on the same machine, not a remote proxy or a separate container network.

Follow the [web dashboard setup guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.5/WEB_DASHBOARD.md). Save network changes and restart the Nest child bridge. Existing Climate Cntrl beta installations can update normally without re-pairing or changing passwords.

**Moving from Nest Accfactory or Nest Accfactory Plus requires fresh setup and Apple Home pairing.** Follow the [cutover instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.5/MIGRATION.md). Compatible existing legacy Google refresh-token authentication remains supported.

Temperature, occupancy and room-fan rules remain **inactive drafts**; automatic rule execution is not included. Automated proxy testing does not replace validation on an individual Nginx/Homebridge installation.

## v0.5.0-beta.4

**Moving from Nest Accfactory or Nest Accfactory Plus requires fresh setup and Apple Home pairing.** The package is `homebridge-nest-climate-cntrl` and the platform changes from `NestAccfactory` to **`NestClimateCntrl`**. Recreate affected room assignments, scenes and automations; follow the [cutover instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.4/MIGRATION.md). Existing Climate Cntrl beta installations can update normally.

- **Optional HTTP dashboard access:** choose HTTP under Web dashboard → Network and connection settings, save and restart the Nest child bridge. HTTPS remains the default.
- **Clear HTTP warnings:** passwords and dashboard data travel unencrypted. The warning appears in setup, before sign-in, inside the dashboard and in startup logs.
- HTTP keeps the web login, browser-origin checks and CSRF protection, with separate HTTP and HTTPS sessions. HTTP does not generate or read TLS certificates.
- Expanded guidance for internal DNS hostnames, wildcard certificates, file permissions and HTTPS reverse proxies. See [web dashboard setup](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.4/WEB_DASHBOARD.md).
- Web passwords continue to support **8–128 characters**.

Temperature, occupancy and room-fan rules remain **inactive drafts**; automatic rule execution is not included. Hardware testing is ongoing.

Compatible existing **legacy Google refresh-token authentication remains supported**; the plugin cannot issue new legacy tokens. For cameras, doorbells, floodlight cameras, Yale locks or weather, use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) with separate device ownership.

## v0.5.0-beta.3

**Moving from Nest Accfactory or Nest Accfactory Plus requires fresh setup and Apple Home pairing.** The package is `homebridge-nest-climate-cntrl` and the platform is **`NestClimateCntrl`**. Recreate affected room assignments, scenes and automations; follow the [cutover instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.3/MIGRATION.md). Existing Climate Cntrl beta.1/beta.2 installations can update normally.

- **Web dashboard passwords can now be 8–128 characters.** The Homebridge setup form, server validation and setup guide use the same limit. Existing longer passwords continue to work.
- The checkout/publishing helper keeps local maintenance artifacts in place and stops if an update would overwrite ignored local files. It verifies the tested release package and publishes under npm's `beta` tag.
- The standalone HTTPS dashboard remains available with its phone layout, browser/iOS icons, live Nest controls, settings, source discovery, schedules and observed runtime. See [web dashboard setup](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.3/WEB_DASHBOARD.md).

Temperature, occupancy and room-fan rules remain **inactive drafts**; automatic rule execution is not included. Hardware testing is ongoing.

Compatible existing **legacy Google refresh-token authentication remains supported**; the plugin cannot issue new legacy tokens. For cameras, doorbells, floodlight cameras, Yale locks or weather, use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) with separate device ownership.

## v0.5.0-beta.2

**Fresh setup is required when moving from Nest Accfactory or Nest Accfactory Plus.** The package is `homebridge-nest-climate-cntrl` and the Homebridge platform changes from `NestAccfactory` to **`NestClimateCntrl`**. Create and pair a new child bridge, then recreate affected Apple Home room assignments, scenes and automations. Follow the [cutover instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.2/MIGRATION.md).

**Already using Nest Climate Cntrl beta.1?** Update normally and keep your existing Climate bridge. This release does not require another reset.

- **Standalone web dashboard:** open your climate controls directly from a computer, tablet or phone, with a responsive layout, light/dark appearance, browser icon and iOS Home Screen icon.
- **Optional HTTPS access:** off by default, with a separate web login created in Homebridge settings. Each child bridge has its own web account and certificate. See [web dashboard setup](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.2/WEB_DASHBOARD.md).
- **Live overview:** thermostat readings, targets, heating/cooling state, supported Eco changes, native Nest temperature-source selection, HVAC fan timers, schedules and observed runtime.
- **Settings from the web:** save supported climate settings while retaining account credentials and bridge identity. Concurrent edits are detected, and settings that need a restart are identified.
- **Sensor and rule setup previews:** inspect accessible Nest/Homebridge sources and save temperature, occupancy and room-fan rule drafts. **Drafts do not change thermostats, room fans or Home/Away. Automatic rule execution is not included.**
- **Legacy Google authentication remains supported** for compatible existing refresh tokens. This plugin cannot issue new legacy tokens; Google issue-token/cookie authentication remains available without an SDM project.
- Cameras, doorbells, floodlight cameras, Yale locks and weather are outside this plugin's climate scope. Use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory) for those capabilities, with [separate device ownership](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.2/MIGRATION.md#running-alongside-upstream).

**Beta:** hardware testing is ongoing. Runtime covers observed periods only. Real thermostat/Heat Link behavior and iOS installation still need testing on users' equipment.

## v0.5.0-beta.1

**Platform name change: `NestAccfactory` → `NestClimateCntrl`.** The npm package is now `homebridge-nest-climate-cntrl`. Read the [migration instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.1/MIGRATION.md) **before updating an existing installation**. Changing the platform field alone does not migrate cached accessories or Apple Home assignments.

This is the first **Nest Climate Cntrl public beta**, under active testing on real equipment.

- Focuses on Nest thermostats, native room sensors and Heat Links, including supported hot-water controls.
- Removes camera, doorbell, floodlight-camera, Nest × Yale lock and weather exposure. Protect and Nest Home/Away remain available.
- For those removed capabilities, use [upstream Nest Accfactory](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory). Both plugins can coexist when each device is assigned to one plugin; see the [coexistence instructions](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0-beta.1/MIGRATION.md#running-alongside-upstream).
- Adds a custom Homebridge climate dashboard with account setup, device status, schedules, observed runtime and diagnostics.
- Adds optional Eco switches and 15/30/60-minute HVAC fan-preset switches, disabled by default.
- Adds native Nest temperature-source selection and configurable fan duration.
- Adds a **read-only** mixed Google/non-Google temperature-sensor preview, plus discovery of accessible Homebridge room fans and presence sensors.
- Uses a new Climate Cntrl UUID namespace for new accessories and reuses matching legacy UUIDs when their cache entries are restored to this platform.
- **Retains legacy Google refresh-token authentication for users who already have a compatible, still-valid token.** The plugin cannot issue new legacy tokens. Google issue-token/cookie authentication is also available; no SDM project is required.

Automatic room-temperature compensation, room-fan rules and combined Home/Away are not enabled in this beta. The complete cache-preserving migration is still under validation; a separate beta child bridge creates new Apple Home accessories. Runtime covers observed periods only. Live thermostat, Heat Link and migration behavior need further hardware testing.

## v0.4.4-beta.7

First Nest Accfactory Plus prerelease, based on upstream 0.4.4-beta.7.

- Adds the separate `homebridge-nest-accfactory-plus` package and registration name.
- Retains legacy Google OAuth refresh-token authentication for compatible existing credentials. This does not create new legacy credentials.
- Preserves the `NestAccfactory` platform and original device UUID namespace, including external cameras.
- Adds cache-reuse and identity regression tests and a production tarball installation check.
- Documents the Homebridge UI uninstall/install migration in MIGRATION.md.
- Separates GitHub releases from explicit npm publishing; upstream merges do not publish to npm.

Live migration, Google authentication and physical camera/HKSV behavior still require confirmation on an existing installation. Back up before migration and retain configuration, accessory cache and pairing records. See MIGRATION.md for the exact sequence.

# Pre-release Notes

All notable pre-release changes to `homebridge-nest-accfactory` are documented here.  
Entries are specific to individual alpha and beta releases and are not cumulative.  
This project tries to adhere to [Semantic Versioning](http://semver.org/).

## v0.4.4-beta.10 (2026/10/19)

### Changed

- Move HomeKit return-audio RTP/RTCP socket routing into the camera Talkback module, preserving packet forwarding and FFmpeg process ownership

- Group camera streaming, transport, codec and FFmpeg modules under `plugins/camera/`, retaining the camera plugin entry point and existing media behaviour
- Replace `rimraf` and `copyfiles` with native Node.js clean and build scripts
- Consolidate FFmpeg process control into `start()`, exact process handles and terminal instance shutdown; attach media pipes at startup and publish lifecycle notifications through EventEmitter
- Track retained media payload bytes in MediaTimeline statistics without changing buffering or output behaviour
- Consolidate H264 byte parsing and RTP payload reconstruction in the shared H264 module, preserving WebRTC receive behaviour

### Fixed

- Fix a regression introduced by a protobuf library update that caused NexusTalk to reconnect when talking stopped, restoring explicit end-of-talk payload and SPEEX codec fields
- Ignore delayed WebRTC stream-extension failures from retired sessions so they cannot close replacement streams
- Keep retired HKSV generators tied to their original FFmpeg process when session keys are reused
- Release failed recording input setups automatically and prevent delayed process completion from stopping replacement recordings
- Avoid repeated forced FFmpeg termination signals and bound binary capability probes with timeouts
- Include retained FFmpeg diagnostics when talkback stops unexpectedly, including exits with code zero
- Keep the HomeKit talkback receiver waiting while the microphone is idle instead of timing out and closing live view

## v0.4.4-beta.9 (2026/10/18)

### Changed

- Updated HomeKitDevice to `2026.10.18`, HomeKitHistory to `2026.10.18`, fetchWrapper to `2026.10.17`, `eslint` to `10.13.0`, and `werift` to `0.25.1`
- Expand device, cloud-to-HomeKit and streaming regression tests; measure every source module and enforce per-module coverage floors during checks and publishing

### Fixed

- Run accessory and platform tests with the HAP dependency supplied by either Homebridge 1.x or 2.x

- Keep thermostat humidity state reads consistent with published Inactive updates when humidification and dehumidification are off

- Ignore track and RTP callbacks from retired WebRTC peers so replacement sessions keep their own audio and decoder state

- Settle pending NexusTalk connection attempts when the socket closes before the TLS handshake

- Prevent late WebRTC talkback START responses from sending old audio or deferred STOP requests into replacement sessions

- Preserve NexusTalk Google authentication mode across partial identity or host updates without new credentials

- Preserve WebRTC media readiness when ICE connection events arrive after the first decodable keyframe

- Prevent late WebRTC device lookup and SDP completion from reopening stopped streams or installing duplicate timers on replacement sessions
- Honour full Nest data refreshes after topology changes instead of overwriting them with incremental subscriptions
- Reauthorise Google accounts when Observe reports expired credentials, and prevent retired Observe transports from publishing stale data, removing accessories, restarting loops or invalidating refreshed credentials

- Treat the default NexusTalk playback-end reason as a normal stop instead of reconnecting as though playback failed

- Allow WebRTC sources to reopen after a requested close while live or recording outputs remain attached
- Restore `.js` fallback when a thermostat external-control module is configured without a file extension
- Respect live and recording output backpressure across scheduler ticks so blocked pipes do not keep accumulating media
- Reflect thermostat Off changes from the Nest app in HomeKit while retaining heating and cooling capabilities
- Prevent failed Nest REST and Google commands from committing requested device values; reject SET requests when the connection or Google command transport is unavailable
- Return asynchronous thermostat setter results to HomeKit so command failures reach its error handling
- Refresh camera, doorbell and floodlight credentials only from the account owning their selected Nest/Google resource
- Discover Home/Away, thermostats, Heat Links, Protects, locks and camera-family accessories from cached fields when required data or parent resources arrive separately
- Initialise thermostat and Heat Link characteristic values within their device ranges without changing shared HAP defaults for other accessories

## v0.4.4-beta.8 (2026/10/16)

### Changed

- Stop requesting retired thermostat, sensor and Heat Link REST buckets and ignore unrequested REST updates
- Removed Nest REST API support for thermostats, temperature sensors and Heat Links; these devices now require the Google API
- Log Home/Away state changes as Home or Away
- Weather accessories now use protobuf structure discovery only, preserving existing serial identities and retaining Nest REST forecast polling
- Home/Away accessories now use protobuf structure data only; REST-only connections no longer provide Home/Away updates
- Preserve Home/Away occupancy until a recognised protobuf structure mode is available
- Moved Nest/Google API support-dump formatting and redaction into `supportdump.js`
- Exclude shared submodules from `npm run format`, while retaining their lint and test coverage
- Flatten project tests into `test/` and update test and coverage discovery
- Use the `globals` development dependency for ESLint's Node.js ES module globals

### Security

- Redact credentials and personal details from API support dumps, retain consistent aliases for device/home references, and bound diagnostic collection and output

### Fixed

- Refresh temperature sensor active status when its associated thermostat changes sensor selection
- Initialise weather accessories when protobuf identity, location and forecast data arrive separately, and retain identity on weather-only updates
- Retain Home/Away identity on protobuf mode-only updates so HomeKit receives occupancy changes
- Keep known protobuf structure-mode, reason and actor-method enums readable in support dumps while retaining identifier redaction

## v0.4.4-beta.7 (2026/10/14)

### Changed

- Updated `protobufjs` to 8.8.1, `werift` to 0.25.0, `@types/node` to 26.6.5, `@typescript-eslint/parser` to 8.71.2, and `prettier` to 3.9.10
- Moved five-minute weather polling into the backend so network requests run outside the accessory lifecycle queue; weather readings continue to arrive through UPDATE messages

- Added the per-device `ignoreIndoorChime` option (default `false`) to allow HomeKit doorbell notifications when the physical indoor chime is disabled
- HomeKit rings continue to respect the indoor chime setting by default; Quiet Time suppresses rings regardless of `ignoreIndoorChime`
- Removed the optional `chimeSwitch` and its cached HomeKit service; configure the physical chime and Quiet Time in Nest/Google Home and remove `chimeSwitch` from the device configuration
- Centralised validated FFmpeg encoder settings in one configuration and separated hardware discovery from validation and caching; retained the existing capability getters and feature flags
- Await external thermostat controls in order before completing device updates; removed the separate Daikin command queue

### Fixed

- Restored camera-event and weather polling after the HomeKitDevice queue update, allowing timer hooks to read and publish device state
- Aligned Quiet Time handling in the Nest API with the Google API
- Require a bounded H264 encoding check before selecting hardware acceleration, reuse validation across cameras, and retain software encoding when hardware validation fails
- Apply encoder-specific device setup, pixel formats and presets consistently to live streaming and HKSV recording
- Preserve the automatic humidifier/dehumidifier mode when both capabilities are available, including subsequent capability updates
- Keep external Daikin destinations, logging and command state independent for each thermostat
- Preserve Daikin accepted settings after failed commands and allow fan or dehumidifier operation to be switched off
- Apply default options when the configuration options container is null or an invalid type
- Preserve configuration file permissions during legacy migration and restrict backup access to the owner before writing credentials
- Prevent rejected Nest updates from overwriting Google-selected accessory state and command routing, while retaining camera source fallback
- Default to two simultaneous live viewers per camera; honour integer `maxStreams` counts from one to four consistently with the Homebridge UI, independently of HKSV recording
- Exclude history tests and lint configuration from the packaged runtime, keep test discovery independent of generated files, and report measured and omitted production modules alongside coverage percentages

## v0.4.4-beta.6 (2026/10/05)

### Changed

- Updated the `HomeKitDevice` submodule from code version `2026.09.17` to `2026.10.05`,
- Updated dependencies: `chalk` to `6.0.1`, `@types/node` to `26.6.4`, `@typescript-eslint/parser` to `8.71.0`, and `eslint` to `10.12.0`
- Updated transitive `brace-expansion` dependencies to resolve reported denial-of-service vulnerabilities in development tools
- Reused the parsed FFmpeg encoder list for hardware detection, removing one synchronous probe per FFmpeg instance
- Added explicit FFmpeg session states and `STARTED`, `STATE_CHANGED`, and `COMPLETE` events, bounded diagnostics, and capability queries; shutdown can now be awaited and escalates graceful termination to `SIGKILL` after a two-second grace period by default
- Kept stopping and replaced FFmpeg processes tracked until closure so camera teardown can await every process
- Reduced Nest camera activity polling to one request attempt because the next two-second poll already provides a retry
- Normalised Google camera event types to the lowercase, hyphenated names used by the Nest REST API, including vehicle and package events

### Fixed

- Preserved working FFmpeg sessions when replacement startup fails and prevented rejected signals from arming forced termination
- Kept expected FFmpeg `EPIPE` errors silent while retaining and reporting other pipe errors
- Made DRM metadata probing tolerate missing or inaccessible directories and aligned minimum muxer checks with capability aliases
- Routed FFmpeg startup failures and unexpected live/talkback completion through camera cleanup, while preventing requested stops or stale sessions from tearing down replacements
- Applied existing Google Observe retry backoff to resolved gRPC failures instead of restarting every second
- Released retained WebRTC gRPC connections during full camera teardown while preserving reuse across normal stream stops and reconnects
- Ensured failed gRPC requests release their HTTP/2 stream and timeout without closing the shared connection
- Prevented overlapping Google camera snapshot requests from replacing or removing each other's update waiters
- Prevented a pending camera live-stream START from launching FFmpeg after its session was stopped or replaced during source startup
- Fixed gRPC responses being rejected when an incoming chunk required more than one buffer doubling, despite remaining within the configured size limit
- Added an RTCP watchdog for camera and doorbell live streams so sessions are stopped and cleaned up when HomeKit stops sending feedback, even if no STOP request arrives
- Reused existing `HomeKitDevice` timers, allowing 30 seconds for initial feedback and then twice the requested RTCP interval (with a 10-second minimum) between reports
- Silenced expected Nest camera activity timeout messages while retaining debug logging for authentication, HTTP, and malformed-response failures
- Awaited device updates and removals so asynchronous camera lifecycle work completes before processing continues
- Corrected Google protobuf timestamps for fan and hot-water timer deadlines and derived their seconds and nanoseconds from one millisecond value

## v0.4.4-beta.5 (2026/09/24)

### Changed

- Updated the `fetchWrapper` submodule from code version `2026.09.17` to `2026.09.21`, adding public `GET` and `POST` method constants and keeping retry tracking internal so caller options remain unchanged
- Updated the `HomeKitDevice` submodule from code version `2026.09.12` to `2026.09.17`, adding the `addMatterCluster()` helper for configuring Matter cluster state and command handlers before accessory registration
- Updated Nest API requests to use the new `fetchWrapper.GET` and `fetchWrapper.POST` method constants

### Fixed

- Correctly distinguished standalone `NeonQuartz` Nest Cam battery devices from floodlight cameras by checking for their related `Aziz` floodlight resource

## v0.4.4-beta.4 (2026/09/17)

### Changed

- Updated the `HomeKitDevice` submodule from code version `2026.08.18` to `2026.09.12`, preserving existing HAP behaviour while preparing the shared accessory lifecycle for optional Homebridge Matter support
- Updated device creation to use the new `HomeKitDevice.add()` options object for the HAP accessory name, category, and Eve history setting
- Moved the shared HTTP request helper into the dedicated `fetchWrapper` submodule and reused it for Nest and Daikin requests
- Updated development dependencies: `@types/node` to `26.5.0` and `@typescript-eslint/parser` to `8.70.0`

### Fixed

- Restored camera off/on control through the Home app recording-mode setting when a camera had been switched off in the Nest app, by representing the remotely reversible Nest state with `HomeKitCameraActive` instead of `ManuallyDisabled` [#345](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory/issues/345) [@go-faustino](https://github.com/go-faustino)
- Prevented intermittent Raspberry Pi 4 HKSV recording timeouts by increasing the V4L2 encoder capture-buffer count for hardware-accelerated recordings [#344](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory/issues/344) [@pace8](https://github.com/pace8)

## v0.4.4-beta.3 (2026/09/08)

### Compatibility Changes

- Raised the minimum supported FFmpeg version from **6.1** to **7.1**
- Camera and doorbell users running FFmpeg 6.x or 7.0 must upgrade to **7.1 or newer**; live streaming and HKSV recording are unavailable when the installed binary does not meet the minimum requirements
- FFmpeg 8.x and newer remain permitted; the required `libx264`, `libfdk_aac`, `libspeex`, and `libopus` codec checks still apply

### Fixed

- Delayed the HKSV MP4 initialisation header for all encoders, allowing FFmpeg to populate decoder configuration supplied with the first encoded packets [@pace8](https://github.com/pace8)
- Prevented Raspberry Pi graphics nodes from incorrectly qualifying NVENC, QSV or VAAPI ahead of the Pi V4L2 encoder [@pace8](https://github.com/pace8)
- Updated live and HKSV transcoding arguments for `h264_v4l2m2m` to use numeric H264 profiles, omit the unsupported level control, and explicitly disable B-frames [@pace8](https://github.com/pace8)

## v0.4.4-beta.2 (2026/09/05)

### Changed

- Updated `protobufjs` from `8.7.2` to `8.8.0`
- Updated development dependencies: `@types/node` to `26.4.1`, `@typescript-eslint/parser` to `8.69.0`, `eslint` to `10.10.0`, and `prettier-eslint` to `17.1.2`

### Fixed

- Detect Raspberry Pi hardware H264 encoders by their sysfs device name and read/write access instead of requiring `/dev/video0`, without additional FFmpeg invocations [@pace8](https://github.com/pace8)

## v0.4.4-beta.1 (2026/08/20)

### Changed

- Updated the `HomeKitDevice` submodule from code version `2026.05.26` to `2026.08.18`
- Updated the supported Homebridge v2 range from `^2.3.1` to `^2.4.0`
- Added Node.js 26 beta support when running Homebridge 2.4.0 or later; Homebridge 1.x remains supported on Node.js 22 and 24
- Updated `@typescript-eslint/parser` development dependency version from `8.66.0` to `8.67.0`

- `webrtc.js`
  - Reduced connection latency by overlapping the camera view-intent request with local WebRTC offer and ICE candidate gathering
  - Sent the completed local SDP, including gathered ICE candidates, when joining the Google camera stream
  - Requested a keyframe immediately after learning the incoming video SSRC instead of waiting for jitter release or the retry timer
  - Added FIR and 4 Mbps REMB feedback to the bounded keyframe request path to improve decoder-ready stream startup
  - Preserved later RTP timestamp groups after an incomplete keyframe so one damaged IDR does not unnecessarily create a prolonged video gap
  - Simplified fragmented H264 recovery and removed redundant per-packet playback-state validation while retaining recovery diagnostics

- `streamer.js`, `streamtransport.js`
  - Reduced output scheduling work by caching unconsumed media candidates between drain-loop iterations
  - Normalised output policy defaults once at output creation instead of repeatedly validating them during media draining
  - Allocated and updated detailed output diagnostics only when support dumps are enabled
  - Added an in-order fast path for timestamp-grouped RTP packets while retaining sorting and gap recovery for reordered packets

- Added native Node.js regression tests for H264, media timelines, ring buffers, stream transport jitter ordering, translation, and utility helpers
- Added test, coverage, and combined validation scripts and a continuous-integration workflow for supported Node.js versions

## v0.4.3-beta.4 (2026/08/10)

### Changed

- `HomeKitHistory`
  - Added compatibility with the minimal file storage included in HAP-NodeJS 2.2.0 and Homebridge 2.3.0
  - Replaced removed `setItem()` calls with the supported synchronous `setItemSync()` API
  - Kept existing history filenames and the on-disk data format unchanged, so saved Eve history remains compatible

- Updated the supported Homebridge v2 range from `^2.2.1` to `^2.3.0`
- Updated `protobufjs` dependency version from `8.7.1` to `8.7.2`
- Updated `werift` dependency version from `0.24.2` to `0.24.3`

## v0.4.3-beta.3 (2026/08/04)

### Changed

- `webrtc.js`
  - Replaced the fixed 140KB keyframe limit with a bounded 2MiB–4MiB allowance that adapts to the source resolution and bitrate
  - Increased the bounded video RTP reorder capacity to support fragmented high-resolution keyframes
  - Added Werift transport diagnostics for ICE/DTLS state, candidate pair details, round-trip time, consent status, packet loss, jitter, NACKs, PLIs, and transferred bytes
  - Preserved the final Werift statistics snapshot before peer connection teardown for reconnect and support diagnostics

- `streamtransport.js`
  - Improved timestamp-grouped video jitter performance with indexed timestamp and RTP sequence lookups
  - Replaced repeated per-packet queue scans and packet recounting with incremental bounded jitter bookkeeping
  - Deferred grouped jitter sorting and queue rebuilding until frame release instead of performing it for every RTP fragment

- `streamer.js`, `nexustalk.js`, `webrtc.js`
  - Passed H264 SPS/PPS presence and cached codec configuration from transport assembly into Streamer
  - Removed unused retained IDR copies and avoided repeated keyframe scans when preparing decoder-safe output
  - Included Werift statistics in camera support dumps

- Updated `chalk` dependency version from `5.6.2` to `6.0.0`
- Updated `werift` dependency version from `0.23.0` to `0.24.3`, removing the legacy `werift-ice` and `ip` dependency chain

## v0.4.3-beta.1 (2026/05/28)

## Changed

- `utils.js`
  - Improved shared device description building so location names already present in a device label are not duplicated in the HomeKit display name

- `plugins/camera.js`
  - Renamed internal streaming backend registry terminology from `STREAMERS` to `TRANSPORTS` to better reflect the Streamer/transport split

## v0.4.3-alpha.7 (2026/05/20)

### Fixed

- `webrtc.js`
  - Fixed WebRTC streams becoming unstable or stalling after RTP timestamp changes or long-running sessions
  - Fixed stale RTP timing state causing valid WebRTC media frames to be incorrectly dropped after reconnects or RTP timestamp wrap

### Changed

- `webrtc.js`
  - Updated WebRTC video and audio timestamp mapping to use previous accepted RTP timestamps instead of fixed RTP base timestamps
  - Improved handling of RTP timestamp wrap and long-running WebRTC sessions to reduce timing drift and frame rejection
  - Minor cleanup to internal WebRTC timing logic and comments

- Updated `protobufjs` dependency version from `8.2.0` to `8.4.0`

## v0.4.3-alpha.6 (2026/05/19)

### Changed

- `streamtransport.js`
  - Added shared RTP jitter-buffer helpers for sequence-ordered packets and timestamp-grouped access units
  - Added shared media recovery helpers for tracking unstable and recovering packetised media streams
  - Centralised transport media metadata, delivery statistics, bitrate estimation, and duplicate close protection in the base transport layer
  - Centralised H264 SPS metadata learning in `emitMedia()` so WebRTC and NexusTalk no longer duplicate resolution parsing
  - Centralised H264 Annex-B access-unit assembly and cached SPS/PPS keyframe prepending for shared transport use

- `h264.js`
  - Moved H264 NAL parsing, Annex-B wrapping, and SPS metadata parsing into a shared utility module
  - Improved SPS parsing robustness to better handle truncated or malformed bitstreams

- `rtph264.js`
  - Added shared RTP H264 packet helpers for payload inspection, timestamp-group completion, and FU-A fragmented NAL reconstruction
  - Centralised FU-A sequence continuity and timestamp validation for WebRTC H264 media handling
  - Added shared fragmented access-unit recovery helpers to improve handling of incomplete or interrupted RTP video payloads

- `webrtc.js`
  - Moved RTP reordering onto shared `StreamTransport` jitter helpers for WebRTC audio and timestamp-grouped H264 video
  - Moved H264 RTP payload inspection and fragmented FU-A reconstruction onto shared `RtpH264` helpers
  - Tightened H264/RTX handling so fragmented FU-A access units now require valid start/end markers and RTP sequence continuity before emission
  - Bounded WebRTC video jitter draining per tick to avoid large keyframes monopolising the event loop
  - Simplified WebRTC stream state by removing retained IDR payload buffers, unused RTP/SPS audit fields, and unused PLI reason tracking
  - Improved WebRTC audio timestamp handling by keeping source timing aligned to the RTP clock and replacing hard timestamp resync with bounded low-queue catch-up
  - Removed synthetic WebRTC audio gap filling so diagnostics now expose real upstream or output pauses instead of masking them with silent PCM
  - Added targeted diagnostics for keyframe emission, shallow audio queues, and slow output writes to assist streaming troubleshooting

- `streamer.js`
  - Fixed shutdown ownership so camera shutdown stops owned streamers only once, avoiding duplicate transport close logs and duplicate live/recording teardown during Homebridge shutdown
  - Explicitly removes stopped streamers from the shared output scheduler during full teardown
  - Added output policy controls for audio-before-keyframe handling and improved backpressure diagnostics
  - Reduced audio gap debug logging noise while retaining gap counters in support diagnostics

- `nexustalk.js`
  - Kept NexusTalk playback on the direct ordered TLS media path
  - Improved bundled AAC audio timestamp progression by removing the previous 120ms advancement cap

- `mediatimeline.js`, `ringbuffer.js`
  - Improved retained timeline trimming so untimed items and stale output cursors cannot retain old media indefinitely
  - Added RingBuffer logical index helpers and iterable support for shared media and jitter queue handling
  - Simplified RingBuffer tail insertion while preserving configured maximum capacity limits

## v0.4.3-alpha.5 (2026/05/16)

### Changed

- `system.js`
  - Added backoff to the Nest API subscribe loop after upstream failures or timeouts to avoid rapid retry/log loops during Nest service outages
  - Added matching backoff to the Google API observe restart loop so gRPC observe failures do not retry aggressively during upstream outages
  - Restored the normal low-latency subscribe/observe cadence automatically after the next successful upstream response

- `streamtransport.js`, `nexustalk.js`, `webrtc.js`
  - Centralised transport lifecycle debug logging in `StreamTransport` and folded host/session details into the shared state log line
  - Reduced duplicate NexusTalk/WebRTC connection debug lines during connect, redirect, reconnect, and ready transitions
  - Centralised stream resolution/FPS debug reporting in `StreamTransport` with generic media metadata log messages
  - Centralised public transport API error handling in `StreamTransport` wrappers while protocol implementations now use `doOpen`, `doClose`, `doUpdate`, and `doSendAudio` hooks

- `nexustalk.js`
  - Fixed NexusTalk talkback stop handling by preserving the explicit empty audio payload field when encoding `AudioPayload`, allowing the backend to return `TALKBACK_END` instead of closing the stream socket

## v0.4.3-alpha.4 (2026/05/xx)

### Changed

- `webrtc.js`
  - Further relaxed WebRTC audio hard-resync tolerance for delayed callbacks after long-running stream testing
  - Added WebRTC audio micro-gap tolerance so small timestamp holes are absorbed by queued real audio instead of immediately inserting blank PCM
  - Reduced WebRTC audio gap debug noise by suppressing isolated single-frame fills when the queued audio depth remains healthy
  - Deferred automatic WebRTC reconnect startup until teardown has fully cleared to avoid a reconnect attempt getting stuck at `transport-connecting`

## v0.4.3-alpha.3 (2026/05/13)

### Changed

- `webrtc.js`
  - Increased WebRTC audio playout delay to improve tolerance of transport jitter before PCM is handed to `Streamer`
  - Relaxed WebRTC audio hard-resync thresholds so delayed callbacks do not create avoidable short silence-fill gaps
  - Changed audio silence fill so empty queue ticks are not treated as gaps unless RTP-derived timing shows audio is actually due
  - Added sustained audio-starvation recovery that reconnects only when audio fill persists while video remains active
  - Added a small video RTP reorder window before H264 FU-A assembly so delayed fragments and RTX recovery can arrive before incomplete frames are abandoned
  - Added an extra young FU-A timestamp-switch guard at the drop point to avoid abandoning very recent non-keyframe fragments
  - Normalised recovered RTX packets into the original RTP sequence path before H264 packet parsing
  - Preserved original RTP receive time through the video reorder buffer so emitted source media timestamps are not biased by packet hold time
  - Added a keyframe request in-flight guard so repeated PLI requests cannot stack during recovery

- `streamer.js`
  - Slightly increased live stream playout delay to smooth small transport jitter without changing recording playout behaviour
  - Added adaptive live playout delay so `Streamer` can absorb temporary source jitter and relax back toward lower latency after stable output
  - Added transport media-quality counters to support dumps for audio fill, video reorder recovery, keyframe requests, video drops, and reconnect reasons

- `streamtransport.js`
  - Added shared transport diagnostics counters for media-quality and reconnect-reason tracking
  - Tightened emitted media-frame metadata normalisation before frames are passed to `Streamer`

- `nexustalk.js`
  - Added transport video-drop accounting when an oversized pending NexusTalk frame is reset

- `plugins/camera.js`
  - Tightened the camera/streamer boundary so camera setup now centralises Streamer and transport construction
  - Awaited Streamer teardown when migration or streaming protocol changes require replacing the active streamer

## v0.4.3-alpha.2 (2026/05/13)

### Changed

- `streamer.js`
  - Reworked the media pipeline to use a shared `MediaTimeline` for retained media buffering and indexed playback
  - Added independent video/audio cursors per output session to improve live stream pacing and prevent audio starvation behind bursty video delivery
  - Improved live camera stream pacing to reduce bursty delivery into ffmpeg
  - Ensured media timestamps strictly advance when an upstream source repeats or regresses timestamps
  - Added catch-up handling for lagging outputs to recover smoothly without excessive burst playback
  - Added decoder-safe startup handling with optional keyframe gating for recording outputs
  - Added automatic SPS/PPS bootstrap injection for H264 outputs before first keyframe when required
  - Avoided writing an extra H264 start code for video already normalised to Annex-B before output
  - Adjusted live audio/video drain limits to reduce small audio pauses when video frames arrive in bursts
  - Decoupled live output audio/video cursors so due audio is not pinned behind capped or bursty video output
  - Added support dump diagnostics for:
    - source media arrival gaps
    - output write gaps
    - output catch-up behaviour
    - audio blocked behind capped video output
  - Added transport abstraction layer support via `StreamTransport` for protocol-specific stream backends

- `mediatimeline.js`
  - Added shared ordered media timeline implementation for retained camera media
  - Added media-specific indexes for video, audio, and keyframes to improve lookup performance
  - Added efficient decoder-safe keyframe discovery for new live and recording sessions
  - Improved retention trimming using protected output cursors

- `streamtransport.js`
  - Added new shared transport base class for camera streaming backends
  - Standardised transport lifecycle handling (`connecting`, `ready`, `reconnecting`, `closed`)
  - Added shared codec metadata reporting and media statistics collection
  - Added shared stream-health helpers for bad-event windows, recovery scoring, and delta suppression state
  - Added unified transport-to-streamer media interface for complete audio/video frame delivery

- `webrtc.js`
  - Refactored WebRTC streaming to use the new `StreamTransport` architecture
  - Requested a startup keyframe after the incoming video SSRC is known so WebRTC live streams do not wait for the natural keyframe cadence
  - Allowed slower startup keyframe assembly and delayed decoder-ready output until SPS/PPS parameter sets are available
  - Added a small paced audio playout queue with bounded silence fill so short WebRTC RTP callback gaps do not starve ffmpeg audio input
  - Removed temporary WebRTC hot-path and raw audio timing probes after moving RTP reordering onto the shared transport jitter helper
  - Moved generic WebRTC stream-health bookkeeping onto shared `StreamTransport` helpers while keeping WebRTC-specific PLI/recovery decisions local
  - Added runtime transport update support for refreshed OAuth2 credentials and Google Home device UUID changes
  - Improved internal stream recovery and transport lifecycle handling

- `nexustalk.js`
  - Refactored NexusTalk streaming to use the new `StreamTransport` architecture
  - Added runtime transport update support for refreshed access tokens, Nest/Google device UUID changes, NexusTalk host updates, and Google authentication mode changes
  - Improved NexusTalk host-change handling so active sessions reconnect cleanly when the backend redirects or changes host
  - Always request AAC audio from NexusTalk to keep the upstream media profile aligned with the ffmpeg input pipeline
  - Improved offline/unreachable camera handling so `ERROR_LEAF_NODE_CANNOT_REACH_CAMERA` no longer causes rapid reconnect loops
  - Improved separation between transport responsibilities and HomeKit-facing stream output

- `plugins/camera.js`
  - Refactored camera stream setup to inject protocol transports (`WebRTC` / `NexusTalk`) into the shared `Streamer` pipeline
  - Added dynamic transport updates for API access changes without recreating streamer instances
  - Added support for passing shared API access configuration into transport backends
  - Reserved prepared live-stream UDP ports until session cleanup to prevent local port reuse between simultaneous viewers and talkback paths
  - Improved migration handling when switching between Nest and Google Home streaming backends

## v0.4.2-beta.4 (2026/05/11)

- `plugins/protect.js`
  - Fixed Nest Protect `wired_or_battery` translation so `0` is treated as wired and `1` as battery
  - Added `StatusActive` and `StatusFault` handling to the carbon monoxide service to mirror the smoke service
  - Split smoke and carbon monoxide fault reporting so each service uses its own component self-test result while still faulting when the Protect is offline or expired
  - Improved Google API Protect heat/temperature mapping using the temperature fault trait instead of PIR motion data
  - Fixed Google API Protect safety summary failure parsing for smoke, CO, and temperature self-test status

- `config.schema.json` / `config.js`
  - Fixed Homebridge UI-X config validation warnings caused by optional blank Home/Device placeholder rows
  - Tightened account validation so blank Google/Nest credential fields are rejected
  - Ignored placeholder Home/Device override rows at runtime unless they include a home name or device serial number

## v0.4.2-beta.3 (2026/05/10)

- Follow-up beta after `v0.4.2-beta.2` was unpublished.

- `HomeKitDevice`
  - Fixed partial `.UPDATE` payload handling so updates such as refreshed camera API credentials are merged with existing device data before validation
  - Prevents auth-only updates from being dropped when they do not include required full device metadata fields

- `plugins/camera.js`
  - Forwarded updated camera auth/host details to already-created streamer instances
  - Fixes active NexusTalk/WebRTC streams continuing to use stale credentials after token refresh

- `system.js`
  - Injected camera API auth details before initial camera/doorbell/floodlight accessory setup so streaming backends receive credentials during first construction

## v0.4.2-beta.2 (2026/05/10)

> This version was unpublished due to issues identified after release.

- `plugins/heatlink.js`
  - Fixed EveHome GET message handling for Heat Link history/status payloads

- `connections.js`
  - Added a dedicated connection manager for Nest/Google account runtime state, authorisation, token refresh, retry scheduling, gRPC transport ownership, and snapshot waiter cleanup
  - Moved runtime connection building out of `config.js`; configuration processing now stays focused on validation/defaulting
  - Excluded accounts are now filtered during connection creation and are not stored in runtime connection state
  - Consolidated initial authorisation, retry backoff, and token refresh into a single lifecycle timer per connection

- `system.js`
  - Wired platform startup to the new `Connections` manager after Homebridge has finished loading
  - Removed inline account authorisation and reconnect handling from the platform manager
  - Tightened subscribe/observe loop rescheduling so stale in-flight requests cannot restart loops after shutdown
  - Quietened duplicate Google camera activity-history timeout logging by treating gRPC request timeouts as no recent events

## v0.4.2-beta.1 (2026/05/09)

This beta focuses on thermostat and Heat Link control-path fixes. Please test thermostat setpoint changes and any systems with optional fan, humidifier, dehumidifier, or hot water controls.

- `plugins/*.js`
  - Aligned device plugins description/name generation with shared device naming handling

- `plugins/thermostat.js`
  - Fixed HomeKit `TargetTemperature` writes so heat mode updates the Nest heating setpoint and cool mode updates the Nest cooling setpoint
  - Improved dynamic fan setup so newly-added fan services use the incoming device state during update processing
  - Improved dynamic humidifier/dehumidifier setup so newly-added services and threshold characteristics use the incoming device state
  - Added/removes humidifier and dehumidifier threshold characteristics when capabilities change after startup
  - Updated humidity control valid values when humidifier/dehumidifier capabilities change

- `plugins/heatlink.js`
  - Added dynamic HomeKit service handling for hot water temperature and hot water boost capability changes
  - Hot water temperature control now appears only when usable temperature data is available
  - Newly-added hot water services now initialise from the incoming device state during update processing

- Recommended beta testing
  - Verify heat mode setpoint changes stick after HomeKit/Home app changes
  - Verify cool mode setpoint changes stick where cooling is supported
  - Verify range/auto heat and cool thresholds still behave correctly
  - Verify fan speed controls appear only where supported
  - Verify humidifier/dehumidifier threshold controls appear and disappear correctly
  - Verify Heat Link hot water temperature and boost controls appear only when supported

## v0.4.0-beta.16 (2026/04/26)

- Standardised device description and location handling across all device types for improved HomeKit naming consistency, resulting in cleaner and more user-friendly accessory names

- `plugins/*`
  - Added support for `whereLabel.literal` in Google protobuf data as primary location source
  - Improved fallback handling to use `whereAnnotationRid` when literal labels are not present
  - Added case-insensitive de-duplication between description and location to prevent duplicate names (e.g. "Front Door - Front Door")
  - Refined device-specific location handling:
    - Thermostat, Protect, Heat Link, Temperature Sensors: use room (`where`) only
    - Camera/Doorbell: prefer room (`where`) with optional fixture fallback
    - Locks: prefer fixture (door) naming with room as secondary context where applicable
  - Ensured consistent string handling using safe `String(...).trim()` patterns across description translators

- `grpctransport.js`
  - Introduced structured gRPC result handling with `status`, `message`, `code`, and `error` fields
  - Improved transport error classification and timeout detection
  - Normalised gRPC trailer handling to expose server status codes via `code`
  - Added consistent error propagation for decode, handler, and transport failures
  - Improved debug logging to include status, code, message, and frame counts for easier troubleshooting

## v0.4.0-beta.15 (2026/04/24)

- Replaced `isNaN(...)` checks with `Number.isFinite(Number(...))` across the code base for stricter numeric validation

- `system.js`
  - Added validation of restored cached accessories during startup
  - Invalid or incomplete accessories are now removed from cache to prevent stale state issues

- `plugins/camera.js`
  - Added back missing `Active` characteristic back to motion sensor, as got dropped during recoding (required for HKSV recording)
  - Fixes recordings not triggering after plugin restart
  - Refined camera online/offline transitions to ensure correct buffering and recording behaviour

## v0.4.0-beta.14 (2026/04/22)

Perhaps 13 is an unlucky number? I broke some things :-( Thanks to [@marving11](https://github.com/marving11) for catching these.

- `webrtc.js`
  - Fixed WebRTC connection gating issues causing premature connect aborts
  - Removed dependency on `SOURCE_CONNECTING` for async flow control

- `plugins/camera.js`
  - Fixed streaming protocol detection for non-migrated devices
  - Updated migration logic to use `migrating !== true` instead of strict `false`
  - Improved handling of Nest <-> Google migration states
  - Minor translation logic refinements

## v0.4.0-beta.13 (2026/04/21)

- `nexustalk.js`
  - Fixed re-authorisation handling (use reconnect flow instead of inline reauth)
  - Fixed reconnect race condition with `streamer.js`

- `streamer.js`
  - Refinements to playout buffer
  - Prevented stale video frames from previous sessions affecting new stream state on reconnect

- `thermostat.js`
  - Removed OccupancySensor service from thermostat devices

- `plugins/homeaway.js`
  - Added Home/Away accessory exposing structure occupancy as an OccupancySensor

- `system.js`
  - Minor code fixes

- `plugins/tempsensor.js`
  - Added generation values to temperature sensors [@mtcislak-max](https://github.com/mtcislak-max)

## v0.4.0-alpha.24 (2026/04/18)

- Fixed re-authorisation issues in `nexustalk.js`
- Implemented a playout smoothing buffer in `streamer.js`
- Fixed notification for authorisation token changes to camera devices

## v0.4.0-alpha.23 (2026/04/16)

- Refactored thermostat, temperature sensor, lock, camera, and protect data processing to use a unified field mapping structure
- Simplified `processRawData()` across modules to align with updated implementation
- Removed cross-device raw data mutation between thermostat and temperature sensor modules
- Temperature sensor now derives associated thermostat directly from thermostat relationships during processing
- Added `active_rcs_sensor_temperature` to thermostat data model and aligned behaviour across Google and Nest APIs
- Thermostat `current_temperature` now consistently reflects the active remote sensor when selected
- Improved handling of partial vs full updates using shared mapping logic
- Reduced complexity and duplication in device processing pipelines
- Improved consistency between Google and Nest data handling
- Cleaner separation of responsibilities between device modules
- More predictable and maintainable data flow
- Relaxed live camera stream startup logic to improve compatibility with older Nest cameras (Hello, Indoor, Outdoor)
- Live streams now attach directly to the buffer and begin output immediately instead of waiting for a recent keyframe
- Improves stream startup time and resolves cases where live view would fail to start
- Recording (HKSV) pipeline unchanged

## v0.4.0-alpha.22 (2026/04/13)

Due to the volume of changes in this release, versioning has been reverted to alpha

- Reworked stream processing in `streamer.js` using a shared `RingBuffer` to eliminate O(n) buffer shifts and reduce latency
- Added reusable `RingBuffer` implementation for media queueing
- Improved live stream startup, catch-up, and playback responsiveness
- Simplified and stabilised output loop timing for more consistent real-time playback
- Improved fallback frame handling for missing or delayed video
- Improved internal tracking of streaming, recording, and buffering state transitions
- Fixed issue where stream startup details (resolution and FPS) were not always logged in `streamer.js`

- Refactored WebRTC pipeline in `webrtc.js`
  - Improved H264 NAL unit handling and FU-A reassembly
  - Improved RTP packet handling, ordering, and jitter tolerance
  - Improved stream readiness and startup behaviour

- Added shared Google gRPC transport for protobuf-based API communication
  - Centralised HTTP/2 session pooling and lifecycle management
  - System-level Google API communication now uses HTTP/2 (gRPC)
  - Improved request/response parsing and validation
  - Improved error handling and terminal state tracking

- Integrated gRPC transport into WebRTC (Google Foyer) signaling and control
- Improved NexusTalk stability and buffering (aligned with new streamer model)

- Removed `localAccess` device configuration option
- Fixed configuration schema types (`fanDuration`, `hotwaterBoostTime`, `motionCooldown`, `doorbellCooldown`)  
  [@retuer-commits](https://github.com/retuer-commits)

- Fixed regression from `0.3.9` where Nest x Yale locks were no longer discovered  
  [@DigitalFokus](https://github.com/DigitalFokus)

- Small fix in `thermostat.js` for eco mode temperature checks

- _Testing_ direct local WebRTC stream path enabled by default for Google Home cameras (bypassing remote relay where available) in `webrtc.js`
- _Testing_ 15fps default live transcoding output to better match source frame rate in `camera.js`

## v0.4.0-beta.12 (2026/04/09)

- Updated project dependencies: `protobufjs` and `HomeKitDevice`
- Refined streaming pipeline across `streamer.js`, `nexustalk.js`, and `webrtc.js`
- Adjusted live streaming pacing to improve startup reliability and compatibility with WebRTC sources
- Updated ffmpeg live stream startup in `camera.js` to wait up to 2000ms for the stream source to become ready
- Added `ffmpegTranscode` option (global and per-device, disabled by default) to enable optional video/audio transcoding for live streams
- Refactored snapshot handling to centralise caching and protobuf freshness logic in `system.js`
- Removed per-camera snapshot caching from `camera.js` to simplify the pipeline and avoid duplicate logic
- Improved snapshot responsiveness by prioritising recent cached images over immediate protobuf refreshing

## v0.4.0-beta.11 (2026/04/02)

- Refactored streaming pipeline to use frame-based video/audio handling across WebRTC and NexusTalk
- Updated Streamer to operate as a unified media output layer
- Improved WebRTC RTP handling with basic jitter buffering for smoother playback
- Fixed HomeKit talkback audio reliability issues
- General stability and performance improvements for live streaming and HKSV

## v0.4.0-beta.10 (2026/04/02)

> ⚠️ This release was pulled and is no longer available.

- This version was unpublished due to issues identified after release.

## v0.4.0-beta.9 (2026/04/01)

- Fixed memory leak introduced in `0.4.0-beta.8` affecting long-running camera streams
- Standardised module header documentation across the codebase

## v0.4.0-beta.8 (2026/03/31)

- Refactored NexusTalk and Streamer to use frame-based output instead of packet-based handling
- Improved streaming performance and stability, especially under load (multiple active cameras)
- Optimised output scheduling to skip inactive streamers and reduce CPU usage
- General efficiency improvements across streaming pipeline

## v0.4.0-beta.7 (2026/03/30)

- Added support dump statistics when live streams end for improved troubleshooting
- Introduced detailed streamer metrics (startup timing, packets, drops, outputs, last activity)
- Refined video gating for more reliable keyframe handling and stream startup
- Improved source state tracking and reconnect visibility
- General streaming pipeline refinements and cleanup

## v0.4.0-beta.6 (2026/03/28)

- Main changes are around the video/audio pipelines in `webrtc.js` and `streamer.js` to improve stability and recovery from packet loss, especially for video streams
- Added logging and cleanup around talkback stream handling




