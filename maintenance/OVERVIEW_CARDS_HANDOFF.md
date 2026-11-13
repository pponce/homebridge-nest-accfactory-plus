# Overview cards v0.6.5

## Objective

Use compact thermostat-sized fan and occupancy cards with matching icons. Show discovered room fan status even when Off or unassigned to a rule. Show presence only when a presence rule is saved. Publish a GitHub release with changelog and provide the npm publication launcher; do not publish npm from this environment.

## Repository

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Released base: v0.6.4 / 1cad095a1ccd6443a1db19358da74dba91358046.
- Candidate branch: feature/compact-overview-cards.
- Local checkout is reconstructed; use remote parent/tree IDs for publishing rather than local ancestry.

## Changes and decisions

- Shared card styling, fan/person icons on each card, fixed two-column desktop grid matching thermostat widths, single column on narrow phones, and independent expanded card heights.
- Merge discovered fans with rule evidence by source identity. Current fan feedback does not depend on an automation rule. Preserve mapped labels from saved config, not unsaved edits.
- Keep known fans visible as Unavailable when discovery loses them during the current session; clear this cache at sign-out. Show unavailable or stale feedback without calling it Off.
- Render fan cards when source discovery finishes, including initial dashboard load and explicit source refresh.
- Presence visibility follows saved rules, including disabled rules and the period before engine feedback. Raw occupancy sources alone do not create cards.
- Runtime automation and device writes are unchanged.
- Version, release intent, publisher and installer are 0.6.5; public behavior is documented in WEB_DASHBOARD.md and the exact CHANGELOG release section.

## Validation checkpoint

- App/browser-check syntax, embedded asset build and diff whitespace checks pass locally.
- Publisher and installer test suites exercise success, checksum failures, download fallbacks, auth and installation failures. No real npm publication or Homebridge installation is performed.
- The shared browser regression covers fan/occupancy icons, compact widths, Off/unassigned/stale/mapped statuses, source refresh independent of rule feedback, lost bridges, disabled presence, no-rule section hiding, persistence of expanded details and mobile overflow. It runs for both embedded and standalone dashboards in GitHub Actions.
- Local Chromium cannot run in this environment; rely on the GitHub browser job for the actual browser validation. No hardware verification is claimed.

## Next steps

1. Complete candidate compatibility and browser checks; resolve any failures.
2. Fast-forward main to the tested candidate using the expected current main SHA.
3. Wait for the release workflow and verify v0.6.5 assets, tag and publisher checksum.
4. Return release/changelog links and maintenance/publish-0.6.5.sh as a complete SSH-safe brace block.
