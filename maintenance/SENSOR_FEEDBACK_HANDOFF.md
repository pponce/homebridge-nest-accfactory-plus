# Thermostat sensor feedback

Objective: allow temperature rules to use a confirmed built-in thermostat sensor through the actual Google mapping and command path, including after restart.

Repository: pponce/homebridge-nest-climate-cntrl. Base main: fe84fb8552230af8e91e9a30f93386b4696a1721 (beta.20). Branch: fix/builtin-sensor-mapping. Target: beta.21.

Cause: the generic translator treats an empty string as missing. The thermostat mapper used an empty string as its built-in sensor marker, so the dashboard received an undefined legacy selection alongside valid native selection feedback. The overview used the native selection, while the heating guard required the dropped legacy marker. Tests that created dashboard records directly did not exercise this mapping boundary.

Changes: derive the legacy selection after generic mapping from the validated native selection; explicitly clear unknown selections; allow confirmed native built-in feedback without requiring a duplicate legacy marker while rejecting contradictory feedback; show only actual unmet requirements during restart recovery.

Validation checkpoint: three new mapping/integration tests reproduce failures before the change. After the fix, all 114 focused tests pass, including actual third-generation mapper output through dashboard command guards, room averaging and restart recovery, plus remote/unknown sensor transitions. Feature head 863f9a4ff1cb323b81f1d24f5405f5c9b5935fdb passed all six Node/Homebridge combinations, lint, coverage, build, migration and dashboard browser checks in run 42678971156. All 23 publisher and 14 installer scenarios passed locally. No physical thermostat verification or live installation changes performed.

Decisions: do not change generic empty-value mapping for unrelated fields or devices. Do not infer native sensor schedule/hold mode or authorize sensor-setting writes from missing metadata. No npm publication from this workspace.

Current state: beta.21 is published on GitHub and merged into main through PR #18. The npm package has not been published by this workspace. The previous fix branch is fix/builtin-sensor-mapping; current delivery branch is main. GitHub release and tag point to 36ed477fb68c9311f4cdaec317c060a3b7f7ed91.

Integration: PR #18 merged into main. Version commit a98011cd8ba39a7ea3028192a5a6446a690c16ca passed all matrix and browser checks in Test run 42679494375. Release run 42679494572 encountered an unrelated upstream HomeKitHistory Eve Aqua test that compares complete responses containing the current clock. Its expected and actual values differ by one second; the unchanged source encodes Date.now() on every read. The connected GitHub interface cannot rerun jobs. Commit 36ed477fb68c9311f4cdaec317c060a3b7f7ed91 adds only a comment documenting the release validation gate and triggers all checks again, without skipping or relaxing any test. All six matrix combinations and browser checks passed in both Test run 42680319411 and Release run 42680319142. The release job also passed production package checks and all 23 publisher and 14 installer scenarios.

Verified release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.21 (published prerelease; tag and target checked). Package SHA256: d417f43f147a3e4a0725e0250f0dd0d473aed435c3ef5ed98336e5765a6898e4. Publisher helper SHA256: 16c98e8bbf976567b3e223a992810ebc91938750c453ce85f39c345eb2dadadb. maintenance/publish-beta21.sh downloads the helper from the exact release commit and verifies its checksum.

Exact next steps:

1. Run the complete block in maintenance/publish-beta21.sh on the publishing host. It updates the existing clean main checkout by fast-forward, verifies the tested GitHub tarball and publishes it under npm's beta tag. It prints browser authorization URLs and a report-copy command. It does not install or restart Homebridge.
2. Install homebridge-nest-climate-cntrl@0.5.0-beta.21 using the normal Homebridge update flow. For a terminal installation, stop Homebridge with hb-service, use hb-service add with that exact package version, then start Homebridge.
3. Reload the dashboard and confirm that the enabled temperature rule leaves Waiting when its readings and equipment checks pass. Resume only if the rule is already Paused. Confirm the controller identifies the climate rule; idle HVAC is allowed. Both the standalone dashboard and embedded Homebridge interface use the same runtime status.
4. If a rule still waits, record the new specific reason and the relevant Homebridge log lines. No physical thermostat verification has been performed from this workspace.

Unresolved: live installation verification and user-run npm publication remain. The upstream wall-clock-dependent test is unchanged and may fail intermittently; no production behavior or test gate was weakened to complete this release.
