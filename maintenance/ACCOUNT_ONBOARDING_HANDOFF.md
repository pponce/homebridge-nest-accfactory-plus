# Account onboarding checkpoint

## Objective and decisions

Move connection setup into the shared climate interface as **Accounts & web access**, immediately below Settings in navigation. On opening Homebridge plugin Settings, use usable saved account credentials to choose setup or Overview. A transient runtime outage must not look like a fresh installation. Standalone web access stays off by default and is independent of the embedded interface.

Use Homebridge's supported updatePluginConfig/savePluginConfig APIs; preserve all unrelated configuration and other platform blocks. Account and web changes require a bridge restart. Credentials remain managed through authenticated Homebridge Settings; the standalone page shows redacted status and directions.

## Repository and branch

- Repository: pponce/homebridge-nest-climate-cntrl
- Branch: feature/account-onboarding
- PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/23
- Base main: a12f37f97c4c9815583f657c39e21508ec45274e
- Final candidate: b7758807e8bf3c35e5c4beb369be4b3d95ed0281
- Local git is an older reconstructed snapshot. Only publish selected-file trees based on current remote main; never push the local history or full diff.

## Completed implementation

- Shared responsive account page, Nest/Google authentication fields, optional web network/TLS/proxy settings and web login creation.
- First install can create its initial hashed web login before the climate runtime starts, using the saved child bridge identity and Homebridge storage. Existing web credential rotation stays with the running runtime for session invalidation. Failed runtime requests never bypass that protection.
- Config revision checks retain drafts after failed or conflicting saves; account changes preserve climate rules, devices and bridge identity.
- Shared navigation, first-install routing, optional live dashboard shortcut, embedded asset packaging, documentation and stable 0.5.4 release metadata.
- Configured users can reach the account page during a runtime outage. No-account startup avoids climate/discovery requests.

## Validation and release

- Local setup/preservation and hashed-storage tests passed.
- Publisher fixture: all 23 scenarios passed. Installer fixture: all 14 scenarios passed.
- Initial CI exposed a newly long build-script line and a browser navigation timing issue; both corrected in the current candidate.
- Final PR Test 42726365960: all six runtime combinations and browser checks passed.
- Final PR dashboard 42726362174 and branch dashboard 42726352930: package/server/browser checks passed.
- Exact-candidate screenshots inspected from review/account-onboarding. Desktop, 390px mobile, first setup and dark mode passed visual review.
- PR #23 merged at 2c128042a5e80db2ab64e8c289d8811aebfc1fcf. Stable release v0.5.4 is published as the latest GitHub release.
- Publisher helper SHA-256: 055d60b19abd248bb5e8577e49ae4b64640d7285c7f1967ff892bec0e15a56b0.
- Installer helper SHA-256: 8b6edb176a3c86ee0d63d6f38323a0d8b7ca0bd88badc996e67408842e902482.
- Local Chromium cannot start in this environment; GitHub Actions runs browser checks and publishes screenshots to review/account-onboarding.

## User next steps

1. Run maintenance/publish-0.5.4.sh in the existing Linux project to publish the verified GitHub tarball to npm latest. The wrapper pins the release merge and publisher checksum. It prints START/END markers, keeps the SSH shell open and prints a publication-report rsync command.
2. Update to 0.5.4 through Homebridge Plugins, restart the Nest child bridge and reopen Settings.
3. Existing configured users should land on Overview. Open Menu → Accounts & web access to manage setup. New installations without usable saved credentials should land on the setup page. Standalone web access remains optional and off by default.

## Final release evidence

- Release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.4
- Release workflow 42726776471: all eight jobs passed, including production installation and helper checks.
- Main Test 42726776481: all seven jobs passed.
- Tag target verified: 2c128042a5e80db2ab64e8c289d8811aebfc1fcf.
- All five release assets verified; stable release is latest and is not a prerelease.
- Package SHA-256: 03cccec67213bb5fe1d1d5a1296531806b6189164dd01a576729b29c5d397e39.
- npm publication and live Homebridge installation were not performed by this workspace. Device behavior was validated with fixtures, not the user's live thermostats.
