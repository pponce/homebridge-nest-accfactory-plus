# Compact climate navigation

## Objective and decisions

Use a collapsed hamburger menu for the embedded Homebridge config interface and the standalone dashboard on iPhone/narrow web screens. Preserve the standalone desktop sidebar. The menu overlays content and closes on destination selection (including the current page), outside pointer/focus interaction or Escape. Preserve unsaved edits across viewport changes and keep mobile Sign out available.

Homebridge Config UI X theme CSS targets the generic sidebar class and sets its background to the theme primary color. Its iframe body also carries theme text/background styles. Use a plugin-specific climate-sidebar class, explicit embedded content colors and scoped navigation link colors, including the host theme's important hover rules.

## Repository and branch

- Repository: pponce/homebridge-nest-climate-cntrl
- Branch: feature/compact-navigation
- PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/22
- Base main: bd5f8eea58a4d7e038959421c4f74abfbdc1ef00
- Initial patch: 8f4fae8eef596af27a7637fae27c2ef29b6541dc
- Local git history is a reconstructed older snapshot. Create selected-file trees against the current remote tree; do not push local history or the full local diff.

## Implementation

- Shared app mounts the same navigation and account nodes into a compact menu when embedded or viewport width is at most 760px. It restores those nodes to the sidebar at standalone desktop widths.
- Accessible Menu button reports expanded state and controls the panel. Escape returns focus to it; ArrowDown opens/focuses navigation; normal Tab order is retained.
- Full-width embedded content, responsive header and safe-area save bar spacing. Light/dark menu colors, current-page indication and 44px minimum touch targets.
- Homebridge hides standalone account controls; standalone mobile retains Sign out.
- Existing browser fixtures now exercise the compact menu. Shared navigation checks cover dismissal, keyboard access, overlay positioning, contrast and viewport fit. The embedded fixture includes representative Homebridge theme rules.
- Visual review workflow publishes fixture screenshots to review/compact-navigation.
- Stable 0.5.3 version and publishing/install helpers are prepared. No actual npm publishing or live installation was performed.

## Validation checkpoint

- Local build and syntax checks passed.
- PR workflows: Test 42719845758; dashboard 42719845621.
- Branch dashboard/visual review workflow: 42719828401.
- Final tested feature head: 4ba99fb43f9d91d86edd16153c9f50722e38092d.
- Final PR Test 42720330356 passed all six runtime combinations and browser tests.
- Final PR dashboard 42720330816 passed server/package and browser checks.
- Final branch dashboard 42720319671 passed tests and screenshot publication.
- Screenshots from the exact candidate commit inspected in review/compact-navigation: embedded desktop/mobile and standalone mobile light/dark. Menu bounds, contrast and reclaimed width are satisfactory.
- Publisher helper: 23 scenarios passed. Installer helper: 14 scenarios passed.
- Early browser check failures were corrected: outside clicks must target an uncovered element, and responsive assertions must wait for the browser media-query event. Product behavior remained unchanged.
- PR #22 merged at 37671be04f5a8cad11b77d922131bda7200721ae.
- Stable 0.5.3 published as the latest GitHub release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.3
- Main Test 42720827738: passed. Release 42720827813: all eight jobs passed, including production tarball installation.
- Tag target verified: 37671be04f5a8cad11b77d922131bda7200721ae.
- Package SHA-256: 797fdb79722377f3fcc2f4367ec23e7b27d694a4a069bfbcfeec8e7de2d0625b.
- All five release assets uploaded; helper digests match the pinned publication/installation scripts.
- Publisher helper SHA-256: 7e350cab7ead1f7c3209ce6bd71a417127a1171b7946ca5b376caa22ed545890
- Installer helper SHA-256: 79bb443a64df077b64507d1cfa36cf846bfc966f826d9664b1e96278ccebba9f

## Next steps

1. User runs maintenance/publish-0.5.3.sh on the existing Linux checkout to publish the verified release tarball to npm's latest tag. The wrapper pins the release commit and checks the publisher helper digest.
2. User updates the plugin to 0.5.3 in Homebridge Plugins, restarts its child bridge and refreshes the config UI or standalone dashboard.
3. Confirm the config menu and phone layout with the user's actual setup. No npm publication or live installation was performed by this workspace.

The complete SSH publication block prints START/END markers, does not close the shell, and its helper prints the rsync command for the publication report. No saved configuration or accessory identity changes are required.
