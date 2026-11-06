# Climate development checkpoint

Updated: 2026-11-06

## Objective and review location

Develop Nest Climate Cntrl in `pponce/homebridge-nest-accfactory-plus`, branch `feature/thermostat-dashboard`.
Draft PR: https://github.com/pponce/homebridge-nest-accfactory-plus/pull/12

Platform alias: `NestClimateCntrl`. Current npm package: `homebridge-nest-accfactory-plus`.
Planned package/repository name: `homebridge-nest-climate-cntrl`.
No npm publication, live installation or thermostat hardware commands have been performed.

## Implemented

- Climate discovery loads thermostats, native temperature sensors, Heat Links, Protect and Home/Away. Cameras, doorbells, floodlights, Yale locks and weather are excluded; video capability probes are bypassed. Legacy source and camera dependencies remain pending distribution cleanup.
- Custom Homebridge settings dashboard: account setup, thermostat status/actions, associated native sensor selection, optional Apple Home features, schedules, runtime totals/coverage and redacted diagnostics.
- Optional Eco and 15/30/60-minute HVAC fan-preset switches, disabled by default. HVAC presets do not control room/ceiling fans.
- Authenticated loopback dashboard with private endpoint file, serialized UI commands and runtime persistence that does not extrapolate stopped/offline periods.
- Read-only discovery of configured main/child-bridge temperature sensors, fans, motion and occupancy services. The server uses fresh HAP GET reads; no write endpoint exists. Bridge PINs are not sent to the browser.
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

- Node 24 GitHub validation passes lint (14 existing warnings, zero errors), all **1,617 tests**, every production-module coverage floor and build verification.
- Chromium behavior checks pass: masked credentials, config preservation, mixed sensor preview without writes, invalid preview settings, native sensor command, offline control disabling, 375px layout and schema fallback.
- 28 focused control/dashboard/source/identity tests pass locally under Node 24.22.1.
- Final compatibility validation is the PR workflow: Node 22/24 with Homebridge 1.11.4 and 2.4.0; Node 26 with Homebridge 2.4.0; separate dashboard browser job. Check the latest PR head's result.
- Validated development checkpoint: `762065f2006e15cf98da40efcf640f0f41d94bea`; code change: `13337e412c7aff64a41415b683ed6c009070b483`, formatting: `070e7c3e3b621114649cbe7a544b18523b161270`.
- Full visual inspection and real Homebridge integration, Eco, native sensor selection, HVAC fan, Heat Link, external sources and Apple Home migration are **not hardware verified**.

## Remaining work and exact next steps

1. Finish the final PR matrix; remove temporary development validation workflow/result artifacts once no longer needed. Do not lower coverage floors.
2. Verify read-only discovery on an actual Homebridge installation, including child bridges, Google/external sensor deduplication and freshness/health reporting. Inspect desktop/mobile light/dark dashboard, Save and restart behavior.
3. Confirm native Nest physical-source semantics and the ability to hold/detect that source before enabling room-temperature compensation. Implement the heating pilot with bounded updates, manual/schedule/Eco precedence, acknowledgment tracking and restart/failure recovery described in `maintenance/FEATURE_PLAN.md`.
4. Add optional room-fan selection and coordination rules using the shared source adapter. Keep room/ceiling fans distinct from Nest's HVAC blower. No fan writes are implemented yet.
5. Build the combined Climate Home/Away rule editor and preview: searchable main/child-bridge motion/occupancy picker, Google baseline, any/all groups, holds, Away delay and manual overrides. Then add the optional derived occupancy accessory. No Google whole-home writes.
6. Add weighted/scheduled temperature groups after the single/equal-average heating controller is verified. Cooling and heat/cool ranges need separate validation.
7. Design/test cache association migration across supported Homebridge versions and with upstream installed. Verify rooms/scenes/automations on hardware; handle owned cached weather/camera/lock accessories. No blanket cache clearing or default re-pairing.
8. Finish camera-specific distribution/dependency cleanup while retaining provenance. Complete package/repository rename, public documentation and verification updates at feature completion. Ask before npm publication.

## Workspace continuation

Local repository: `/workspace/scratch/3557d984da62/homebridge-nest-accfactory-plus`.
It was initialized from a source snapshot, not a full remote clone. Do not push synthetic local history.
Use remote GitHub trees/commits based on the inspected current branch and expected-SHA ref updates.
Other chats have modified the same branch's maintenance plan; inspect concurrent commits and preserve their changes.
Shared submodules were fetched at pinned revisions for local testing; never replace remote gitlinks with those source copies.
Source snapshots may have an extra trailing newline; compare normalized content when inspecting differences.
Local Chromium cannot launch under the execution restrictions; use the GitHub browser job.
