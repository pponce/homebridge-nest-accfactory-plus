# Climate development checkpoint

Updated: 2026-11-06

## Objective and review location

Develop Nest Climate Cntrl in `pponce/homebridge-nest-climate-cntrl`. The thermostat dashboard work is merged into `main`; PR #12 is closed. The feature branch remains at the released beta checkpoint.

Platform alias: `NestClimateCntrl`. Beta npm package: `homebridge-nest-climate-cntrl@0.5.0-beta.1`.
Repository renamed to `homebridge-nest-climate-cntrl`.
GitHub beta release and npm publication are authorized. Workspace npm authentication is unavailable; the release helper publishes the checked tarball from the maintainer’s authenticated terminal. No live installation or thermostat hardware commands have been performed.

## Implemented

- Climate discovery loads thermostats, native temperature sensors, Heat Links, Protect and Home/Away. Cameras, doorbells, floodlights, Yale locks and weather are excluded; video capability probes are bypassed. Legacy source and camera dependencies remain pending distribution cleanup.
- Custom Homebridge settings dashboard: account setup, thermostat status/actions, associated native sensor selection, optional Apple Home features, schedules, runtime totals/coverage and redacted diagnostics.
- Optional Eco and 15/30/60-minute HVAC fan-preset switches, disabled by default. HVAC presets do not control room/ceiling fans.
- Authenticated loopback dashboard with private endpoint file, serialized UI commands and runtime persistence that does not extrapolate stopped/offline periods.
- Read-only discovery of configured main/child-bridge temperature sensors, fans, motion and occupancy services. Discovery uses mDNS directly without authentication probes; the server uses fresh HAP GET reads and has no write endpoint. Discovery receives no PINs. Bridge PINs are not sent to the browser.
- Mixed Nest/non-Google sensor selection, single/equal-average temperature preview and bounded illustrative target. Per-thermostat selections persist through Homebridge Save. Missing sources stay visible; malformed preview settings are normalized on edit.
- Separate physical thermostat temperature captured before active Nest-sensor display normalization. Provider read time is explicitly distinct from physical measurement age.
- Fan and presence source lists report current readable state. No automatic room-fan or combined presence behavior is enabled.
- Partial bridge-read failures invalidate all that bridge's candidates without duplicating identities; faults, invalid values, stale reads and source/Eco changes prevent an eligible compensation preview.
- Approved plum icon applied to README/UI; exports: `maintenance/branding/nest-climate-cntrl-icon-100.png` and `homebridge-ui/public/nest-climate-cntrl-icon-512.png`.

## Identity decision and implementation

The maintainer allows UUID changes when needed. Preserve existing identities for migration where feasible; new installs and newly added devices use the plugin's own identity namespace.

- New devices: `homebridge-nest-climate-cntrl`.
- Migrated devices: retain the expected `homebridge-nest-accfactory` UUID if Homebridge restores it to this platform.
- Cache identities are recorded per runtime API, not globally across plugins. Unrelated cached UUIDs are ignored. If both expected identities exist, the Climate identity takes precedence.
- The shared HomeKitDevice submodule is unchanged; the existing identity adapter covers construction and platform lookups.
- UUID reuse is tested through the real device lifecycle and platform cache callback.
- **The alias/cache-association transition remains unimplemented and unverified for rollout.** Homebridge resolves cached `_associatedPlugin`/`_associatedPlatform` before calling `configureAccessory`. Changing the config alias alone can orphan accessories and is not a migration procedure.
- Prefer retaining the bridge username/pairing and service identities. If a particular installation needs recreation, identify its affected Apple Home assignments and guide that transition explicitly.
- Keep upstream/climate accessory ownership disjoint, regardless of namespaces.

## Validation

- Node 24 GitHub validation passes lint (14 existing warnings, zero errors), all **1,621 tests**, every production-module coverage floor and build verification.
- Chromium behavior checks pass: masked credentials, config preservation, mixed sensor preview without writes, invalid preview settings, native sensor command, offline control disabling, 375px layout and schema fallback.
- 32 focused control/dashboard/source/identity tests pass locally under Node 24.22.1.
- Final compatibility validation is the PR workflow: Node 22/24 with Homebridge 1.11.4 and 2.4.0; Node 26 with Homebridge 2.4.0; separate dashboard browser job. Check the latest PR head's result.
- Validated development checkpoint: `9d08653169df21ce0a436fe93ddc5156a5ba548d`; source-discovery correction: `5dbc8b2b90f32c7544bd3d9da1eb30d00183ac27`, formatting/lock: `b571d4740827a8ffc68d2846bc21db6a70bbb104`.
- Full visual inspection and real Homebridge integration, Eco, native sensor selection, HVAC fan, Heat Link, external sources and Apple Home migration are **not hardware verified**.

## Remaining work and exact next steps

