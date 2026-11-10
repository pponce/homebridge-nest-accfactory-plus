# Rule windows checkpoint

Objective: scheduled temperature groups and fan rules, with Always as the all-day default, overnight windows, selected start days, named time zones, priority, shared UI, and durable handoff behavior.

Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
Branch: feature/rule-time-windows
PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/24
Base main: 36e34b8b4cce649f6aa48429555dec5edef2cb95
Last code/test checkpoint: ddea26f62d838b0e06531681c06ccf6f125ef31f
Prepared stable version: 0.6.0. No npm publication or live equipment installation performed.

Implemented:
- Optional rule.window {days (Monday=0), start, end, timeZone}; absence means Always. Equal start/end rejected with an Always hint.
- Shared local-time eligibility and cached next-opening calculation; DST and overnight start-day semantics.
- Temperature drag ordering and arbitration; handoff preserves original lease baseline, pending feedback, temporary desired room target, and minimum write interval.
- Temperature pauses suspend every group for the thermostat. Resume allows the currently eligible group. Fan manual overrides remain fan-wide.
- Current-window restart recovery and native sensor-hold reuse without reapplying native setup.
- Both UI hosts, raw config schema, asset packaging, Scheduled/Standby status, examples and public documentation.
- Window-boundary cancellations restore the previous command ownership record without leaving phantom pending feedback. Regression tests cover power, speed, Nest targets, native sensor-hold reuse, and the original target baseline.

Validation:
- Local engine, scheduling, and source tests: 113 passed; final engine/native setup run: 109 passed, including two further regression cases.
- Earlier focused configuration, sensor setup, display and fan tests: 47 passed.
- At a01f8ca: all six Node/Homebridge combinations passed; shared browser suites passed; visual review published at review/rule-time-windows.
- Publisher and installer fixture checks passed for version 0.6.0.
- Real Nest/fan hardware remains untested.

Next steps:
1. Complete final CI for the tested feature tree and release-note heading.
2. Pass lint, source coverage, all six compatibility jobs and browser checks on the final commit; inspect screenshots.
3. Merge tested tree to main, allow stable GitHub release workflow to finish, verify assets/digests.
4. Generate a pinned complete Bash publication block for the user. Never publish npm directly.

Workspace note: local .git is an older reconstructed snapshot with unrelated prior task changes. Do not push local history or the entire diff. Use GitHub git-data trees based on the verified remote feature tree and only selected task files.
