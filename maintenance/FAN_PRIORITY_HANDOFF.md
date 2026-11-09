# Fan priority ordering checkpoint

Repository: `pponce/homebridge-nest-climate-cntrl`; branch: `main`.

## Objective and completed changes

Make fan priority follow a draggable vertical list, with the top matching enabled rule controlling each shared fan.

- Dotted handles support mouse and touch dragging. A drop line shows the destination; Escape, pointer cancellation, leaving the page or losing focus cancels the gesture.
- Numbered positions and a Highest priority indicator make the order visible. Move up/down buttons and handle arrow keys/Home/End provide keyboard and touch alternatives.
- Existing numeric priorities determine initial display order without rewriting the configuration. Explicit reorder and new-rule insertion assign unique numeric priorities within the existing 0–100 contract. New rules start at the bottom; the supported maximum remains 32 rules per category.
- Reordering preserves the selected editor and changes only the draft until Save. Discard restores saved order. Disabled rules keep their place but do not compete for control.
- Runtime highest-priority selection, missing-reading reservations, manual overrides, baseline ownership and shared cooldown remain unchanged. Temperature and presence rules do not acquire fan-priority controls.
- The previous mixed Nest/non-Nest temperature-group sensor setup remains included.

Implementation: `8011b8285074f1e74cc8c5f615ca615e062877d0`.
Accessible labels, drag cancellation and touch fixture refinement: `c217489ffa3c6178081c51b19e796e8494a79e36`.

## Validation

- 108 focused climate, fan, source and native sensor-setup tests passed locally.
- JavaScript syntax checks passed.
- 16 mocked npm publisher scenarios and five installer scenarios passed for the beta.14 helpers.
- Browser coverage exercises legacy priority ordering, mouse/touch/keyboard reordering, indicators, selected editor retention, unsaved isolation, Escape, Discard, saved/reloaded ordering, disabled rules, deletion, manual overrides, the actual shared-fan winner and mobile layout.
- GitHub Test run **42576621728** passed all six supported Node/Homebridge combinations and all browser suites on `c217489ffa3c6178081c51b19e796e8494a79e36`. Checks include lint, full tests, coverage floors and build.
- Published GitHub prerelease: [v0.5.0-beta.14](https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.14), commit `224602de2e228af19faaafacf7de6385c939c826`.
- Release run **42576904951** and Test run **42576904912** both passed for the final beta.14 package, including all six compatibility configurations, all browser suites, production-only tarball installation/registration, and publication/installer helper checks.
- Published archive SHA-256: `a7cba2d5232a8d439b7ace927eab70352646231f045f5d990f8a926c8456b19f`.

No live thermostat, fan, Homebridge installation or npm publication was changed by this work.

## Next steps

1. Run `maintenance/publish-beta14.sh` in the existing project environment. Complete npm login/2FA if prompted, then verify the publication report and `beta` tag.
2. After npm publication, update the installed plugin separately, refresh the dashboard, and review/Resume enabled equipment rules.
3. Verify dragging, saving and shared-fan handoffs on the installed system. Physical device behavior remains unverified.

The publication block pins the helper to release commit `224602de2e228af19faaafacf7de6385c939c826` and SHA-256 `2652f3cc28de85082a907e7f82c7b284489e9d815ed7f8e8261bb922bac6abf9`. The source download has a pinned Git-content fallback; the helper's release downloads have a GitHub asset API fallback. The helper verifies the release package before npm publication and leaves the installed Homebridge system untouched.

## Copyable handoff

```text
Objective: drag fan rules into priority order, highest at the top, then publish a GitHub beta and provide an npm script.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main.
Implemented: vertical mouse/touch dragging, numbered positions and Highest priority indicator, keyboard and move-button alternatives, draft/save/discard behavior, compatible numeric priority persistence.
Validated implementation: c217489ffa3c6178081c51b19e796e8494a79e36; Test run 42576621728 passed all six compatibility configurations and all browser suites.
Decisions: top matching enabled rule wins per fan; disabled rules retain their position; new rules start last; missing higher-priority readings block fallback; handoffs retain baseline and cooldown; manual overrides win.
Local validation: 108 focused tests, JavaScript syntax, 16 publication-helper scenarios and five installer scenarios passed.
Released: v0.5.0-beta.14 at 224602de2e228af19faaafacf7de6385c939c826; release run 42576904951 and Test run 42576904912 passed, including production package and helper checks.
npm script: maintenance/publish-beta14.sh, checksum-pinned, beta channel.
Pending: maintainer-run npm publication, installed update and physical fan/UI confirmation. No live installation or assistant-run npm publication changed.
Next: run the npm publisher, update the installed plugin separately, refresh dashboard, review/Resume rules, then test saved priority and fan handoffs.
```
