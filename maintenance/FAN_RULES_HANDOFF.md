# Fan rules and dashboard confirmations checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Base: 446bb6c0986e20ca55f6af5d5b9cf2ff07b5bd9b. Latest release: v0.5.0-beta.11.

## Objective

Separate fan run conditions from speed choices, support several prioritized rules per fan, and use in-page dashboard confirmations.

## Completed implementation

- Temperature, active heating and active cooling triggers each offer last-setting on/off, fixed speed, or temperature-based speed.
- Priority 0–100; higher wins per fan. Enabled overlapping rules must use distinct priorities. Unknown required inputs reserve the fan and prevent lower-priority fallback.
- Handoffs retain original baseline and share the per-fan cooldown; caps can reduce speed immediately. Manual overrides block every rule for the affected fan until Resume, while other fans may continue.
- Legacy temperature-speed rules normalize with their original inclusive start threshold and stop gap. Existing on/off rules keep last-setting behavior.
- Dashboard editor, previews, execution assignments, public documentation and browser fixtures updated.
- Discard, delete and unsaved sign-out use an accessible in-page dialog. Keep editing is the initial focus; Escape cancels; failed reloads retain drafts.

## Validation at checkpoint

93 focused model, engine, HAP-source and configuration/web tests passed locally. Fan controller coverage: 97.73% lines, 98.05% branches, 100% functions; existing floors retained. Build passed. All six Node/Homebridge compatibility configurations passed lint, full tests, coverage, build and migration checks on code commit 7618c40bf196f4c40a2f4ecf567f3a20877bfe7e in Test run 42564910059. Embedded, standalone, reverse-proxy, heating-response and fan-speed browser suites passed. Browser checks include modal focus trapping, Escape/cancel, failed-discard recovery, mobile layout, all trigger/speed choices, legacy rule normalization and overlapping-priority validation.

## Next steps

Package version remains beta.11; no new GitHub or npm release requested for this change yet. Physical fan behavior and installed dashboard confirmation remain unverified. No live installation was changed and no npm publication was performed.

Local checkout contains earlier synthetic-baseline changes; do not commit unrelated dirty or untracked files. Use the current GitHub main tree and an expected-head check when pushing.

## Copyable handoff

```text
Objective: independent fan triggers/speed choices, prioritized shared fans, and in-page confirmations.
Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Implementation commit: 7618c40bf196f4c40a2f4ecf567f3a20877bfe7e.
Completed: last/fixed/curve speed for every trigger; per-fan priority and manual overrides; compatible legacy migration; styled discard/delete/sign-out confirmations.
Decision: highest priority wins; missing higher-priority readings block fallback; fan handoffs preserve baseline and cooldown.
Local validation: 93 focused tests, coverage floors and build passed.
GitHub validation: all six compatibility configurations and all browser suites passed; Test run 42564910059.
Pending: next GitHub beta release if requested, maintainer-run npm publication, installed fan/UI confirmation.
No live installation or npm release was changed. Heating-control behavior was not changed.
Next: prepare the next beta only on request, run the release checks, then provide a checksum-pinned npm publication block.
```

Production tarball content checks completed locally, but the local install check could not fetch npm dependencies (registry returned HTTP 403). A future release must run its production-package install check in GitHub before publication.
