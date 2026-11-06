# Standalone dashboard work

Updated: 2026-11-06

## Goal

Add an opt-in, directly addressable climate dashboard to Nest Climate Cntrl, with a polished desktop/mobile layout, browser and iOS icons, status, supported live controls, safe configuration editing, and draft editors for the planned sensor/fan/presence rules.

## Branch and ownership

- Repository: `pponce/homebridge-nest-climate-cntrl`.
- Feature branch: `feature/standalone-dashboard`, implementation based on main `32abeaf07fca58fc30512f2551457cd18d143752`.
- Draft pull request: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/13.
- Fresh-install documentation from main `3552339eacf7a15172d2a5ee354a5fb2875f3511` is merged into the feature. Nest Accfactory/Plus users need a fresh child bridge and Apple Home setup; existing Climate beta installations retain their bridge.
- Migration work proceeds independently on `main`. Preserve those commits and concurrent README edits when preparing the feature tree.
- Local workspace is a source snapshot with synthetic Git history. Do not push local history or replace remote submodule gitlinks.
- No live installation changes, backups or npm publication are part of this work.

## Architecture

- Reference: `pponce/homebridge-gdoor-admin-controller` web admin. Reuse the product pattern: opt-in HTTPS, a separate web login provisioned in Homebridge Settings, reachable-host link, and responsive web-app icons.
- Standalone assets live in `homebridge-ui/dashboard/`.
- Top-level configuration: `webDashboard` with enabled, host, port (9444), displayHost, certificatePath and keyPath.
- Existing loopback/Bearer-authenticated ClimateDashboard exposes `/web/status` and `/web/account` only to the Homebridge UI server. Account passwords are never written into plugin config or returned in status.
- Standalone server and configuration store are implemented in new `src/web-dashboard*.js` modules. HTTPS, scrypt account hashes, secure cookies, same-origin/CSRF checks, session expiry, request limits, optimistic configuration saves and shutdown races have targeted regression coverage.
- Authentication and generated certificates are isolated in `nest-climate/web/bridge-<normalized child bridge username>/`, with `web/main/` as the main-bridge fallback. Directory permissions are 0700 and private files are 0600.
- Frontend uses Overview, Sources, Rules and Settings, desktop navigation and mobile navigation, warm neutral surfaces, and the approved plum identity.
- Current live actions are Eco, native temperature source selection and Nest HVAC fan timers. New occupancy, mixed-temperature and room-fan rule editors save drafts; automatic rule execution remains out of scope until the planned controllers are implemented and tested.

## Validation state

- Embedded setup integration and all 12 `test/climate-dashboard.test.js` tests pass locally, including bearer/origin rejection for web-account provisioning and password exclusion from status.
- All 11 backend tests pass locally, including a real HTTPS listener, multi-child credential isolation and graceful shutdown during startup/config writes.
- Local Chromium is blocked by a platform socket restriction. Use the feature-branch GitHub browser workflow for rendered interaction/layout checks; do not claim local visual verification.
- `.github/workflows/dashboard-web.yml` runs the full checks with Homebridge 2.5.0 and embedded/standalone browser fixtures, and uploads screenshots and coverage.
- Coverage floors were added for the three new modules; existing floors remain unchanged. CI also installs a production tarball and checks every new server/UI asset.
- Successful browser CI publishes fixture-only screenshots and a source-commit report to `review/standalone-dashboard`. Write permissions exist only in that push-only visual-review job; it never updates source branches.
- Feature commit `a91381114c9b6c8a36a859a055d7fbcf8156a99b` passed full Node 24 / Homebridge 2.5.0 checks, production tarball installation, embedded/standalone browser tests and screenshot publication in run `42306490060`.
- GitHub's text-only connector cannot decode PNG blobs. Review publication includes base64 text companions for retrieving exact PNG bytes for visual inspection; all screenshots contain fixture data only.
- Follow-up `afe9b1ee454a0a0ee60b681f4404dfa1756b8d94` also passed all six project matrices and standalone/package/browser workflows. Eight screenshots were retrieved and visually inspected in `maintenance/review-dashboard/`.
- Visual review prompted stronger small-text contrast, 44px mobile controls, a compact mobile overview, a shorter fan-condition label and clean screenshot captures. Final browser assertions cover these changes and fixed navigation/save-bar clearance. `run-dashboard-browser.mjs` exposes fixture failure details in workflow metadata.

## Next steps

1. Run package checks and the browser fixture on GitHub. Inspect mobile/desktop screenshots and address findings.
2. Record exact commits, test outcomes and review links here.
3. Present the feature branch for review; the released beta and the live migration remain separate.
