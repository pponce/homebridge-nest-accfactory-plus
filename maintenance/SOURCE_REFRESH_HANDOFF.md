# External source refresh checkpoint

## Objective and repository

Keep external Homebridge temperature, fan and presence readings current in the standalone dashboard without disrupting rule editing. Publish GitHub beta.8 and provide the maintainer-run npm publisher.

Repository: `pponce/homebridge-nest-climate-cntrl`. Target branch: `main`. Base commit: `307ae5301035090c981dca2dc0dad887d7a9b406`.

## Diagnosis and implementation

- Beta.7 periodically refreshed Nest status but fetched external readings only on entry or explicit discovery. The dashboard's 90-second freshness check could therefore mark working external sensors unavailable. Manual discovery restored their readings in a reported installation.
- The visible dashboard polls Nest status and external sources together every 30 seconds. Returning to the tab refreshes both immediately; manual status refresh does the same.
- Source picker rows retain their DOM nodes. Updating readings preserves unsaved fields, source selections, search text and keyboard focus. Discovery also populates newly available source choices without rebuilding the editor.
- Genuine source failures invalidate external readings independently of Nest status, and later successful reads recover. Existing freshness checks remain enforced. Hidden and signed-out dashboards do not poll; overlapping refresh requests are coalesced.
- This change does not alter the automation engine, thermostat adjustment formula, limits or update interval. Radiant-heating behavior was discussed only; no radiant-specific control changes were requested or made.
- Beta.8 updates the package versions, release marker, public guide, versioned publisher and installer. GitHub release creation does not publish to npm.

## Verification and release process

- Local syntax checks and all 11 external source/preview tests pass.
- Publisher success, existing upload, pending registry, dirty/diverged checkout, checksum, integrity mismatch, registry failure, upload failure and ignored-artifact preservation scenarios pass.
- Installer success, install failure with restart, restart failure, stop failure and checksum rejection scenarios pass.
- Browser regression covers four refresh cycles across the freshness cutoff, preservation of fields/selections/focus, external failure/recovery, hidden-tab resume, manual refresh, overlapping requests, no equipment/config writes and signed-out polling.
- Local Chromium is blocked by the execution environment's socket restrictions. Browser validation and the complete six-configuration Node/Homebridge matrix run in GitHub Actions; the release job requires them to pass.

## Next steps

1. Verify the release workflow succeeds and publishes `v0.5.0-beta.8` with its tested tarball, publisher, installer and checksums.
2. Run the beta.8 publisher in the existing project checkout to publish the tested package to npm's `beta` tag. It does not install or restart Homebridge.
3. Update the installed plugin, refresh the browser and confirm fan temperatures remain visible for more than two minutes while editing a rule. Review and Resume enabled temperature/fan rules after restarting the bridge.
4. Record physical-installation verification separately from browser fixtures. Do not change heating control behavior as part of the dashboard refresh fix.
