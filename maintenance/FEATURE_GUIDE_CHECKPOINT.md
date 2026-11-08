# Feature guide and rule-readiness checkpoint

Updated: 2026-11-08

## Objective and source

Make the climate features understandable through practical examples, and establish which temperature-group and room-fan behaviors can be tested.

Repository: `pponce/homebridge-nest-climate-cntrl`. Branch: `main`. Reviewed source: `1e4a20e190df290dc42bb8d1ec8b6af396fd4091`. Package version at review: `0.5.0-beta.5`.

## Completed

- README opens with a feature/status table and examples for Nest-only, Homebridge-only and mixed temperature groups; room-fan conditions; multiple presence sources; and the visual admin/configuration interfaces.
- WEB_DASHBOARD.md provides first-rule walkthroughs using the actual editor labels, including discovery, averages, condition previews, saving/reopening drafts, and limitations.
- Live native Nest sensor selection and HVAC blower timers are distinguished from inactive mixed-sensor and third-party room-fan rules.
- Network configuration and runtime source are unchanged. No package version bump or npm publication is part of this documentation change.

## Verification and boundaries

All 16 relative documentation links/anchors resolve. Whitespace checks and rule-editor label checks passed. Source review confirms that `validateRuleDrafts()` rejects enabled rules and saves them with `enabled: false`.

Temperature groups can average available native and Homebridge sources. Fan previews evaluate temperature thresholds or reported thermostat activity. Presence previews evaluate current any/all conditions. Motion holds, Away delays and fan turn-off gaps are saved values, not running timers. Saving and restarting do not activate automation.

This is a documentation review, not a new hardware or end-to-end automation test. Existing installation-specific hardware behavior was not inspected. No full runtime suite was rerun for the Markdown-only change.

## Unresolved work and next steps

1. Use WEB_DASHBOARD.md to test source discovery, group averages, fan condition previews and draft persistence with available devices.
2. Before implementing live automation, consult FEATURE_PLAN.md for the accepted design. Keep one controller per physical thermostat; a software group does not create an independent HVAC zone.
3. Implement bounded thermostat compensation, external fan command execution and combined occupancy state, including manual/Eco/schedule precedence, hysteresis/holds and recovery from stale inputs, outages and restarts.
4. Add behavioral tests for execution and failure recovery, then validate opt-in rules on real hardware before describing automatic control as available.
5. Prepare a tested release only when the implementation is ready. Obtain approval before npm publication.

Keep private deployment details out of public guides. Preserve remote Git history and submodule gitlinks when working from a source snapshot; use expected-head updates.
