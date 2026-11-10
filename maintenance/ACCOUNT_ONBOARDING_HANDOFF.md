# Account onboarding checkpoint

## Objective and decisions

Move connection setup into the shared climate interface as **Accounts & web access**, immediately below Settings in navigation. On opening Homebridge plugin Settings, use usable saved account credentials to choose setup or Overview. A transient runtime outage must not look like a fresh installation. Standalone web access stays off by default and is independent of the embedded interface.

Use Homebridge's supported updatePluginConfig/savePluginConfig APIs; preserve all unrelated configuration and other platform blocks. Account and web changes require a bridge restart. Credentials remain managed through authenticated Homebridge Settings; the standalone page shows redacted status and directions.

## Repository and branch

- Repository: pponce/homebridge-nest-climate-cntrl
- Branch: feature/account-onboarding
- PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/23
- Base main: a12f37f97c4c9815583f657c39e21508ec45274e
- Current candidate: 276f2567f8c10e661d900e637d9961a31a23b221
- Local git is an older reconstructed snapshot. Only publish selected-file trees based on current remote main; never push the local history or full diff.

## Completed implementation

- Shared responsive account page, Nest/Google authentication fields, optional web network/TLS/proxy settings and web login creation.
- First install can create its initial hashed web login before the climate runtime starts, using the saved child bridge identity and Homebridge storage. Existing web credential rotation stays with the running runtime for session invalidation. Failed runtime requests never bypass that protection.
- Config revision checks retain drafts after failed or conflicting saves; account changes preserve climate rules, devices and bridge identity.
- Shared navigation, first-install routing, optional live dashboard shortcut, embedded asset packaging, documentation and stable 0.5.4 release metadata.
- Configured users can reach the account page during a runtime outage. No-account startup avoids climate/discovery requests.

## Validation and outstanding work

- Local setup/preservation and hashed-storage tests passed.
- Publisher fixture: all 23 scenarios passed. Installer fixture: all 14 scenarios passed.
- Initial CI exposed a newly long build-script line and a browser navigation timing issue; both corrected in the current candidate.
- Current CI: Test 42725454716; branch dashboard 42725446983. Full runtime matrix, installed package and browser checks pending.
- Local Chromium cannot start in this environment; GitHub Actions runs browser checks and publishes screenshots to review/account-onboarding.

## Exact next steps

1. Inspect all current candidate CI results; fix any failures and rerun affected checks.
2. Verify report.json sourceCommit and visually inspect desktop/mobile/dark/first-install screenshots.
3. Merge PR #23 only after checks pass. Verify stable v0.5.4 release, tag, production installation and all release assets.
4. Create maintenance/publish-0.5.4.sh pinned to the release merge commit and helper SHA-256; update this handoff with results.
5. Give the complete SSH publication block to the user. Do not publish npm or change the live Homebridge installation from this workspace.
