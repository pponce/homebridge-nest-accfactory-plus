# Nest heating feedback recovery

## Objective

Release v0.6.3 of `pponce/homebridge-nest-climate-cntrl` with recovery for accepted heating commands whose updated target never reaches the dashboard. Publish a GitHub release and provide the maintainer with an npm publication script. npm publication itself has not been performed.

## Source and branch

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Base main: `3a0cc0c609f62d7685b03973c7d914cbef5d5a8d`.
- Working branch: `fix/nest-feedback-recovery`.
- Local source: `/workspace/scratch/857dece82825/homebridge-nest-climate-cntrl`.
- Source was retrieved through GitHub tools because direct Git/network access is unavailable. Remote changes must use the GitHub tree/commit/ref tools against the real base commit, not the local snapshot commit.

## Completed changes

- Refresh only the owning Google Observe stream once after 30 seconds without heating-target feedback. Preserve shared HTTP/2 sessions, authentication and in-flight unary commands.
- Use the existing platform reconnect loop; invalidate cached account data until new observations arrive.
- Keep a two-minute confirmation limit, including during reconnect; never resend an unconfirmed temperature command.
- Wait for staggered thermostat/room-sensor updates during recovery. Matching feedback permits continued control; conflicting feedback pauses.
- Show requested and reported targets separately, display the last device-update time, and keep paused-group reported targets current.
- Replace the persistent pending-action text with confirmed/unconfirmed outcomes, including a display fallback for saved state from older versions.
- Prepare version metadata, CHANGELOG.md, WEB_DASHBOARD.md and versioned publication/install helpers for v0.6.3.

## Validation and limitations

The new recovery tests failed on the original implementation and pass with the changes. All 187 focused local tests and 37 publisher/installer scenarios pass. GitHub validated code commit `9210500be9c3cdc3552b4d3eb018f2cc6f20fab1`: all six Node/Homebridge combinations, full tests, lint, coverage floors, migration checks, package checks and both browser suites passed. Runs: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/43128879305 and https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/43128879283. PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/27. Local dependency installation and Chromium are unavailable in this environment; the full checks ran in GitHub. Hardware confirmation remains outstanding; the evidence establishes stale plugin feedback but does not identify why the original stream stopped reporting.

## Decisions

- Recover by refreshing observation, never by repeating a heating command or treating API acceptance as device confirmation.
- Preserve manual Nest changes, schedule boundaries, control ownership and existing adjustment intervals.
- Do not automatically resume a rule that has already paused. A fresh reading can update its display while it remains paused.
- Keep custom work notes in maintenance. Public documentation describes current behavior without personal diagnostics.

## Next steps

1. Merge the validated change to main, retaining the release workflow's test gates.
2. Verify the v0.6.3 GitHub release, notes and package/checksum assets.
3. Provide `maintenance/publish-0.6.3.sh`, which verifies and publishes the tested release archive and prints a browser sign-in URL when needed.
4. After installation, resume an intentionally paused temperature group and verify that Nest feedback matches the app. No npm publication or live Homebridge installation has been performed by the agent.
