# Climate development checkpoint

Updated: 2026-11-07

## Project and current release

Repository: `pponce/homebridge-nest-climate-cntrl`. Platform: `NestClimateCntrl`. npm package: `homebridge-nest-climate-cntrl`.

Current release: **0.5.0-beta.3**, source `f06e33b58462b4194d7565492e047a8389c8954e`. GitHub prerelease: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.3.

The user authorized this release and a Mint script to update local Git and publish the tested tarball to npm's `beta` channel. npm publication is a user-terminal action; it has not been performed from this workspace. Do not claim registry availability without the script result.

## Latest change and validation

Main now contains **optional HTTP dashboard mode**, source `047bb64ca56555772615c4fc5b72bdb5ccb2b360` (implementation `7d96d82041c997a988f0c06faec8aa8c3d00de2e`). This is **unreleased**; package version and the published beta.3 assets are unchanged. The current request authorized implementing HTTP, not publishing another npm version.

HTTPS remains the default. Explicit `webDashboard.protocol: "http"` runs an HTTP listener without reading or generating TLS files. Setup, sign-in, the signed-in dashboard and startup logs warn that passwords and dashboard data travel unencrypted. HTTP and HTTPS use separate session-cookie names; origin checks, CSRF validation and login remain required. HTTPS certificates and keys can be configured in beta.3 already.

Validation: 26 targeted web/dashboard tests passed locally, including a real HTTP listener, cookie separation, origin/CSRF checks, logout and no TLS setup under HTTP. GitHub Test run `42317208074` passed all six Node/Homebridge combinations and both embedded and standalone browser suites, including HTTP warnings, HTTPS warning suppression, 360px layout, text contrast and touch targets. Chromium cannot launch in this workspace because its process socket is restricted, so browser validation uses GitHub CI.

For a trusted internal hostname: point DNS to the Homebridge host, set `displayHost` to the hostname only, use HTTPS on port 9444, and supply a readable full-chain PEM and matching private key. Save and restart the child bridge. Restart after certificate renewal. Port-free URLs require a reverse proxy on 443 with an HTTPS backend and preserved external Host; forwarded scheme headers are not trusted. No DNS, certificate permissions, proxy or live Homebridge settings have been changed.

### Released beta.3

Web dashboard account passwords allow **8–128 characters**. Server validation, the Homebridge provisioning form and setup guidance agree. Existing longer passwords and stored hashes remain valid.

Targeted tests passed: all 12 web-server/auth tests, including minimum/maximum boundaries, login after reload and preservation of the account when a replacement is rejected. The embedded browser fixture rejects seven characters and provisions an eight-character account without saving the password in plugin config.

Full release validation: **passed**. Release run `42311129478`; normal Test run `42311129429`. Required checks cover six Node/Homebridge combinations, both browser suites, production-tarball installation, ten publisher scenarios and an actual Git ignored-file collision.

## Local checkout and publisher

Mint checkout: `~/devProjects/homebridge-nest-climate-cntrl`. The last inspection showed local `main` with only untracked `maintenance/artifacts/`.

Use the beta.3 asset `update-checkout-and-publish-beta.sh`. SHA256: `a01cbfa5de8b99eb94bff2068e3a9e6e8b2e080e06c06ba25d981b99d83326c7`. It updates a clean local main, fetches submodules, downloads/verifies the tested release package and publishes with `--tag beta`. It retries registry visibility and never repeats an upload recorded as accepted.

The helper keeps `maintenance/releases/`, `maintenance/migration/` and `maintenance/artifacts/` local using Git excludes. It uses `--no-overwrite-ignore` to protect ignored files from an incoming collision. Other edits still stop the update. It never stashes, resets, deletes artifacts, creates backups or changes Homebridge.

Publication reports are under `maintenance/releases/v0.5.0-beta.3/publish-result-*.json`; the script prints the exact rsync command. The tested npm tarball SHA256 is `81bfc4cec9856b94d01efc87d3808b45d688cb07c47632667ad996f346729c30`.

## Fresh cutover decision

Moving from Nest Accfactory/Plus requires a new Climate child bridge and Apple Home pairing. Reuse working account credentials privately, then rebuild affected room assignments, scenes and automations. Disable the old Nest platform before activating Climate controls. Remove only old Nest entries once the new devices work.

`Keep Accessories Of Uninstalled Plugins` can stay enabled; it does not transfer ownership. Do not run `maintenance/migrate-to-beta.sh` or apply the experimental offline cache rewrite. No backups or live cache edits were performed or approved.

Existing Climate beta.1/beta.2 installations can update normally. Retain stable identities; this release does not force a reset.

The inspected legacy installation had two thermostats, four smoke/CO accessories and one occupancy accessory, on Plus 0.4.4 / Homebridge 2.5.0 / UI 5.30.0. All seven accessory categories remain supported; real installation status needs confirmation from the user.

## Implemented features and boundaries

- Thermostats, native temperature sensors, Heat Links, Protect and Nest Home/Away.
- Legacy Google refresh-token support for existing compatible tokens; no new legacy-token issuance and no SDM requirement.
- Embedded Homebridge settings, Eco switches, native temperature-source selection, optional 15/30/60-minute HVAC fan switches, schedules and observed runtime.
- Standalone opt-in HTTPS dashboard, separate login, per-child private auth/certificates, responsive desktop/phone UI, plum browser/iOS icons, settings with revision conflict detection, live supported Nest actions and source discovery. Optional HTTP mode is on main for the next beta.
- Read-only mixed Nest/non-Google temperature preview and accessible Homebridge room-fan/presence discovery.
- Temperature, occupancy and external room-fan rules remain **inactive drafts**. Automatic compensation/occupancy/fan controllers are not implemented.
- Cameras, doorbells, floodlight cameras, Yale locks and weather belong in upstream with separate device ownership.

## Exact next steps

1. Run the beta.3 publisher on Mint; complete npm login/2FA locally and inspect the result report. If registry verification is pending, rerun verification without republishing an accepted upload.
2. Install beta.3 using stop → add → start, following fresh cutover only for old Accfactory packages. No live installation change has occurred from this workspace.
3. In Homebridge settings, create/update the dashboard web login with at least eight characters, enable web access, configure the user's trusted hostname/certificate if desired, save/restart and verify HTTPS and Add to Home Screen on an actual iPhone. Confirm actual certificate paths and service-user read permissions before suggesting changes.
4. Verify normal Nest controls and external discovery on real equipment. Automatic browser tests use fixture data.
5. Continue bounded temperature control, combined occupancy and room-fan execution with manual/Eco/schedule precedence and failure recovery.
6. When a new beta is requested, include optional HTTP mode, bump version and release metadata, run the full release checks and generate a newly pinned publisher. Do not alter beta.3 assets or claim HTTP is in the currently released package.

## Workspace continuation

Workspace source snapshot: `/workspace/scratch/3557d984da62/homebridge-nest-accfactory-plus`. Its local Git history is synthetic: do not push it. Use remote trees/commits with expected-SHA updates; preserve concurrent edits and gitlinks. Keep notes under maintenance and avoid uploading real credentials or private snapshots.
