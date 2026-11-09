# Homebridge config UI asset loading

## Objective

Restore the embedded climate settings interface on Homebridge Config UI X and release stable 0.5.2. Keep standalone web access optional and off by default. Do not publish npm from this workspace.

## Repository and implementation

- Repository: pponce/homebridge-nest-climate-cntrl
- Branch: fix/homebridge-ui-assets
- PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/21
- Base main: 5fdf2ce3121f1347d7b2ba21313358dad386386a
- Patch: 4d3d7553d4268811a326618809da878464b8455d
- Local git is an older reconstructed snapshot. Commit selected files through GitHub's git-data API; do not push local history or the full working-tree diff.

Homebridge Config UI X's custom-UI controller rejects additional HTML documents, including nested index.html. The plugin previously fetched climate/index.html and reported a missing package for any non-success HTTP response. The file was packaged; the requested route was unsupported.

The build now exports the canonical dashboard HTML as climate/markup.js. The Homebridge loader imports it and mounts its body before importing the shared app. The standalone dashboard keeps its normal HTML entrypoint. No Homebridge host modifications or authentication changes are needed.

The embedded browser fixture rejects additional HTML documents, checks that normal settings/rules load without such requests, and simulates a markup-module failure while verifying connection setup remains usable. Production package checks import the installed markup module and compare it with the canonical dashboard source.

## Validation checkpoint

- Local build and shared-markup equality: passed.
- Syntax checks for the build, package verifier, loader and browser fixture: passed.
- Publisher helper scenarios: 23 passed.
- Installer helper scenarios: 14 passed.
- Local Chromium cannot launch because its socket operation is restricted; browser validation runs in GitHub Actions.
- PR Test run: 42710784987: passed (all six runtime combinations and browser checks).
- PR dashboard run: 42710784781: passed (browser and production-package installation checks).

## Release checkpoint

- PR #21 merged after required checks passed.
- Release commit: edcd24ec033684cc9dc9c44b9b5ded983d1f690e
- Stable GitHub release is published: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.2
- Main Test run 42711086677: passed. Release run 42711087032: all eight jobs passed, including production-package installation.
- Release package SHA-256: f65e18b78cd4561b1d185bdac0ea40dcd2a895ae17e2a03d45a9400c70b12d12
- GitHub asset metadata confirms both helper digests match the pinned local scripts.
- Publisher helper SHA-256: 3cf7277d13fb606108c951e4bbe64db8742d059f273a6480ac9b68b854f14ea6
- Installer helper SHA-256: b35beee114847db90f1daed2b0db909ccf4935d8f0dc028ecbbe5c07b6b447c7
- Local maintenance/publish-0.5.2.sh pins the release commit and verified publisher helper.

## Next steps

1. User runs maintenance/publish-0.5.2.sh on the existing Linux project checkout to publish the verified GitHub tarball to npm's latest tag. The script verifies checksums, checks the existing version and handles npm browser login by printing its link.
2. User updates Nest Climate Cntrl to 0.5.2 from Homebridge Plugins, restarts the child bridge and reopens Settings (refresh the Homebridge page if already open).
3. Confirm the embedded climate interface loads with existing saved rules. npm publication and the user's installation have not been performed by this workspace.

The publication wrapper is a complete shell block, pins the release commit and helper checksum, preserves the SSH session and prints START/END markers. Its result includes a command to copy the publication report to a Mac.

Saved accounts, rules, runtime defaults and accessory identities are unchanged. No live thermostat or user's browser has been exercised.
