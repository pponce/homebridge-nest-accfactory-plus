# Climate dashboard

The optional standalone dashboard gives Nest Climate Cntrl its own web address using direct HTTP, direct HTTPS, or HTTPS through a local reverse proxy. Use a computer, tablet, or phone to see thermostat status, choose supported controls, inspect sensors, and run climate automation rules.

Each climate rule is disabled by default. Enable and save individual rules to run bounded heating control, room-fan actions or combined occupancy sensing.

Start with [web access](#enable-web-access), then try a [temperature group](#temperature-group-example), [room-fan rule](#room-fan-example), or [Home/Away rule](#homeaway-example). For a proxy deployment, see [HTTPS through a reverse proxy](#https-through-a-reverse-proxy).

## Admin interface at a glance

The standalone dashboard provides a visual interface for daily use and supported configuration:

| Area | What to use it for |
| --- | --- |
| **Overview** | Check temperatures, targets, heating/cooling activity and account connectivity. See each rule-assigned room fan and combined presence sensor with an explanation of its state. Use supported native Nest controls and inspect schedules and observed runtime. |
| **Sensors & fans** | Discover configured Homebridge main and child bridges. Search and filter temperature, motion, occupancy and fan sources; inspect their readings and availability. |
| **Climate rules** | Build named temperature groups, Home/Away rules and room-fan rules with source pickers and current-signal previews. Enable selected rules and inspect their live execution status, timers and pause/resume controls. |
| **Accounts & web access** | View account and web access status. Manage credentials, optional web access and initial setup from this page in Homebridge Settings. |
| **Settings** | Choose heating type, collect local response history, review per-rule recommendations, and change the dashboard name and supported accessory options. Save changes with account credentials and bridge identity preserved; the dashboard identifies options requiring a restart. |

The same climate application is available in **Homebridge → Plugins → Nest Climate Cntrl → Settings**. Open **Menu → Accounts & web access** there for Google/Nest credentials and web login, certificate and network settings. Named rules and live controls are available in both interfaces.

The runtime starts only with a usable, non-excluded Nest or Google account. Without one, no climate listeners, automation or discovery run. Homebridge Settings opens **Accounts & web access** when no usable account is saved. Add an account, use **Homebridge’s Save button at the bottom of the window**, and follow its restart prompt. Once an account is saved, future visits open **Overview**, including when the bridge is temporarily unavailable. Once configured, the Homebridge interface works with standalone web access disabled. Standalone web access defaults off; creating web login credentials does not enable it.

Both interfaces use visual controls rather than requiring hand-edited JSON. The standalone dashboard adapts to desktop and phone screens and can be [added to an iPhone or iPad Home Screen](#add-to-your-phone).

## Understand automatic decisions

**Your room fans** shows compact cards with fan icons for discovered Homebridge room fans, including fans that are Off or have no climate rule assigned. Cards show reported power and speed, including saved speed-mapping labels. Fan status comes from current source readings independently of rule activity. A known fan whose bridge disappears remains visible as Unavailable for the current dashboard session. Expand **Why this fan and speed?** to see the selected rule and competing rules, individual sensor readings, their equal average, start and stop thresholds, and the speed calculation. Temperature-based speeds include the configured curve and the nearest supported fan setting. The details identify pending device confirmation, update intervals, small speed changes that are held, manual overrides and restoration of the previous setting. A clear run condition can leave a fan on when its previous setting was on.

**Home & away** appears when at least one presence rule is saved. Each rule has a compact card with an occupancy icon and its combined output; disabled rules remain visible with their status. Raw motion or occupancy sources do not create Overview cards by themselves. Expand **Why this presence status?** to see whether each selected motion or occupancy source currently counts toward Home. Motion can continue contributing after the sensor reports clear: the details show the last time the rule observed motion and when the hold expires. Once the combined Home condition clears, the separate Away countdown appears. An unavailable source cannot confirm Away. Manual overrides display their expiry and take priority over sensor contributions.

Under each thermostat, expand **Temperature controlled by** for individual rule calculations: selected sensor readings, room average, desired room target and its origin, Nest’s built-in temperature, the bounded compensation, and the calculated target. Reported and requested Nest targets remain separate, with the minimum adjustment interval shown.

These explanations reflect saved rules and a completed engine evaluation. They do not use unsaved rule edits or send equipment commands. Every explanation includes its evaluation time; stale or disconnected status is identified as unavailable. Source-read times describe when the plugin read a source, and activity times describe what the rule observed, rather than a sensor’s complete event history.
## Optional fan speed mappings

In **Sensors & fans**, expand **Speed mapping · optional** on a fan card. Select **Add speed range** for each physical setting, enter a label such as **Speed 5**, and enter its **From %** and **To %**. Both endpoints are included. Ranges use whole percentages from 1 to 100; zero is always Off. Ranges on one fan must not overlap, and each label must be distinct. Save changes to apply the mapping without restarting the child bridge. Remove all rows to return to percentage-only behavior.

Mappings belong to the individual fan and apply to every rule using it. Fixed-speed and temperature-based rules first calculate the requested percentage, then choose a supported command within the corresponding mapped range. They prefer the range midpoint while respecting the fan’s native supported values and the rule’s minimum/maximum command percentages. A range cannot add a speed that the fan does not support. The temperature curve retains its configured endpoints; lowering its maximum rescales that curve over the same temperature interval.

A fan may report a different percentage for the same physical setting. With **65–78% = Speed 5**, a request in that range and settled feedback of 71% count as the same setting. Rules avoid redundant writes within a setting, accept equivalent feedback, and continue detecting changes to another setting or to power. Changes between mapped settings still respect the normal update interval; they are not suppressed by the five-percentage-point filter used for unmapped speeds. Previous settings are restored within the owning rule’s command cap. Reported percentages can differ from command limits when both represent the same physical setting.

**Use last setting** continues to control power without selecting a new speed; the mapping helps identify equivalent feedback and label the reported setting. Overview details and rule previews show mapped labels alongside percentages. Overview reflects saved configuration; previews can reflect unsaved edits. Individual unmapped percentages and fans without mappings keep their normal behavior. Fractional feedback is compared exactly; whole-percentage ranges do not infer fractional rounding. Mappings are entered manually and are not imported by inspecting another plugin.

## Upcoming Nest schedule changes

In **Overview → A week of comfort**, choose **Selected thermostat** to view that thermostat’s runtime chart and **Coming up** card. The card repeats the thermostat name, current mode and any active Eco setting. It lists the next three reported weekly schedule entries in upcoming order using the thermostat’s schedule time zone. Heat mode shows only heating targets, Cool mode shows only cooling targets, and Heat / Cool shows both with labels.

The card also identifies the current climate temperature rule and its reported status. While a rule is controlling heating, a confirmed Nest scheduled heating target becomes its desired room temperature. The rule adjusts Nest’s actual target using its selected sensor readings, adjustment limit and minimum update interval. For equal averaging, the desired temperature applies to the selected sensors’ average. The target sent to Nest can differ from that desired temperature.

Without an active climate temperature rule, Nest uses its selected native sensor. With the built-in sensor selected, the scheduled target applies to the thermostat’s own temperature reading. Paused, disabled, waiting and unavailable rules are labeled separately; an enabled rule alone does not confirm active control.

Hover over, focus or tap the **?** beside **Coming up** for help comparing these setups. Escape, a second tap or clicking outside closes it. A rule must still be controlling heating when a schedule change occurs for it to adopt that target. Rule windows, Eco, Off and holds can affect the outcome, so a planned time does not confirm when a temporary adjustment ends. Offline values are marked as last reported.

## Navigate on phones and in Homebridge

Use **☰ Menu** to switch between **Overview**, **Sensors & fans**, **Climate rules**, **Settings** and **Accounts & web access**. In Homebridge Settings and on narrow web screens, navigation starts collapsed so the page can use the available width. The menu opens over the page and closes when you select a destination, click outside, press Escape or move keyboard focus out of it. The current page is highlighted. On the standalone mobile dashboard, the menu also includes **Sign out**.

The standalone dashboard uses a persistent sidebar on wider desktop screens. Resizing the window switches between layouts without discarding unsaved changes.

## Enable web access

1. Open **Homebridge → Plugins → Nest Climate Cntrl → Settings → Menu → Accounts & web access**. Add your Nest or Google credentials if needed.
2. Select **Enable standalone web dashboard** and create a **web username and password**. Use at least 8 characters for the password. This login is separate from Nest, Google and Homebridge.
3. Select **Save web login** if you are creating or changing the separate dashboard login. Then use **Homebridge’s Save button at the bottom of the window** to save connection settings and follow its restart prompt. Initial account and web login setup works before the bridge is running. Changing an existing web login requires the bridge to be running.
4. Open the configured address, usually `https://<homebridge-host>:9444`. The default HTTPS port is **9444**.

The web server is off by default. Under **Menu → Accounts & web access → Web connection mode**, choose how browsers reach it:

| Connection mode | Browser connection | Certificate owner | Backend |
| --- | --- | --- | --- |
| HTTP · unencrypted | `http://<host>:9444` | None | HTTP on the selected listen address |
| HTTPS · certificates in plugin (default) | `https://<host>:9444` | Plugin uses supplied PEM files or generates a local certificate | HTTPS on the selected listen address |
| HTTPS through reverse proxy | Your public HTTPS origin, such as `https://climate.example.com` | Nginx or another proxy on the same machine | HTTP at `127.0.0.1:9444` only |

Save and restart the Nest child bridge after changing network settings. All three modes require the separate web login. The web port is configurable from 1024–65535.

## Choose temperature units

In the standalone dashboard, open **Settings → Your dashboard → Temperature units**, choose **Celsius (°C)** or **Fahrenheit (°F)**, then **Save changes**. The same **Settings → Temperature units** control and **Save changes** action are available inside Homebridge plugin Settings. The standard configuration form includes **Dashboard temperature units** under **Web dashboard**.

Celsius is the default. The choice applies to readings, schedules, sensor previews, room targets, fan thresholds, adjustment limits, turn-off gaps and execution status. It is shared across browsers for this Climate platform. Refresh another open dashboard after saving. Changing only the units requires no bridge restart and preserves the temperatures in existing rules. Nest and Apple Home have separate display-unit settings.

For example, **21 °C = 69.8 °F** for a target, while a **1 °C turn-off gap = 1.8 °F**. A fan set to start above **77 °F**, with a **1.8 °F** gap, stops at **75.2 °F** or below when it is owned by that rule.

## Try your first rules

Small information icons beside rule field names explain what each setting does. Hover over an icon, focus it with the keyboard, or tap it on a phone. Press **Escape**, tap the icon again, or click outside to close the help. Temperature examples use the current draft and your selected Fahrenheit or Celsius units. Reading help does not change or save a rule.

Create each rule with **Enable automatic execution** off to inspect its inputs first. Turning it on and selecting **Save changes** enables that rule without a bridge restart. It starts when its required inputs and thermostat setup are ready. The **Execution status** panel reports the running engine; **Current signals · preview only** is a separate snapshot of the editor's inputs.

The engine checks rules approximately every **15 seconds**, including when no browser is open. Slow bridge responses can extend this interval. Motion inputs are polled, so very short pulses between polls may be missed. Sensors that maintain an occupancy state are useful alongside motion sensors.

### Find your sources

1. Sign in and open **Sensors & fans → Discover sources**. Associated Nest sensors appear as the Nest account connects; discovery adds compatible services from configured Homebridge main and child bridges.
2. Check **Bridge connections & source availability** if a source is missing. Homebridge accessory control (`-I`) must be enabled on the source bridge, and that bridge must be reachable with its configured credentials.
3. Use the **Temperature**, **Presence** and **Fans** filters to inspect readings and availability.

Third-party devices must expose a compatible temperature, motion, occupancy or fan service through Homebridge. Devices available only in Apple Home are not discoverable here. Room fans need standard writable on/off control; fixed and temperature-based speed also need readable, writable percentage speed control. A generic switch is not automatically treated as a fan. Combined Climate presence outputs are excluded from discovery to prevent feedback loops.

The visible dashboard refreshes Nest and external Homebridge readings every **30 seconds** and refreshes immediately when you return to its browser tab. **Refresh status** also updates external readings. Temperature sources, fan states and presence signals update in place while you edit a rule, preserving selections, search text and keyboard focus.

Discovery records when a value was read, which may differ from when the sensor measured it. Enabled rules refresh their inputs automatically. A missing or stale selected source is not silently dropped from a temperature average or treated as evidence that nobody is home.

### Temperature group example

**Goal:** use the temperatures in the occupied rooms to guide a Nest thermostat's heating target.

1. On **Overview**, confirm that the thermostat is online. Use **Heat** mode and turn **Eco off** through your normal Nest controls. Nest must use its built-in thermostat sensor while a temperature group controls heating. Mixed groups can offer the assisted sensor setup described below; other groups require this selection through your normal Nest controls.
2. Open **Settings → your thermostat → Heating response & tuning** and check **Nest schedule time zone**. **Automatic** uses the named time zone reported by the thermostat, or its paired Nest home. If Nest has not reported one, choose a zone such as **Pacific Time — Los Angeles** and save before enabling a group that uses a Nest weekly schedule.
3. Open **Climate rules → Temperature → Create temperature group**, or use **+**. Name it **Downstairs comfort** and select the thermostat serving those rooms.
4. Enter your target in **Desired room temperature**, using the units shown beside the field. For example, enter **21 °C** or **69.8 °F**. Live heating targets must be between **9 and 32 °C (48.2–89.6 °F)**.
5. Choose **Equal average of selected sensors** and select two or more inputs. A Nest living-room sensor at **20 °C** plus a Homebridge dining-room sensor at **22 °C** averages **21 °C**. Nest-only, other Homebridge-only and mixed groups are supported. For a single room, choose **One selected sensor** and select exactly one input.
6. Review **Maximum target adjustment** and **Minimum update interval (minutes)**. Defaults are **1.5 °C / 2.7 °F** and **5 minutes**; a **0.5 °C / 0.9 °F** adjustment limit is a useful starting point for a small, supervised trial.
7. Turn on **Enable automatic execution** and select **Save changes**. If a group mixes Nest room sensors with other Homebridge temperature sensors and needs native sensor setup, review the in-page confirmation. **Prepare thermostat** authorizes the sensor changes; **Keep current settings** leaves the group waiting. Watch **Execution status** for sensor confirmation, the group reading, desired room target, physical Nest target and command feedback. It can take a polling cycle and device feedback for a change to appear.
8. Confirm the target on the physical thermostat or in Nest. Use **Pause thermostat automation** to finish the trial. The engine restores its previous target only while it still owns that setting and Nest remains in the same control context.

The heating controller starts with:

```text
Nest target = desired room temperature
            + built-in Nest temperature
            - selected-room temperature
```

It limits that adjustment, rounds on the device's Celsius/Fahrenheit grid, and keeps the final target between 9 and 32 °C. For example, if Nest reads 22 °C, the selected rooms average 20 °C and the desired room temperature is 21 °C, the unbounded target is 23 °C. With the default 1.5 °C limit, the target is capped at 22.5 °C.

Several enabled groups can share a thermostat. The highest-priority group inside its time window controls it. A group does not create an independent physical HVAC zone or pair third-party devices as native Nest sensors. Heating compensation supports Heat mode and equal sensor averages; it does not compensate in Cool or Heat/Cool range mode.

### Time windows and priority

**When to run → Always** is the default: all day, every day, subject to the rule's other conditions. Existing rules keep this behavior. Choose **Scheduled window** to set start days, start/end times, and a named time zone. Switch back to **Always** to remove the time restriction.

Create separate rules when the sensors, desired temperature, or fan settings differ. For example:

| Rule | Window | Selected temperature sources |
| --- | --- | --- |
| Upstairs night | Every day, 10 PM–6 AM | Both kids' room sensors |
| Upstairs day | Every day, 6 AM–10 PM | Both kids' room sensors, living-room fan sensor, upstairs thermostat |

An end time before its start continues into the next day. A Friday 10 PM–6 AM window ends Saturday morning. The start is included and the end excluded. Select the home's local time zone; daylight-saving changes follow that zone. A skipped local time starts when the clock enters the remaining portion of the window, and repeated hours follow the displayed local time. Changes take effect on the next automation check, normally within 15 seconds.

Drag temperature or fan rules into priority order. The top enabled, unpaused rule inside its window wins for each thermostat. Fan rules must also meet their run condition. An eligible higher-priority rule with missing readings waits for those readings; a lower group does not silently substitute different sensors. **Scheduled** means outside its window, **Standby** means another rule has priority, and **Waiting** means equipment or sensor feedback is needed.

Temperature handoffs preserve the original Nest target for later restoration and the minimum write interval. A temporary manual room target follows the thermostat across groups until the next confirmed Nest schedule target or an explicit reset. Without a temporary target, the incoming group's saved desired temperature applies. **Pause thermostat automation**, or the manual-change pause option, suspends every temperature group for that thermostat. Resume any group to allow the currently eligible group to run.

When no temperature group is eligible, the plugin restores only a target it still owns and lets native Nest control continue. Fan windows use the same priority rules: a successor takes over without an off/on cycle; otherwise the original fan state is restored within its speed limit. Manual fan overrides continue to suspend all rules for that fan. Presence rules have no time-window setting.

These controls are shared by the Homebridge configuration interface and standalone web dashboard. Window changes require **Save changes**, with no bridge restart.

### Manual targets and Nest schedules

The **desired room temperature** is the target for the selected sensor or average. The **Nest target (adjusted)** is the value sent to the thermostat to achieve that room temperature. Both appear in Execution status; the Overview card shows the actual Nest target and its expanded controller information shows the desired room temperature and group reading.

**Pause after a manual Nest target change** is off by default:

- **Off:** changing Nest’s target moves the desired room target by the same increase or decrease, accounting for Nest’s display rounding. This applies to the physical thermostat and Google’s app. For example, a desired room target of **70 °F** with an adjusted Nest target of **72 °F** becomes a desired **71 °F** when Nest is raised to **73 °F**. The selected sensors stay active.
- **On:** changing Nest’s target pauses all temperature groups for that thermostat and leaves that manual setting in place. Select **Resume automatic control** when you want the group to use its saved room target again.

Apple Home follows this same policy when it displays native Nest temperatures.
Saving a changed **Desired room temperature** uses that exact room target. A manual adjustment does not rewrite the saved rule target, sensor membership or Nest’s weekly schedule. **Use saved room target** ends a temporary adjustment without pausing the group. Resume and re-enabling a rule start from the saved target.

At the next reported Nest schedule event, the group waits for Nest to confirm its scheduled heating target, then uses that value as the desired room temperature and continues with the same sensors. An edit to a future schedule point does not end the current manual adjustment. If no Nest schedule is reported, a manual adjustment lasts until another target change, a saved-target reset or Resume. Rule windows select which sensor group is eligible; they do not create a native Nest temperature hold.

Off, Eco, heating-mode changes, temperature locks and native sensor changes still take priority. Failed commands, ambiguous schedule targets and conflicting feedback during a pending adjustment pause control for review. The plugin recognizes its own accepted target writes and does not reinterpret them as manual adjustments.

When an automatic heating command or scheduled target remains unconfirmed for 30 seconds, the plugin refreshes Nest's update stream. Further refreshes use increasing delays, up to five minutes between attempts. Thermostats sharing one account coordinate refreshes and allow their room sensors time to return. After two minutes the rule shows **Recovering feedback** and continues checking automatically. Matching feedback resumes control once the selected readings and normal equipment checks are available. The accepted temperature command is never resent as part of recovery, including across a bridge restart. A newer schedule event replaces the pending scheduled target; delayed feedback for an older event cannot become the new room target.

**Execution status** and the thermostat's expanded details show the pending target, when confirmation began, whether automatic recovery is enabled and the next feedback refresh. The last requested target remains separate from the reported Nest target and its device-update time. A retained schedule room target is identified as retained while feedback is pending or control is paused. A pause selected by you, a conflicting target, a failed command or **Pause after bridge restart** still requires review and Resume.

### Show the room target in Apple Home

In **Settings → your thermostat → Apple Home temperature display**, enable **Show climate rule temperature in Apple Home**. This setting is **off by default for each thermostat** and takes effect after saving on the next automation check, without restarting the bridge.

While a temperature rule controls that thermostat, its existing Apple Home tile shows the selected-sensor temperature as the current temperature and the desired room target as the set temperature. Changing that tile’s target sets the desired room temperature directly, even when **Pause after a manual Nest target change** is on. The group remains active, the saved rule target stays unchanged, and automatic Nest adjustments still respect the configured interval and offset limit.

The physical Nest and Google app continue to show the actual Nest target. Their changes follow the rule’s pause setting. The dashboard shows the desired room target and adjusted Nest target separately. The tile’s heating indicator continues to reflect actual equipment activity; humidity remains the thermostat’s humidity reading.

If the rule is paused, disabled, restoring control, recovering feedback, awaiting a manual or scheduled Nest target, or lacks usable readings, Apple Home shows Nest’s actual temperature and target. Changing that native target does not resume a paused rule. Cooling, Auto/range and Eco also use native readings and controls. The accessory identity stays the same, so existing rooms and scenes are retained; temperature automations use whichever values the tile currently represents.

### Change Eco from the overview

Click a thermostat’s **Eco on/off** button to request a change. The button immediately shows the requested setting with a **pending** badge and a message while Nest confirms it. The dashboard checks reported state every two seconds for up to 30 seconds; it never repeats the command automatically.

If the command fails or remains unconfirmed, the button returns to the last reported setting and a notice explains what happened. A timeout does not cancel a command already sent to Nest, so a later reported change still appears. You can dismiss the notice or make another request when the thermostat is connected.

### See what controls each thermostat

On **Overview → Your thermostats**, **Temperature controlled by** shows the current controller. Expand it to inspect the thermostat’s built-in sensor, associated official Nest room sensors and climate temperature rules assigned to that thermostat. This is read-only information; opening it or clicking a listed item does not change settings.

When a temperature rule manages the heating target, its name appears with **Active**, **Active · between updates**, or **Confirming target** while Nest’s feedback is pending. **Recovering feedback** means adjustments are on hold while the rule checks for delayed confirmation and can resume automatically. **Restoring Nest control** means the rule is returning its previous heating target. Paused, disabled and waiting rules are listed with their status; simply enabling a rule does not identify it as the active controller. Rule status comes from the running engine, including when the settings editor contains unsaved changes.

When Nest controls directly, the heading shows its selected built-in or official room sensor. A confirmed **Thermostat sensor** can be shown even when no external-sensor list is reported. **Current sensor not reported** means Nest has not provided a recognized selection. **Control status unavailable** means current control cannot be confirmed. Native sensor selection is managed in the Nest app; climate temperature rules are managed in **Climate rules**. To use other Homebridge temperature sensors, create a temperature rule and select them as inputs there.

### Assisted Nest sensor setup for mixed groups

Displaying a known native sensor is separate from automatic sensor setup: missing or unsupported sensor-control settings can prevent automatic setup even while the selected sensor is displayed. A positively reported built-in sensor in a recognized native mode can guide a temperature rule when Nest omits its paired-sensor list. This does not authorize native sensor-setting changes. Missing, conflicting or unsupported sensor feedback still blocks heating control.

**Heat mode** is required; the heating equipment does not need to be running. An idle thermostat can follow a temperature rule. A waiting rule names the specific requirement that prevents it from running.

To investigate unavailable setup, open **Settings → Diagnostics & troubleshooting → Diagnose Nest sensor selection → Download sensor diagnostics**. The dashboard refreshes status and downloads one JSON report covering all thermostats. It includes thermostat names and models, connection and update status, selected sensor names, scheduling mode, and specific validation reasons such as missing scheduling mode, missing paired-sensor list, unknown selection, or an unsupported multi-sensor format. It excludes credentials, device IDs, signatures, temperatures and saved schedules. The download only reads status and does not change sensor selections, schedules or heating targets. Review the report before sharing it for support.

A group that selects both a Nest room sensor and a temperature source from another Homebridge accessory can offer **Prepare Nest for group** in **Execution status**. The action is available only after the rule is saved and enabled, while the thermostat is connected and its native sensor controls are recognized.

After you confirm, the plugin selects the built-in thermostat sensor and places native sensor selection on hold. The saved native sensor schedule and paired room sensors are preserved. Nest room sensors remain inputs to the group average. This action does not change the weekly temperature schedule, Heat/Cool mode or Eco. The heating rule waits for fresh Nest feedback confirming the requested sensor setup before adjusting the target.

To return to native sensor control, select **Restore Nest sensor settings** in the rule’s execution panel or on the thermostat’s **Overview** card. After confirmation, the group pauses, restores any heating target it still controls, and then restores the saved native sensor selection and schedule mode. The Overview action remains available after a group is disabled or deleted. Restoration requires the current sensor settings to match the setup made by the group; subsequent manual Nest changes take priority.

If sensor control is unavailable, unknown, or uses an unsupported multi-sensor configuration, the dashboard explains the limitation and keeps automatic setup unavailable. Mixed groups require recognized feedback for both the built-in sensor and native sensor hold before heating can start. A manual selection in the Nest app still needs that supported feedback. **Execution status** distinguishes accepted commands from confirmed device feedback. Confirm the thermostat’s response in the Nest app during the initial trial. Polling does not open setup confirmations, and cancelling a confirmation sends no sensor command.

### Room-fan example

**Goal:** run a Homebridge-exposed ceiling or room fan when the selected rooms become warm.

1. Discover the fan under **Sensors & fans** and confirm **On/off capable**. Start with the fan off for this trial.
2. Open **Climate rules → Room fans → Create fan rule**, or use **+**. Name it **Living room cooling** and select the fan.
3. Choose **Temperature above threshold**, set **Above temperature** to **24 °C / 75.2 °F**, and **Turn-off gap** to **1 °C / 1.8 °F**.
4. Choose **Use last setting (on/off only)** under **Fan speed**, then select the temperature sources. Multiple readings are averaged. To consider the same rooms as a temperature group, select the same sources here; the fan rule has its own selection.
5. Review the preview, turn on **Enable automatic execution**, and select **Save changes**. Above 24 °C, the rule starts the fan. Once running, it keeps the fan on through the gap and returns it to its previous state at **23 °C or below**.
6. For a supervised trial without changing the room temperature, save a threshold slightly below the current average and observe the fan starting. Then save a threshold whose **threshold minus turn-off gap** is above the average and observe it stopping. Allow at least **one minute between normal fan commands**, plus the polling interval.
7. Restore the threshold you want, or use **Pause rule** to end the trial.

An on/off rule sends no speed command. The fan’s Homebridge plugin may restore its remembered speed or use its configured startup speed. It does not stop a fan that was already running before automation took control. Fan direction remains a manual setting.

To circulate air with the HVAC system, choose **Thermostat is heating** or **Thermostat is cooling** and select the thermostat. The fan follows its reported activity. Cooling circulation helps move cooled air while the AC is active; heating circulation helps move warm air. These triggers do not switch the HVAC system on. Each offers all three speed choices. **Nest HVAC fan timers** are separate controls on **Overview** for the blower connected to Nest; they do not operate these room fans.

### Temperature-based fan speed

First select **Run condition**, then choose **Temperature-based speed** under **Fan speed**. Select fans marked **Speed control** and one or more temperature sources. Their readings are averaged equally. The comfort target only determines fan speed; it does not change a thermostat target.

For a temperature trigger, configure both the on/off threshold and the speed curve. For example:

| Setting | Example |
| --- | --- |
| Run condition | Temperature above threshold |
| Above temperature | 74 °F |
| Turn-off gap | 1.5 °F |
| Fan speed | Temperature-based speed |
| Comfort target | 72 °F |
| Increase speed above target by | 2 °F |
| Reach maximum speed above target by | 6 °F |
| Minimum running speed | 25% |
| Maximum fan speed | 75% |

The rule stays idle at 73 °F, starts just above 74 °F near 25%, reaches 50% at 76 °F, and requests at most 75% at 78 °F or above. Once running, it continues through the turn-off gap and releases control at 72.5 °F or below. Requested speed rises linearly between the minimum- and maximum-speed temperatures.

With **Thermostat is heating** or **Thermostat is cooling**, reported HVAC activity decides on/off. The temperature curve determines speed while that activity is present: a room below the comfort target uses minimum speed, and a warmer room gets more airflow up to the cap. Airflow can help people feel cooler without lowering the measured room temperature.

**Your speed curve** shows the temperatures and each selected fan's supported speeds. The nearest supported step within both limits is chosen; ties use the lower step. For a fan with 25%, 50%, 75% and 100% steps, a 70% cap permits at most 50%. If no running step fits, that fan waits for compatible settings rather than starting at an unspecified speed.

**Fixed speed** uses the nearest supported speed at or below the requested percentage. It requires temperature sources only when the run condition uses temperature. The preview shows each fan's supported fixed speed.

Normal speed adjustments share a one-minute interval across rules. On a temperature curve, changes smaller than five percentage points are ignored except at the minimum or maximum. A lower cap can reduce speed immediately. Speed feedback is confirmed before a separate on command is sent; some fan plugins turn on as part of setting speed. Confirmation can take additional polling cycles. Unsupported or unconfirmed speed control does not fall back to on/off control.

When no rule calls for a fan, automation releases it: a fan started by automation turns off, and a previously running fan returns to its original speed within the final controlling cap. If no supported speed fits a reduced cap, an owned fan is stopped. A cap limits commands from the rule; it does not constrain manual controls or a fan's internal startup behavior. A disconnected Homebridge host cannot send a new speed or stop command.

Review the table, enable the rule, and **Save changes**. **Execution status** reports the current and requested speed, cap and controlling rule for each fan. Previously active fan rules continue after restart checks unless **Pause after bridge restart** is enabled.

### Multiple rules for one fan

A fan may be selected in several rules. In **Climate rules → Room fans**, drag a rule's dotted handle up or down to set its priority. The highest-priority rule appears at the top with a **Highest priority** badge; numbered positions show the remaining order. The top matching enabled rule controls each fan.

Use the **Move up** and **Move down** buttons on touch screens or with a keyboard. A focused drag handle also supports **Up/Down** arrow keys and **Home/End**. Dragging works with a mouse or touch; **Escape** cancels a drag. The list stays vertical on smaller screens.

Reordering edits a draft. Select **Save changes** to apply the order or **Discard** to keep the saved order. Existing rules appear in their saved priority order. New rules start at the bottom, and disabled rules keep their position without competing for control.

| Position | Run condition | Fan speed |
| --- | --- | --- |
| 1 · Highest | Room temperature above 74 °F | Temperature-based, capped at 75% |
| 2 | Thermostat is cooling | Fixed 50% |
| 3 | Thermostat is heating | Fixed 25% |

If the room is warm while the thermostat is cooling, the first rule controls the fan. When its temperature condition clears, the second rule takes over while cooling remains active. Matching rules hand control to each other without an unnecessary off/on cycle, retaining the original fan state for eventual restoration. Normal changes still respect the shared interval. Each fan is evaluated separately, so a rule can control some of its selected fans while a higher-priority rule controls others.

A higher-priority rule with missing required temperature or HVAC readings reserves its fans. Lower rules wait until that condition can be evaluated reliably. Owned settings are restored when possible. Pausing, disabling or deleting a rule makes the next matching enabled rule eligible.

Manual power or speed changes suspend **all rules for the affected fan**, so another rule cannot undo your adjustment. Other fans can continue. Use **Resume automatic control** or **Resume overridden fans** in a rule containing that fan when ready. Resume clears manual overrides for that rule's selected fans; other explicitly paused rules remain paused.

### Home/Away example

**Goal:** publish a combined occupancy sensor using activity from several parts of the home.

1. Open **Climate rules → Home & away → Create presence rule**, or use **+**.
2. Name it **Climate Home presence**. Select the home's **Nest Home/Away** input, a hallway **motion** sensor and an office **occupancy** sensor. Nest status appears when the plugin has its state; other sensors must be exposed through Homebridge.
3. Choose **Any selected source is positive**. Nest reporting Home, positive office occupancy or a held motion detection can each establish Home. **All selected sources are positive** requires all selected inputs to be positive; choose that only if it matches your intended meaning.
4. Set **Motion hold (minutes)** to **10** and **Delay before Away (minutes)** to **20**. The hold extends a motion signal; continuous occupancy remains positive while the sensor reports occupancy. The Away delay starts only after the Home condition clears and all inputs are available.
5. Enable the rule and **Save changes**. A separate occupancy accessory with the rule's name appears in Apple Home. Watch **Execution status** for Home/Away, source faults, and pending timers.
6. To test the timers, use short hold/delay values and trigger a selected sensor. Return to your intended durations afterward. If Nest still reports Home, an **Any** rule should remain Home; do not expect motion inactivity alone to make it Away.
7. Use **Force Home · 1 hour** or **Force Away · 1 hour** for a timed override. **Resume automatic presence** ends it early. Overrides and valid motion holds survive a restart, while the Away delay is re-established from current readings.

Unavailable inputs cannot establish Away. The last confirmed state is retained with fault information; unknown startup state is not published as a confirmed departure. The sensor is read-only in Apple Home. It does not change Google's Home/Away state, activate Eco or directly run another climate rule. Use the combined occupancy sensor in your own Apple Home automations for additional actions you choose.

### Pausing, restarts and connection loss

- **Pause rule** immediately requests a stop to automatic control. Settings still owned by that rule return to their previous values when the equipment is reachable. A newer manual setting is preserved.
- Turning off **Enable automatic execution** or deleting a rule takes effect after **Save changes**. Disabling a presence rule removes its combined occupancy accessory.
- Previously active temperature and room-fan rules continue after restart once current readings and equipment checks pass. Pending automatic heating feedback keeps its expected target and resumes checking without another temperature write. Explicit pauses, manual fan overrides and failed commands still require review. Enable **Pause after bridge restart** in Settings to require Resume after every restart. Presence rules reconcile saved holds/overrides with current readings automatically.
- If the Homebridge host stops abruptly, or Nest/the source bridge cannot be reached, it is impossible to send a fallback command. **The thermostat or room fan may retain its last commanded state.** A graceful shutdown attempts to restore owned settings. Restoring an owned setting after pause or invalid inputs can happen immediately; the minimum interval still applies before the next normal adjustment.
- Failed or unconfirmed commands pause the rule. Check the actual equipment and its connection before resuming. A successful API response is not proof that the equipment reached the requested state.

## HTTP mode

HTTPS is the default. Under **Menu → Accounts & web access → Web connection mode**, choose **HTTP · unencrypted**, save and restart the Nest bridge. The port remains configurable; the default is 9444. Open `http://<homebridge-host>:9444`.

**HTTP sends passwords and dashboard data unencrypted. Use it only on a trusted local network.** This warning appears in setup, before sign-in, in the dashboard and in the startup log. HTTP still requires the web login and validates browser origins and changes. It does not generate or read TLS certificates. Certificate paths stay saved for switching back to HTTPS.

## Use a hostname and trusted certificate

1. Point your internal DNS hostname, such as `climate.example.com`, to the Homebridge host's LAN address.
2. Keep **Connection mode** set to **HTTPS**. Keep **Listen address** at `0.0.0.0` or select the host's LAN IP. Keep **Web port** at `9444` unless that port is already in use.
3. Set **Browser hostname or IP (optional)** to the hostname only, without `https://`, a port or a path.
4. Set **TLS certificate file (optional)** to the full-chain PEM file (server certificate followed by its intermediate certificates). Set **TLS private key file (optional)** to the matching PEM private-key file. The files must exist on the Homebridge host and be readable by its service user; keep the private key restricted.
5. Save, restart the Nest child bridge and open `https://climate.example.com:9444`. Use the hostname covered by the certificate, rather than its IP address. A trusted, valid certificate covering the hostname avoids the certificate warning.

A wildcard certificate for `*.example.com` can cover `climate.example.com`. Restart the Nest child bridge after replacing or renewing certificate files; the listener reads them at startup.

For an IPv6 connection to the dashboard, set **Listen address** to `::`, save and restart the Nest bridge. The default `0.0.0.0` listens on IPv4 only. On systems with dual-stack support, `::` accepts IPv4 as well. Keep the hostname under **Browser hostname or IP (optional)**. IPv6 addresses in a proxy URL need brackets, for example `https://[::1]:9444` for a proxy running on the same host.

## HTTPS through a reverse proxy

Choose this mode when Nginx or another reverse proxy runs on the **same machine** as Homebridge and should own the certificate and HTTP-to-HTTPS redirect.

1. Point the public DNS name to the proxy host's LAN IPv4 and/or IPv6 addresses. Do not point DNS to `127.0.0.1`.
2. In Homebridge's web dashboard settings, choose **HTTPS through reverse proxy**.
3. Set **Public HTTPS origin** to the browser address, such as `https://climate.example.com`. Do not add a path, query, credentials, or the internal backend port. Include a public port only if the proxy actually serves HTTPS on a nonstandard port.
4. Keep **Web port** at `9444`, or choose another unused port. The plugin automatically binds to **`127.0.0.1`**, regardless of a saved direct-mode listen address. The loopback binding applies in proxy mode even if another listen address is saved.
5. No certificate or private-key paths are needed in the plugin. Any saved paths are ignored in this mode; no certificate is generated or read.
6. Configure the proxy backend as **HTTP to `127.0.0.1:9444`** and preserve the browser's **Host** and **Origin** headers. Keep TLS certificates and the HTTP-to-HTTPS redirect at the proxy.
7. Save, restart the Nest child bridge, apply the proxy configuration, and open the public HTTPS address. **Open climate dashboard** uses that address without the internal backend port.

The relevant Nginx configuration for a hostname on port 443 is:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name climate.example.com;
    return 301 https://climate.example.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name climate.example.com;
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9444;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For an existing Nginx site, keep its port-80 redirect and port-443 certificate configuration and change the backend settings. Use the service editor if another application manages the Nginx file. Validate with `sudo nginx -t` before reloading Nginx. Nginx can accept IPv4 and IPv6 clients while using this IPv4 loopback backend. No IPv6 or LAN-address fallback backend is needed.

Only loopback requests with the configured public Host are accepted. Mutations also require the exact public HTTPS Origin and, after sign-in, the session's CSRF token. Cookies remain `Secure`, `HttpOnly`, and `SameSite=Strict`. `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` do not override the configured origin or socket peer. Login throttling is shared by requests through the local proxy. This mode supports a dedicated origin, not a URL subpath, a remote proxy, or a proxy in a separate container network.

If the proxy returns **502**, confirm that the Nest bridge has restarted, the backend is HTTP rather than HTTPS, and the port matches. If the dashboard returns **403**, check the public origin and preserved Host header. Direct access to a LAN IP on port 9444 is unavailable in this mode.

For direct HTTPS without supplying certificates, the plugin generates a local self-signed certificate using OpenSSL. Browsers need to trust it before signing in. A proxy can also forward to the direct HTTPS listener with a trusted backend certificate and preserved public Host; select direct HTTPS for that arrangement.

## Live actions and observations

Live thermostat action buttons send a command immediately. A successful request means the API accepted the command; the displayed state changes after the thermostat reports it.

An **HVAC fan** is the blower connected to Nest. A **room fan** is a separate fan exposed by another Homebridge plugin. Room-fan rules control it only when explicitly enabled. Accessories available only in Apple Home cannot be discovered automatically by this dashboard.

Runtime totals reflect periods observed by the plugin. Gaps are unknown, and runtime is not an energy-consumption measurement.

## Saving settings

Review your changes and select **Save**. **Discard** opens an in-page confirmation: **Keep editing** or Escape preserves your draft; **Discard changes** loads the latest saved setup. Deleting a rule and signing out with unsaved edits also use in-page confirmations. Configuration changes are written to the existing Nest Climate Cntrl entry; account credentials, child-bridge identity, and unrelated plugin settings are retained. The dashboard identifies settings that need a child-bridge restart. Enabled rule changes apply without a restart. Disabled rules remain drafts. After a bridge restart, previously active rules continue after checks unless **Pause after bridge restart** is enabled.

If another settings page saves while you are editing, the dashboard asks you to reload instead of overwriting the newer configuration. Copy any unsaved choices you want to keep, reload, and apply them to the latest settings.

Use Homebridge's plugin settings for account credentials and the web server's network settings. Web sessions expire and are cleared when the Nest bridge restarts. To replace a forgotten web password, create a replacement login from the authenticated Homebridge settings page; existing web sessions are signed out.

Each child bridge has its own web account and, when using direct HTTPS, its own certificate settings. If you enable dashboards for multiple Nest child bridges, assign a different port to each one.

## Add to your phone

On iPhone or iPad, open the dashboard in Safari, select **Share → Add to Home Screen**, and choose **Add**. The plum climate icon and app name are supplied automatically. The dashboard opens in a compact app layout and adapts to narrow screens.

Keep the Homebridge host reachable while using it. The dashboard does not cache account data or provide offline climate control.



## Nest schedule time zone

Choose **Automatic** to use the named time zone reported by the Nest thermostat, with its paired home's zone as a fallback. The picker shows the detected zone and its source. Availability depends on the data Nest supplies for that device; an unavailable value is not inferred from your browser or Homebridge host.

Choose a manual zone to override automatic detection. Common choices include Pacific, Mountain, Arizona, Central, Eastern, Alaska and Hawaii, followed by other supported IANA zones. **Mountain Time — Denver** follows daylight saving; **Arizona — Phoenix** does not. Named zones handle daylight-saving changes automatically. Saved manual choices are preserved.

This setting controls how the plugin interprets Nest schedules and groups heating observations into days. It does not change the thermostat's own time-zone setting. If a weekly schedule exists and no usable zone is available, automatic heating control waits for a valid zone. Changing the effective zone pauses an active scheduled hold and starts a new heating observation period. Schedule-only setting changes need no bridge restart.

## Heating response & tuning

Open **Settings → Thermostat settings → your thermostat → Heating response & tuning**. Choose the heating type and save. Each saved temperature rule for that thermostat has its own starting recommendation, current limits, evidence and **Apply to this rule** button.

| Heating type | Starting minimum update interval | Starting maximum target adjustment |
| --- | --- | --- |
| Forced air | 10 minutes | ±1 °C / ±1.8 °F |
| Radiators | 20 minutes | ±0.75 °C / ±1.35 °F |
| In-floor radiant | 30 minutes | ±0.5 °C / ±0.9 °F |

These are provisional plugin suggestions, not manufacturer specifications or measured characteristics of the home. Selecting a type does not apply them. The interval is the minimum time between changes to Nest's target, not an equipment cycling interval. The maximum adjustment bounds the Nest target above or below the rule's desired room temperature; it is not a per-command step size.

Enable **Observe heating response locally** and save to collect readings in the background, even with the dashboard closed or the temperature rule disabled. Collection does not enable a rule, resume a paused rule, change Nest settings or change the rule's limits. A rule needs selected sensors, a desired temperature and a heating type before observation can begin. Sources must be available; Nest must be connected, in Heat mode with Eco off and its built-in control sensor selected.

The observer keeps bounded local history of the selected-room average, built-in Nest temperature, Nest setpoint and reported heating state. It samples about once per minute and also captures heating-state/setpoint changes. Readings are retained for up to 48 hours (at most 2,880 per rule); up to 128 complete cycle summaries per rule are retained for 30 days. Data is stored in `nest-climate/web/<bridge-instance>/heating-response.json` under Homebridge's storage directory, with restricted file permissions. It is not uploaded by this feature. Writes occur at most every five minutes, except for observation resets and orderly shutdown. Turning observation off clears that thermostat's response history.

A usable cycle includes an observed heating start, measurable room warming, readings near the desired room temperature, and a settled period after heating stops. Radiant warming can begin after shutoff. Missing or stale inputs, observation gaps longer than two minutes, restarts, significant setpoint changes and unreasonably long cycles exclude the affected partial cycle. Continuous heating, very short cycles, changing schedules or rooms that never approach the desired temperature may take longer to produce enough evidence.

Learned suggestions require **at least six usable cycles across three days**, with **at least 48 hours between the first and last cycle**. The schedule time zone determines day boundaries; a manual choice takes priority over the Nest-reported zone, and UTC is used for observation day counts if neither is available. Evidence shows median response delay, warming rate, continued warming after shutoff, Nest-minus-room difference and room overshoot. Reordering the same sensors preserves the observation period. Changing selected sensors, thermostat, aggregation, desired room temperature, heating type or schedule time zone starts a new period; returning to an earlier sensor selection does not recover its discarded history.

The suggested interval combines response delay, estimated time to warm another 0.25 °C, and observed time to the post-heating peak. Learned intervals stay between half the starting interval and the supported 60-minute maximum. The adjustment suggestion starts with the magnitude of the persistent Nest-to-room difference plus a 0.25 °C margin, subtracts observed room overshoot, and is bounded from 0.5 °C to the smaller of 1.5 °C or the starting limit plus 0.5 °C. It is rounded to quarter-degree increments. The existing Nest target-grid rounding remains in effect.

**Moderate confidence** means the minimum cycle/day requirements are met and room-to-Nest differences are sufficiently consistent. **Higher confidence** requires at least 12 cycles across five days, spanning at least 96 hours, with less variation in those differences. These labels describe the available observational evidence, not statistical certainty or guaranteed comfort. Weather, sunlight, occupancy, sensor placement and Nest's own control behavior can affect the results. Inconsistent differences withhold the learned suggestion. A response longer than the supported interval is called out explicitly.

Save or discard any pending edits before applying a recommendation. **Apply to this rule** saves only that rule's minimum update interval and maximum adjustment. Its desired temperature, sensors, enabled/paused state and all other rules are preserved. An enabled rule uses the new limits on its next normal execution check. No bridge restart is required. Recommendations cannot be applied if their evidence or saved configuration has changed since they were displayed; refresh and review again.

For background on radiant response and stored heat, see [Google's True Radiant explanation](https://support.google.com/googlehome/answer/9250165) and [Watts' radiant heating FAQ](https://www.watts.com/support/faq-radiant). The numeric suggestions above are this plugin's own heuristics.

## Restart after saving

Changes to Apple Home accessories, such as Eco switches or a separate humidity sensor, require a child-bridge restart. In the standalone dashboard, after saving, the dashboard offers **Restart child bridge** when Homebridge UI can authenticate locally and identify this exact running Nest child bridge. Save or discard unsaved edits before restarting.

The button restarts only the identified Nest child bridge. The dashboard briefly disconnects, checks for a new running instance, and asks you to sign in again. Previously active rules continue after current readings and checks unless restart pausing is enabled; intentional pauses remain in effect. Restart requests are not repeated automatically if their result cannot be confirmed.

If direct restart is unavailable, the notice explains that the child bridge must be restarted in Homebridge. A plugin running on the main bridge or sharing a child bridge with another configured plugin must be restarted there. Homebridge UI must be reachable locally and its service authentication must be available; HTTPS connections retain certificate verification.

## Nest occupancy inputs

The Nest occupancy input represents Nest's Home/Away decision. When the same accessory is also discovered through Homebridge, the source picker shows one Nest input using the accessory identity. Sensors with the same display name but different identities remain separate. Existing rules that selected the Homebridge copy continue to resolve that input.

Each enabled Home presence rule exposes one combined occupancy sensor, named after the rule. Its output is excluded from the input picker to prevent feedback. The combined sensor is separate from Nest's native Home/Away state and does not change Google's Home/Away or Eco settings.


## Homebridge configuration interface

Homebridge plugin Settings and the standalone dashboard use the same climate application: Overview, Sensors & fans, Climate rules, and Settings. Rule editors, field help, drag ordering, heating recommendations, manual-target policy, Apple Home room-temperature display, runtime status, and live controls are available in both. Standalone web access does not need to be enabled to use the Homebridge interface.

Use **Save changes** for live climate configuration. Restart-required edits enable Homebridge’s bottom **Save** button and display instructions to use it. Settings are validated against the saved revision; a change made elsewhere requires reloading. **Enabled** describes the saved rule permission; **Active**, **Waiting**, and **Paused** describe its current execution.

Open **Menu → Accounts & web access** to edit account credentials and web-server settings in the same interface. Use Homebridge’s bottom **Save** button and follow its restart prompt. Save a new or changed web login separately with **Save web login**. Save or discard climate edits before saving account settings. Switching pages keeps unsaved edits. If configuration changes elsewhere, discard the account draft to load the latest saved settings. The standalone dashboard shows account status here; credentials are managed through Homebridge.

A reported built-in Nest sensor can guide a temperature rule even when Nest omits its room-sensor scheduling mode or empty paired-sensor list. These missing fields still prevent automatic changes to native sensor schedules. A rule combining official Nest room sensors with Homebridge sensors requires confirmed native sensor setup.

## Change temperature from a thermostat card

In the standalone dashboard's **Overview**, click a thermostat's target temperature. An editor opens inside the card with **− / +** buttons, a numeric field, **Apply** and **Cancel**. The buttons adjust by 1°F or 0.5°C, according to the dashboard's temperature units. Typed values must remain within the displayed limits.

| Controller | Editable target | Effect |
| --- | --- | --- |
| Active climate temperature rule | Desired room temperature | Retains the selected sensor group and its minimum adjustment interval. The adjusted Nest target remains visible underneath. |
| Native Nest control | Nest target | Sends a target for the current heating or cooling mode. Heat • Cool exposes both limits. |
| Paused climate temperature rule | Nest target | Changes Nest directly and leaves the rule paused. |

A room-target edit is absolute and does not invoke **Pause after a manual Nest target change**. It follows the existing manual room-target policy, including the next usable Nest schedule boundary. The change applies to the running desired temperature; the saved baseline in Climate rules remains separate. A successful save does not mean Nest must change immediately: the rule retains its limits and update interval.

A direct Nest command displays the requested target while checking feedback every two seconds for up to 30 seconds. If Nest rejects it or confirmation times out, the card shows the last reported target with an explanation. **Stop waiting** dismisses the check; it cannot recall a command already sent. Late feedback appears on the next refresh. Commands are never repeated automatically.

The editor checks current connectivity, Eco, temperature lock, mode, capability and target limits. A waiting or restoring rule must establish its controller before editing. If the target, controller or mode changes during an edit, cancel and reopen the editor to review the current setting. Background refresh preserves unsent values. **Cancel** and Escape close an unsent edit without changing the thermostat.

Temperature action editing is exclusive to the standalone web dashboard. The Homebridge configuration interface retains the informational thermostat overview and the climate rule configuration fields.


## Saving and restarting

In **Homebridge plugin Settings**, rule edits, time windows, temperature units, and heating tuning use the climate interface’s **Save changes** button and apply without a restart. Edits that require a restart, such as separate humidity accessories, automatically enable **Homebridge’s Save button at the bottom of the window**. A notice directs you there. Homebridge saves the staged configuration, closes the plugin window, and offers its restart action for the affected bridge. When live settings and restart settings are edited together, that same Save includes both. Discard removes the staged edits. Invalid settings keep the native Save button disabled until corrected.

Account and web-server settings also use Homebridge’s bottom Save button. **Save web login** writes the separate private login credentials immediately; it does not save or enable the web server. Discarding connection edits does not undo a saved web login.

In the **standalone dashboard**, use **Save changes**. If the saved settings require a restart, the dashboard offers **Restart child bridge** when available. Click it to request the restart; editing is temporarily disabled while the dashboard checks for reconnection. Sign in again if prompted. Changing a setting by itself never restarts the bridge.


## Occupancy requirements for temperature and fan rules

Under **When to run**, leave **Occupancy requirement** at **Any occupancy state** for unrestricted occupancy, or choose **Occupied / Home** or **Unoccupied / Away**. Then select one individual occupancy sensor or a saved combined presence rule. Nest Home/Away can be used as an individual occupancy source. Motion sensors can contribute through a combined presence rule, where motion holds and Away delays establish the effective occupancy state.

The time window and occupancy requirement must both match. Fan rules also require their temperature or HVAC run condition. Combined presence is evaluated first, so its holds, Away delay and temporary Home/Away override apply to dependent rules in the same evaluation. A disabled, paused, unavailable or unreliable presence source cannot satisfy either occupancy state. An unknown higher-priority condition reserves the equipment until it can be evaluated; a known nonmatching condition allows another eligible rule to take over.

When an occupancy condition stops matching, another eligible rule can take over, or settings owned by the outgoing rule return to their previous value when the device confirms its state. When the condition matches again, automatic control resumes subject to normal update intervals. Occupancy does not force off equipment that the rule did not turn on.

## Fan feedback recovery

An accepted fan command waits for the fan's reported power or speed. The rule shows **Recovering feedback** after two minutes if the previous state is still reported. It continues checking readings without repeating the accepted command and resumes when matching feedback arrives. A speed command may report power before speed; those separate updates are allowed. Saved speed ranges treat percentages within the same physical setting as equivalent.

A conflicting setting suspends automatic control for that fan until **Resume**. A suspension created by an older release still requires one Resume after reviewing the reported settings, because it may represent a deliberate change. Confirmed and conflicting commands replace the pending message in execution status.
