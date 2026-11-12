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

The new recovery tests failed on the original implementation and pass with the changes. Local focused automation, dashboard, command, source, native sensor and web tests pass. Local npm dependency installation is denied by the network policy; Chromium cannot create its required socket. Transport, full platform, coverage, lint and browser checks must complete on GitHub before release. Hardware confirmation remains outstanding; the evidence establishes stale plugin feedback but does not identify why the original stream stopped reporting.

## Decisions

- Recover by refreshing observation, never by repeating a heating command or treating API acceptance as device confirmation.
- Preserve manual Nest changes, schedule boundaries, control ownership and existing adjustment intervals.
- Do not automatically resume a rule that has already paused. A fresh reading can update its display while it remains paused.
- Keep custom work notes in maintenance. Public documentation describes current behavior without personal diagnostics.

## Next steps

1. Finish helper validation and inspect the diff.
2. Push a branch commit and open a PR; run the full GitHub test matrix and browser suite, fixing any failures.
3. Fast-forward main only after validation, retaining the release workflow's test gates.
4. Verify the v0.6.3 GitHub release, its notes and package/checksum assets.
5. Provide the complete SSH-safe npm publication launcher. No npm publication or live Homebridge installation has been performed.