1. Check the final PR matrix. Temporary development workflow/results have been removed; normal compatibility/browser jobs remain. Do not lower coverage floors.
2. Verify read-only discovery on an actual Homebridge installation, including child bridges, Google/external sensor deduplication and freshness/health reporting. Inspect desktop/mobile light/dark dashboard, Save and restart behavior.
3. Confirm native Nest physical-source semantics and the ability to hold/detect that source before enabling room-temperature compensation. Implement the heating pilot with bounded updates, manual/schedule/Eco precedence, acknowledgment tracking and restart/failure recovery described in `maintenance/FEATURE_PLAN.md`.
4. Add optional room-fan selection and coordination rules using the shared source adapter. Keep room/ceiling fans distinct from Nest's HVAC blower. No fan writes are implemented yet.
5. Build the combined Climate Home/Away rule editor and preview: searchable main/child-bridge motion/occupancy picker, Google baseline, any/all groups, holds, Away delay and manual overrides. Then add the optional derived occupancy accessory. No Google whole-home writes.
6. Add weighted/scheduled temperature groups after the single/equal-average heating controller is verified. Cooling and heat/cool ranges need separate validation.
7. Design/test cache association migration across supported Homebridge versions and with upstream installed. Verify rooms/scenes/automations on hardware; handle owned cached weather/camera/lock accessories. No blanket cache clearing or default re-pairing.
8. Finish camera-specific distribution/dependency cleanup while retaining provenance. Package/repository rename and beta onboarding docs are complete. Complete remaining verification updates as features graduate from beta. npm publication of 0.5.0-beta.1 is explicitly authorized; authentication must occur in the maintainer’s terminal.

## Workspace continuation

Local repository: `/workspace/scratch/3557d984da62/homebridge-nest-accfactory-plus`.
It was initialized from a source snapshot, not a full remote clone. Do not push synthetic local history.
Use remote GitHub trees/commits based on the inspected current branch and expected-SHA ref updates.
Other chats have modified the same branch's maintenance plan; inspect concurrent commits and preserve their changes.
Shared submodules were fetched at pinned revisions for local testing; never replace remote gitlinks with those source copies.
Source snapshots may have an extra trailing newline; compare normalized content when inspecting differences.
Local Chromium cannot launch under the execution restrictions; use the GitHub browser job.

## Beta release preparation

- Target: `v0.5.0-beta.1`, GitHub prerelease and npm `beta` tag.
- README rewritten for new users: climate scope, beta status, working controls versus read-only previews, legacy refresh-token support, and an upstream link for removed capabilities. Account setup moved to AUTHENTICATION.md.
- Release notes lead with `NestAccfactory` → `NestClimateCntrl` and link to tagged migration/coexistence instructions.
- Package registration renamed; legacy and Climate UUID namespaces remain unchanged by the package rename.
- Release workflow validates matrix, browser and production tarball, and attaches checksummed publishing/inspection helpers. npm workflow remains manually triggered.
- `scripts/migration-preflight.mjs` only reads installation files and outputs counts/status; privacy/no-mutation tests added. No cache-preserving migration implementation is claimed.
- `maintenance/publish-beta-and-inspect.sh` keeps assets/reports in the existing project folder, requests npm login locally, verifies the published tarball, and prints an rsync command for the redacted preflight report. It creates no backup and does not install or change Homebridge.
- After receiving that report, choose/test the migration for the actual bridge layout. Obtain approval before creating any backup or applying a custom cache patch.

## Validated beta checkpoint

- `da0b4c2c88498585bddf0473b9385c57a7936d1c`: 1,621 tests and coverage floors passed, Chromium behavior passed, production tarball installed and registered as `homebridge-nest-climate-cntrl` / `NestClimateCntrl`.
- Beta publishing and migration helpers are ready; no npm authentication exists in the workspace. The maintainer must run the checked helper and complete npm login/2FA locally.
- Release preparation includes all requested callouts: platform-name change plus migration link, upstream for removed capabilities, legacy Google token support for existing token holders, and clear beta/read-only feature boundaries.

## Accepted npm upload and checkout rename recovery

- GitHub prerelease `v0.5.0-beta.1` is published from `0bebdac1caae68fefe5ff27acb3d0bb00ce4350c`. Release and main compatibility/browser workflows passed.
- The maintainer's npm terminal reported an accepted upload for `homebridge-nest-climate-cntrl@0.5.0-beta.1`, followed by an immediate registry E404. Public availability, beta tag and tarball integrity still need verification. Do not upload this accepted version again.
- The existing development checkout is named `homebridge-nest-accfactory-plus`; the requested name is `homebridge-nest-climate-cntrl`. `maintenance/rename-checkout-and-verify-beta.sh` checks the origin, renames the existing folder, updates origin, retries read-only npm verification, and prints the existing preflight report's rsync command. Actual execution on the development host is pending.
- The publishing helper now retries registry verification and records accepted uploads to prevent repeated publication on a later invocation. Downloaded release assets and migration reports are ignored by Git. Published beta assets remain unchanged.
- Validation: Bash syntax and whitespace checks; isolated fixtures verified local changes/history retention, repeated runs, destination collision, delayed registry visibility, unresolved registry visibility and integrity mismatch. Publishing-helper fixtures verified exactly one mock upload across repeated runs after acceptance, including when verification remains pending. No real npm upload occurred in these tests.
- Next: run the rename/recovery helper, return the existing redacted preflight report, then select and test a migration procedure for that bridge layout. No live Homebridge changes or backups have been made.
