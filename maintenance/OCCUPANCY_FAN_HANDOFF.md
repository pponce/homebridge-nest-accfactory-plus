# Occupancy conditions and fan feedback recovery — v0.6.7

## Objective
Add optional occupancy requirements to temperature/fan rules, stronger setup headings, fix fan false manual-change suspensions and align adjacent thermostat readings. Publish GitHub release notes/changelog and supply an SSH-safe npm publisher. Do not publish npm here.

## Repository and branch
- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Verified main/base: 8f2a214d0eddef8eee3eb057d167deaafd72b32b (v0.6.6).
- Base tree: 60061ef3f0cbe7ebebe0c9d7b1c28033e8c644af.
- Workspace is reconstructed: never push local git ancestry. Use explicit file blobs and real remote parents.
- Candidate branch: fix/occupancy-fan-feedback-067 (to be created).

## Completed implementation
- Optional occupancyCondition {sourceType: sensor|presenceRule, sourceId, state: occupied|unoccupied}; no condition preserves existing behavior.
- Evaluate combined presence before control selection; use holds, delays, overrides; unknown reserves priority and blocks writes; false relinquishes ownership. Recheck the gate at final write guard. External occupancy inputs trigger source refresh for native-only groups.
- When to run controls, explanations, schema, source asset delivery, packaging and larger section headings.
- Fan delayed feedback retains ownership, recovers automatically without duplicate writes, supports staggered power/speed updates and mapped power-only feedback; confirms action messages. Old ambiguous overrides retain explicit Resume requirement.
- Thermostat card subgrids align title/readings/facts/control tracks; current temperature top aligned with target.

## Testing
- 168 focused engine, fan, dashboard server and thermostat-view tests passed before final UI fixture additions.
- 130 engine regression tests passed after final guard/ownership review.
- Added browser tests for both occupancy source types, disabling condition, mobile width, headings and adjacent thermostat row alignment. CI pending.
- No live Nest or fan commands performed. Hardware-specific cause of the reported old suspension is not established; reproduced code paths cover timeout and staggered feedback.

## Next steps
1. Finish focused tests and publication/installation script fixtures.
2. Publish candidate commit/PR based on verified main, run full CI including six runtime combinations and embedded/standalone browsers; address failures.
3. Merge only green candidate, verify release workflow, tag and all assets.
4. Provide GitHub release and full maintenance/publish-0.6.7.sh block. npm publication remains user-run.
