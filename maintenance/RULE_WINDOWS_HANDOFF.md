# Rule windows checkpoint

Objective: scheduled temperature groups and fan rules, with Always as the all-day default, overnight windows, selected start days, named time zones, priority, shared UI, and durable handoff behavior.

Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
Branch: feature/rule-time-windows
PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/24
Base main: 36e34b8b4cce649f6aa48429555dec5edef2cb95
Final feature head: 8c8ee562c61343b0c4305e7c3e8249df1a37e775
Merged main commit: 1b0b78a0d9aef907dabeb3f2271a30145f5993ee
PR #24 is merged. GitHub release job 42768672514 succeeded. Main Test job 42768672241 succeeded.
Published stable GitHub release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.6.0
No npm publication or live equipment installation performed.

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
- Final feature head: all six Node/Homebridge combinations, lint, source coverage, build, package checks, migration checks, and all shared browser suites passed. Main and release workflows also passed all required checks.
- Visual review: review/rule-time-windows; mobile temperature and desktop fan schedule controls inspected.
- Publisher and installer fixture checks passed for version 0.6.0.
- Real Nest/fan hardware remains untested.

Next steps:
1. User runs maintenance/publish-0.6.0.sh to publish the verified GitHub package to npm with the latest tag. It prints web authentication links rather than opening a browser.
2. User updates the plugin through Homebridge, then creates/enables scheduled groups. Existing rules remain Always.
3. If publication fails, inspect the report path and copy command printed by the helper. Never publish npm directly without authorization.

Verified release SHA-256 values:
- Package: 8c10e9e34e3ab779df944a3f86ae245b3e31c89bd5fcdb392e03ce70f60dd0a3
- Publisher: f60f5650bb496a1a5a4dbe51783b990e7a26429d89ee920d5559ce6a8fe2c463
- Installer: 442058212819b930a34b49752a35ce91ead2b07247ed050bcb1c51524896138a

The complete SSH-safe wrapper is maintenance/publish-0.6.0.sh and pins the merged release commit.

Workspace note: local .git is an older reconstructed snapshot with unrelated prior task changes. Do not push local history or the entire diff. Use GitHub git-data trees based on the verified remote feature tree and only selected task files.
