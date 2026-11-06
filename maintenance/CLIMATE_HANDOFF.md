# Climate development checkpoint

Updated: 2026-11-06

## Objective and repositories

Build Nest Climate Cntrl with thermostat, sensor and Heat Link controls, plus a responsive standalone dashboard. Repository: `pponce/homebridge-nest-climate-cntrl`; npm package: `homebridge-nest-climate-cntrl`; platform: `NestClimateCntrl`.

`main` contains the released beta.1 implementation and maintenance updates. Standalone HTTPS development is on `feature/standalone-dashboard`, draft PR #13. See `maintenance/DASHBOARD_SERVER_HANDOFF.md` for that work. The live installation has not been changed from this workspace.

Use the single Mint checkout `~/devProjects/homebridge-nest-climate-cntrl`. The current workspace snapshot is `/workspace/scratch/3557d984da62/homebridge-nest-accfactory-plus`; its synthetic local Git history must not be pushed. Use remote trees/commits and expected-SHA ref updates, preserve concurrent edits and shared-module gitlinks.

## Latest migration decision — fresh cutover

The maintainer chose a fresh installation. This supersedes the earlier cache-preserving migration plan and its pending approval request. **Do not run `maintenance/migrate-to-beta.sh` or apply the offline ownership update.** No backup or live cache edit has been performed or approved.

- Disable the old Nest platform before enabling Climate controls.
- Reuse working account credentials privately, including the compatible existing legacy Google refresh token.
- Install beta.1, configure `NestClimateCntrl`, enable a new child bridge and pair it with Apple Home.
- Recreate affected rooms, scenes and automations. Remove the old dedicated Nest bridge and old package after verifying the new devices.
- `Keep Accessories Of Uninstalled Plugins` can stay enabled; it does not migrate ownership. Clean up only the old Nest entries. Never reset shared bridges or clear all accessories.
- Public README, migration guide, next beta release notes and embedded setup must warn Accfactory/Plus users about the fresh cutover.
- Existing `NestClimateCntrl` beta.1 installations can update normally. Do not create another UUID reset for the next beta.

The inspected old installation has seven accessories: two thermostats, four smoke/CO accessories and one occupancy accessory. It uses Plus 0.4.4, Homebridge 2.5.0 and UI 5.30.0 on a dedicated child bridge. All seven categories remain supported. No physical Apple Home validation has occurred.

## Implemented in beta.1

- Climate discovery: thermostats, native temperature sensors, Heat Links, Protect and Home/Away. Cameras, doorbells, floodlight cameras, Yale locks and weather are excluded. Use upstream for those capabilities with separate device ownership.
- Custom Homebridge settings dashboard: account setup, status/actions, native temperature-source selector, schedules, observed runtime, diagnostics and optional Home features.
- Optional Eco and 15/30/60-minute HVAC fan switches, off by default; these control the Nest-connected blower.
- Read-only discovery of accessible Homebridge main/child-bridge temperature, room-fan and motion/occupancy sources. Bridge credentials remain on the server.
- Mixed native/external temperature selection and single/equal-average previews. Health/freshness checks block invalid previews.
- New devices use the Climate UUID namespace. The existing compatibility adapter can reuse a matching legacy identity only when restored to this platform; it stays to avoid disrupting already-migrated installations.
- Approved plum icon in README and UI; 100px and 512px sources.

Automatic mixed-sensor thermostat compensation, external room-fan actions and combined occupancy execution are **not implemented**. Standalone rule editors save inactive drafts only.

## Standalone dashboard

PR #13 adds an opt-in HTTPS server, separate web account provisioned through Homebridge, per-bridge private credentials/certificates, revision-checked configuration saves, desktop/phone interface, existing live thermostat actions, source discovery, rule drafts, favicon and iOS icons.

Review status and current commits are in the dashboard handoff. It is not included in published beta.1. Do not publish a new npm beta without explicit approval. Final visual/accessibility checks and the old-package cutover notice are being completed.

## Validation and limits

- Full six-job Test workflow 42305559126 passed on `561bfc574f3a71ac0387d7db8b42a0eb4988f7d9`: Node 22/24 with Homebridge 1.11.4 and 2.4.0, Node 26 with 2.4.0, and Node 24 with 2.5.0; lint/tests/coverage/build, browser checks and real Homebridge cache restoration.
- Fifteen focused migration/identity tests and six mocked migration-runner scenarios passed. The offline utility and tests remain maintenance evidence only; the fresh cutover is now the supported path.
- Dashboard initial feature checks passed real HTTPS/auth/config tests, all six compatibility jobs, package installation and desktop/mobile browser checks. Recheck the final PR head after polish.
- Live Nest behavior, Heat Link, native source changes, physical fans and Apple Home setup remain hardware verification work.

## Publication status

GitHub prerelease `v0.5.0-beta.1` exists; npm accepted the maintainer's upload, then immediate registry verification returned E404. Do not republish this version. Verify registry visibility from the installation host before installing.

The accepted release is unchanged. Main's publish helper handles delayed registry visibility. The next beta has an unreleased cutover notice; no next version or npm publication is authorized yet.

## Exact next steps

1. Complete final dashboard visual review and PR checks, including the setup cutover notice.
2. Guide fresh beta.1 installation using the supported stop → add → start sequence; keep old Nest disabled during setup. Pair the new child bridge and verify all seven devices.
3. Remove old Nest pairing/config/accessories only, then rebuild affected Apple Home scenes and automations.
4. Finish/review the standalone dashboard release content and ask before publishing a new npm beta.
5. Validate real sensor discovery and native source semantics, then implement bounded temperature control, combined occupancy and room-fan execution with manual/Eco/schedule precedence and failure recovery.
