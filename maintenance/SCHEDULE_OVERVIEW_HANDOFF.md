# Schedule overview checkpoint

## Objective

Make the selected thermostat, schedule mode, relevant temperature targets and climate-rule impact explicit in Overview. Provide accessible help and move sensor diagnostics into Settings.

## Repository and branch

- Repository: `pponce/homebridge-nest-climate-cntrl`
- Branch: `codex/schedule-overview`
- Base: `662bd0ca9b3112506daca93cc6ba3771ef1d6dbb` (`main`, package version `0.6.3`).
- Workspace: `/workspace/scratch/b09c9dca1a15/homebridge-nest-climate-cntrl`.

## Completed

- Highlighted the shared thermostat selector and repeated its name in Coming up.
- Labeled Heat, Cool, Heat / Cool, Off, Eco and offline feedback.
- Displayed only targets relevant to the reported mode.
- Ordered all upcoming entries before selecting the first three.
- Used running-engine status to distinguish active, confirming, restoring, inactive and unavailable climate rules.
- Explained how confirmed Nest scheduled targets become desired room temperatures and how adjusted Nest targets can differ.
- Added a question-mark help popup using the existing hover, keyboard and tap interaction.
- Moved the sensor diagnostics report to Settings → Diagnostics & troubleshooting.
- Updated public documentation and regression fixtures.

## Validation

- 15 focused schedule, time-zone and controller tests pass locally.
- Shared dashboard asset build and changed JavaScript syntax checks pass.
- `git diff --check` passes.
- Local Chromium launch is blocked by the execution environment's socket restriction; GitHub browser checks must validate rendered behavior.
- Physical thermostat behavior has not been tested; changes are confined to display, documentation and test coverage.

## Decisions and next steps

- Native schedules and climate execution behavior remain unchanged.
- Only reported running rules describe current control; unsaved configuration does not determine the controller label.
- A future scheduled change is conditional on the rule still controlling heating and Nest confirming its target.
- Review the pull request checks, address any failures, then retain or merge the branch according to the requested delivery workflow.
- No package version bump, GitHub release or npm publication is part of this change.

## Workspace note

The workspace contains a partial source snapshot retrieved through GitHub tools because direct Git transport was unavailable. Its local Git commits are snapshot markers, not the upstream history. Publish only the changed files through a tree based on the real upstream commit; do not push the local snapshot history.
