# Rule field help and publication checkpoint

Objective: explain climate rule fields beside their labels and provide one SSH-friendly GitHub-to-npm publication script.

Repository: `pponce/homebridge-nest-climate-cntrl`. Branch: `main`. Release target: `v0.5.0-beta.16`.

## Implemented

- 25 help descriptions cover temperature groups, presence rules, fan conditions and speed, source selections, execution and priority.
- Information icons sit immediately beside labels. Hover, keyboard focus and touch open help; Escape, outside clicks and a second tap dismiss it. Only one tooltip is visible. Hovering the text keeps it open. Touch targets are 44 px, and popups fit the viewport in both themes.
- Labels remain associated with inputs. Help buttons are separate controls, so reading help cannot enable a rule or change its draft. Temperature examples use current draft values and units.
- npm login uses `--auth-type=web --browser=false`; publication uses `--browser=false`. Authentication URLs are printed for opening on another computer, without launching a browser or changing global npm settings.
- `maintenance/update-checkout-and-publish-beta.sh --github-release` creates or reuses the validated GitHub release before downloading, verifying and publishing its tarball to npm's `beta` tag. An absent release is created by the existing release workflow via authenticated GitHub CLI. If GitHub CLI is unavailable, the script prints the workflow URL and stops before npm.
- `maintenance/publish-beta16.sh` is the complete pinned copy/paste entry point. It includes the source-download Git fallback and checksum verification, then passes `--github-release`.

Implementation commits: `0e2b3e03e7f0f93c32e238df9ef1549af8ca86e6`, `a19976fd87e3a7551ff6e143443de4cacb9541a2`, and keyboard-focus cleanup in `ee38e63e249b8ce1c985fed78f7fcf9b4f2f1528`.
Publisher source SHA-256: `f81e0b2a1607a071521d9d9b352ec0a807a0994e1224558c08f25ae3c697a674`.

## Verification

- Local JavaScript and Bash syntax and diff checks passed.
- 23 publication checks passed, including SSH web login, both GitHub creation/reuse paths, waiting for release assets, API/auth/validation failure, checksums, npm failure/propagation and preserving local artifacts.
- 14 installer scenarios passed, including the GitHub API download fallback and stop/add/start failures.
- Initial CI passed all six Node/Homebridge combinations and the desktop/phone help checks. The fan fixture needed an exact label match to distinguish its field from the new help button; that selector is corrected.
- The subsequent fan help check caught a pinned tooltip remaining open after focus moved into a field. Help now dismisses on outside keyboard focus, and the test verifies reopening uses the edited draft. Final validation passed on `ee38e63e249b8ce1c985fed78f7fcf9b4f2f1528`: Test `42648680604`, Release `42648680633`. All six Node/Homebridge combinations, browser suites, production-only package installation and helper checks succeeded. GitHub beta.16 is published at https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.16.

Release package SHA-256: `5ad149313be348e708908aaea22c687bc2407281afc9b95399285599c28bfecf`.

## Remaining steps

1. GitHub release validation is complete. The published package and helper assets are ready.
2. Run the complete `maintenance/publish-beta16.sh` block over SSH. Open npm's printed authorization URL on the desktop computer and leave the terminal waiting.
3. After npm verification, install beta.16, refresh the dashboard, inspect field help and Resume desired temperature/fan rules after restart.

No npm publication, Homebridge installation or thermostat/fan command has been performed by the assistant. Physical behavior remains untested. The change adds explanations and publishing options; execution decisions remain in the existing rule engine.

## Copyable handoff

```text
Goal: accessible help beside climate-rule field labels, plus one GitHub-to-npm publication script that works over SSH.
Repository/branch: pponce/homebridge-nest-climate-cntrl, main. Target: v0.5.0-beta.16.
Code: 0e2b3e03e7f0f93c32e238df9ef1549af8ca86e6 and a19976fd87e3a7551ff6e143443de4cacb9541a2.
Done: 25 field/group explanations; hover, keyboard and tap help; current-draft Celsius/Fahrenheit examples; npm prints login URLs; optional validated GitHub release before npm.
Local checks: syntax/diff clean, 23 publication checks and 14 installer scenarios pass.
CI: Test 42648680604 and Release 42648680633 passed on ee38e63e249b8ce1c985fed78f7fcf9b4f2f1528. GitHub v0.5.0-beta.16 is published.
Entry script: maintenance/publish-beta16.sh, pins publisher source at a19976f and SHA-256 f81e0b2a1607a071521d9d9b352ec0a807a0994e1224558c08f25ae3c697a674.
Next: run publisher on the existing host, complete npm's printed link, install the update and refresh the dashboard.
No assistant-run npm publication, live installation or device commands. No new execution-engine behavior.
```
