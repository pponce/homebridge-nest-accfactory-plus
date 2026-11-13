# Nest feedback resilience v0.6.6

## Objective

Automatically recover temperature rules from temporary Nest feedback gaps without repeating accepted heating commands or overriding manual pauses and conflicting device settings. Publish a GitHub release with notes/changelog and provide an SSH-safe npm publication launcher. Do not publish npm from this environment.

## Repository and branch

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Released base/main: v0.6.5, commit 790dfc440a758b577f7f022948eff5753fff9164, tree a14825c083e8c0cc6818029fe837ac224613ddd7.
- Candidate branch: fix/resilient-nest-feedback (remote creation pending at this checkpoint).
- Workspace: /workspace/scratch/857dece82825/homebridge-nest-climate-cntrl.
- The local Git snapshot predates recent releases. Use real remote parent/tree IDs and explicit changed paths; never push its local ancestry.

## Findings and implementation

- A schedule timeout latched all groups on its thermostat into paused state. Evaluation then skipped the pending schedule forever, including after matching feedback arrived. Schedule waits did not refresh observation at all.
- Schedule and automatic-command waits now remain recoverable: observation refresh starts after 30 seconds and backs off through 1, 2, 4 and 5 minutes. Recovery blocks writes until expected feedback, usable inputs and equipment checks return.
- Account-level throttling prevents reconnect storms. A successful refresh grants other thermostats on the account time for staggered sensor feedback.
- New schedule events supersede older waits; older expected readings are retained only as recognized intermediate feedback and cannot become the new desired room target. Unrelated conflicting readings pause for review.
- Pending command ownership survives graceful and abrupt bridge restarts without blind retries. Explicit user pauses, restart-pause preference, mode/Eco/lock/sensor changes and command failures remain authoritative.
- The exact retained schedule-timeout pause from earlier versions migrates into recovery when its pending event is valid and no competing explicit pause exists. Ambiguous historical command failures cannot be reconstructed from a message alone and are not automatically cleared.
- Dashboard and schedule context show Recovering feedback, the pending target, wait start, recovery availability and next refresh. A retained schedule target is not described as actively followed while paused. Superseded commands are labeled accordingly.
- Version metadata, changelog, public usage docs and publisher/installer are prepared for 0.6.6.

## Validation

- New schedule recovery regressions failed before the implementation and pass with it.
- 150 focused engine, dashboard, controller-view and schedule-overview tests pass locally.
- Coverage includes late feedback, superseded schedules, conflicting targets, missing sensors, account sharing, reconnect backoff, saved schedule pause migration, graceful/crash restart and retained intentional pauses.
- Shared browser helper now checks recovery details in both embedded and standalone dashboards. Browser execution and full lint/coverage/compatibility checks must run on GitHub; local Chromium/dependencies are unavailable.
- npm launcher shell syntax and dashboard asset build pass. Publisher/installer scenario suites are running at this checkpoint.
- No real thermostat commands, npm publication or live installation have been performed.

## Next steps

1. Finish publisher/installer checks and review the exact diff against main.
2. Create the candidate commit/branch and PR; run all six Node/Homebridge combinations and browser checks.
3. Resolve failures without weakening checks, then fast-forward main using an expected-head lease.
4. Wait for the release workflow; verify v0.6.6 tag, release body, all five assets and publisher checksum.
5. Return the release/changelog links and the complete maintenance/publish-0.6.6.sh brace block.

Publisher SHA-256: 47f374f79a3d8f275da6d9868eb009d677d768e384eab1f93dd38d5f59a484e3.
