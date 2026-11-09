# Manual target following checkpoint

Objective: keep an active temperature group active when the Nest target changes, adjust its desired room temperature by the same delta, and offer a per-rule pause policy.

Repository: `pponce/homebridge-nest-climate-cntrl`. Base `main`: `c9a630af438b268cd3885efe9ababe1ef6e63189`. Working branch: `feature/manual-room-target`. Release target: `v0.5.0-beta.19`.

## Implemented

- Temperature rules default to `manualTargetBehavior: follow` when the option is absent; `pause` requires explicit Resume after a manual target change.
- Separate saved desired target, effective desired target, source (rule/manual/schedule) and actual Nest target. Temporary adjustments do not rewrite saved configuration or selected sensors.
- Known HomeKit target requests retain the group, invalidate queued compensation, wait for both command acceptance and native feedback, and accumulate rapid changes from the last requested value. Physical/Google target changes are recognized after confirmed own-write feedback. Fahrenheit display rounding is accounted for.
- Own command acknowledgements cannot become new desired targets. Conflicting feedback while a compensation is pending remains a review/pause condition. Failed or unconfirmed manual requests do not invent an accepted desired value or retry.
- Native schedule events use their absolute heating target after native confirmation. Future-only schedule edits preserve manual adjustments. Unknown targets and time-zone changes require review.
- Changing the saved desired value uses it directly. Use saved room target resets a temporary target without pausing. Resume/re-enable starts from the saved target. Restart still requires Resume.
- Dashboard mode choice, help, desired versus adjusted target labels, current target source, and reset control. Heating observations use the effective desired target.
- Authorized HomeKit extension: per-thermostat Show climate rule temperature in Apple Home, off by default. Active rules project group current temperature and desired target. HomeKit desired edits are absolute and bypass the physical-target pause option. Native fallback for paused/disabled/unavailable rules, modes and stale readings. No accessory recreation or raw Nest data replacement.
- Physical-target pause is a per-rule toggle, off by default.

## Checks

157 focused tests passed locally across automation, sensor setup, dashboard, heating response, cloud controls and web server. Syntax and whitespace checks passed. Full platform routing, coverage, build and browser checks run in GitHub CI because this local snapshot lacks submodule dependencies and Chromium cannot launch here. Physical equipment behavior is not yet verified.

## Copyable handoff

```text
Objective: default manual target following with an optional pause mode; preserve the sensor group and distinguish room target from actual Nest target.
Repo/branch: pponce/homebridge-nest-climate-cntrl, feature/manual-room-target -> main. Base c9a630af438b268cd3885efe9ababe1ef6e63189. Target beta.19.
Completed: relative manual changes, explicit pause policy, desired/saved/Nest runtime targets, own-write and command-acceptance separation, rapid HomeKit changes, schedule target handoff, saved-target reset, dashboard labels/help and documentation.
Local validation: 157 focused tests passed; syntax/diff checks passed. All six Node/Homebridge matrix combinations and browser checks passed for 2bd525c36c085d6ad580df1f5bd2433a8c1af533. Physical hardware verification remains pending.
Decisions: HomeKit defaults to actual Nest values. Optional room display uses absolute desired edits while physical Nest/Google changes use relative follow or explicit pause (default off). Mode/Eco/lock/source changes and ambiguous confirmations still pause. No native temperature hold is created.
Next: integrate the validated feature, finish GitHub beta.19 release validation and attach a pinned npm publisher. Do not publish npm automatically. After installation, Resume the group, enable HomeKit room display for one thermostat, verify desired-target edits, then test physical follow and optional pause.
```

## Integration checkpoint

Feature head: `2bd525c36c085d6ad580df1f5bd2433a8c1af533`, PR #16. Test run `42666340173` and standalone dashboard run `42666340079` passed. Release helper checks passed: 23 publisher and 14 installer scenarios. Node 22/24/26, supported Homebridge 1.11.4/2.4.0/2.5.0 combinations, coverage, build, migration and browser checks are green. Native data and accessory identity remain intact. A stale projected write is rejected rather than interpreted as a raw Nest target.
