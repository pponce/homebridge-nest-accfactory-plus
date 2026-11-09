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

93 focused model, engine, HAP-source and configuration/web tests passed locally. Fan controller coverage: 97.73% lines, 98.05% branches, 100% functions; existing floors retained. Build passed. GitHub full compatibility and browser validation still pending at this checkpoint.

## Next steps

Push only the intended source, test, dashboard and public-documentation files from this change. Run all six compatibility configurations and browser suites, fix failures, and record the verified commit/run here. Package version remains beta.11; no new GitHub or npm release requested for this change yet. Physical fan behavior and installed dashboard confirmation remain unverified. No live installation was changed and no npm publication was performed.

Local checkout contains earlier synthetic-baseline changes; do not commit unrelated dirty or untracked files. Use the current GitHub main tree and an expected-head check when pushing.
