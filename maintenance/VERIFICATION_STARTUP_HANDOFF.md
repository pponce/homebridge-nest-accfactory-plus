# Configured startup and stable 0.5.1

Objective: keep unconfigured runtimes inactive, preserve opt-in standalone web access, contain lifecycle errors, and publish a stable GitHub release followed by a user-run npm publisher.

Repository: pponce/homebridge-nest-climate-cntrl. Base main: b9a4ce1cd2ea1d6c62fd25ebf08f97ba8ebb6ec7. Implementation branch: fix/configured-startup. The local Git snapshot predates main; publish selected file changes on the current remote tree instead of pushing the local Git history.

Changes: missing/malformed configuration logs and returns; no usable accounts prevents all runtime listeners and automation; startup and shutdown are idempotent and contain errors; partial climate-service startup is cleaned up while native account connections remain available; shutdown waits for pending startup and cleans remaining components after individual failures; cached accessories, configuration requests and background status notifications have guarded boundaries. Standalone web access continues to require boolean true. Existing explicitly enabled settings are preserved. The embedded Homebridge configuration form is available without a running climate backend.

Regression coverage: missing/null/malformed configuration, no/invalid/excluded accounts, explicit web enable without an account, default-off web access, creating login credentials without enabling web access, partial startup failures, shutdown failures and races, cached-accessory failures, request failures and status notification failures. Browser checks cover opening account setup while the runtime is inactive. Existing presence tests use a configured account with mocked cloud startup.

Validation checkpoint: syntax checks passed locally. The local environment cannot install npm dependencies (registry access returns HTTP 403), so the complete test/coverage/browser and production package checks must run in GitHub Actions before release. No physical thermostat changes or hardware tests are performed.

Next steps: pass PR checks on the implementation commit, merge to main, wait for the gated 0.5.1 release workflow, verify stable release metadata and asset checksums, then provide the version-pinned npm publishing block. Do not publish npm from the agent. Update this note with the final commit, workflow results and release URL after completion.
