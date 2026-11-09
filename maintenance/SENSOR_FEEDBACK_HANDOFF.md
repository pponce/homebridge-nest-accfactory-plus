# Thermostat sensor feedback

Objective: allow temperature rules to use a confirmed built-in thermostat sensor through the actual Google mapping and command path, including after restart.

Repository: pponce/homebridge-nest-climate-cntrl. Base main: fe84fb8552230af8e91e9a30f93386b4696a1721 (beta.20). Branch: fix/builtin-sensor-mapping. Target: beta.21.

Cause: the generic translator treats an empty string as missing. The thermostat mapper used an empty string as its built-in sensor marker, so the dashboard received an undefined legacy selection alongside valid native selection feedback. The overview used the native selection, while the heating guard required the dropped legacy marker. Tests that created dashboard records directly did not exercise this mapping boundary.

Changes: derive the legacy selection after generic mapping from the validated native selection; explicitly clear unknown selections; allow confirmed native built-in feedback without requiring a duplicate legacy marker while rejecting contradictory feedback; show only actual unmet requirements during restart recovery.

Validation checkpoint: three new mapping/integration tests reproduce failures before the change. After the fix, all 114 focused tests pass, including actual third-generation mapper output through dashboard command guards, room averaging and restart recovery, plus remote/unknown sensor transitions. Feature head 863f9a4ff1cb323b81f1d24f5405f5c9b5935fdb passed all six Node/Homebridge combinations, lint, coverage, build, migration and dashboard browser checks in run 42678971156. All 23 publisher and 14 installer scenarios passed locally. No physical thermostat verification or live installation changes performed.

Decisions: do not change generic empty-value mapping for unrelated fields or devices. Do not infer native sensor schedule/hold mode or authorize sensor-setting writes from missing metadata. No npm publication from this workspace.

Next: integrate validated PR #18, complete GitHub beta.21 release and production package checks, and provide a pinned npm publisher. After installation, verify the affected rule proceeds from Waiting without a forced Resume unless already paused.
