# Eco confirmation and built-in sensor checkpoint

Objective: reliable Eco command feedback and temperature groups using a positively reported built-in Nest sensor without an external paired-sensor list.

Repository: `pponce/homebridge-nest-climate-cntrl`. Integration branch: `main`. Feature branch: `fix/eco-sensor-feedback`, merged through PR #15. Published release: `v0.5.0-beta.18`.

## Changes

- Eco immediately displays the requested value with an explicitly pending badge and local status. Polling reads state every two seconds for a maximum of 30 seconds, never resending a command. Confirmation requires a connected device and a read started after command acceptance. Errors and timeouts show the last reported value. Late feedback remains visible. Logout clears pending feedback; thermostat requests are tracked independently.
- Native sensor parsing separately confirms built-in heating eligibility. An omitted paired-sensor list is allowed only with an explicit built-in selection and recognized mode. Malformed lists, unknown modes, conflicting selections and unsupported averaging remain blocked. Sensor setup and restore writes still require full validated state.
- Blocked temperature rules report the particular missing requirement. Heat mode is required; active heating is not.
- Public dashboard documentation and mocked browser/engine regressions cover the behavior.

## Validation

115 focused tests passed locally, including the idle built-in plus Homebridge group. JavaScript syntax and whitespace checks passed. GitHub Test run 42656537057 and dashboard run 42656536991 passed on c87623f8bbd75cf0c833c70bff6cca9aade3732d, including all six Node/Homebridge combinations, lint, coverage, builds, migration, production package checks and browser suites. All 23 publisher and 14 installer scenarios passed locally. Physical hardware verification remains pending.

## Decisions and next steps

GitHub beta.18 is published. Run `maintenance/publish-beta18.sh` to publish the verified tarball to npm's beta tag; open npm's printed authorization link on the desktop computer while SSH waits. After installing the update, reload the dashboard and review and Resume enabled rules. Verify the physical thermostat and contributing sensor readings. npm publication and physical installation verification remain maintainer-run actions.

The manual target-following discussion is tracked separately in `FEATURE_PLAN.md`: following a manual change is the requested future default, with an optional pause policy. This patch does not change manual target or schedule-boundary behavior.

## Published artifacts

- Release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.18
- Release commit: `f738882b62385d9cef10eb72f038495fc66178d6`.
- Final Test run `42656942587` and Release run `42656942654` passed, including all six runtime combinations, browser suites, production package installation and release-helper scenarios.
- Package SHA-256: `3df58bd4f5376e691c6a2ac5055606425660bfbfb8084aa353c6fa190ab91065`.
- Publisher SHA-256: `0fba56e519646344eb7233052b88eb1b219692a531227d98aefa1a23cf3736f5`.
- The pinned SSH block is `maintenance/publish-beta18.sh`. It retains the terminal session on failure and prints START/END markers; the helper reports how to copy its result file to a Mac.

```text
Objective: finish Eco command feedback and built-in sensor validation, then publish GitHub beta.18 and provide an npm script.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main. PR #15 / fix/eco-sensor-feedback merged.
Completed: optimistic Eco display; 2-second confirmation reads and 30-second timeout; independent thermostat feedback; precise waiting reasons; omitted paired list no longer blocks a positively confirmed built-in source.
Local checks: 115 focused tests passed; syntax/diff checks passed.
GitHub validation: Test 42656537057 and dashboard 42656536991 passed. Merge commit: ecf9f9d92a981e509f5e739f7607c50234596e62.
Released: v0.5.0-beta.18 at f738882b62385d9cef10eb72f038495fc66178d6. Final Test 42656942587 and Release 42656942654 passed. Publisher: maintenance/publish-beta18.sh.
Pending: maintainer-run npm publication, installation and physical verification. Manual target-following remains a separate implementation.
Important: sensor configuration writes remain strict; unknown/ambiguous sensor state remains blocked; no automatic command retries or fabricated cancellation; no assistant-run npm publication.
Next: run the publisher, install the update, reload the dashboard and Resume intended rules. Check the active controller and Eco confirmation on physical thermostats.
```
