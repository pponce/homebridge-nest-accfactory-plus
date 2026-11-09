# Eco confirmation and built-in sensor checkpoint

Objective: reliable Eco command feedback and temperature groups using a positively reported built-in Nest sensor without an external paired-sensor list.

Repository: `pponce/homebridge-nest-climate-cntrl`. Base: `main` at `4f2fb3bcc2ebfe5c7dbd7f5377eb6894d984b857`. Working branch: `fix/eco-sensor-feedback`. Release target: `v0.5.0-beta.18`.

## Changes

- Eco immediately displays the requested value with an explicitly pending badge and local status. Polling reads state every two seconds for a maximum of 30 seconds, never resending a command. Confirmation requires a connected device and a read started after command acceptance. Errors and timeouts show the last reported value. Late feedback remains visible. Logout clears pending feedback; thermostat requests are tracked independently.
- Native sensor parsing separately confirms built-in heating eligibility. An omitted paired-sensor list is allowed only with an explicit built-in selection and recognized mode. Malformed lists, unknown modes, conflicting selections and unsupported averaging remain blocked. Sensor setup and restore writes still require full validated state.
- Blocked temperature rules report the particular missing requirement. Heat mode is required; active heating is not.
- Public dashboard documentation and mocked browser/engine regressions cover the behavior.

## Validation

115 focused tests passed locally, including the idle built-in plus Homebridge group. JavaScript syntax and whitespace checks passed. GitHub Test run 42656537057 and dashboard run 42656536991 passed on c87623f8bbd75cf0c833c70bff6cca9aade3732d, including all six Node/Homebridge combinations, lint, coverage, builds, migration, production package checks and browser suites. All 23 publisher and 14 installer scenarios passed locally. Physical hardware verification remains pending.

## Decisions and next steps

Publish the validated beta.18 GitHub release and provide a pinned npm publishing block. npm publication remains a maintainer-run action. The manual target-following discussion is tracked separately in `FEATURE_PLAN.md`; this patch does not change manual target or schedule-boundary policy.

```text
Objective: finish Eco command feedback and built-in sensor validation, then publish GitHub beta.18 and provide an npm script.
Repository/branch: pponce/homebridge-nest-climate-cntrl, fix/eco-sensor-feedback -> main.
Completed: optimistic Eco display; 2-second confirmation reads and 30-second timeout; independent thermostat feedback; precise waiting reasons; omitted paired list no longer blocks a positively confirmed built-in source.
Local checks: 115 focused tests passed; syntax/diff checks passed.
GitHub validation: Test 42656537057 and dashboard 42656536991 passed. Merge commit: ecf9f9d92a981e509f5e739f7607c50234596e62.
Pending: beta.18 release workflow, pinned npm publisher and physical installation verification.
Important: sensor configuration writes remain strict; unknown/ambiguous sensor state remains blocked; no automatic command retries or fabricated cancellation; no assistant-run npm publication.
Next: inspect CI, resolve failures, merge, release, verify artifacts and provide the complete SSH-safe publishing block.
```
