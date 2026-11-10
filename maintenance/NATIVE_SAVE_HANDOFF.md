# Native Homebridge Save checkpoint

Objective: route restart-required edits in the embedded climate interface through Homebridge’s bottom Save button and restart prompt, while preserving immediate climate saves and the standalone dashboard’s explicit Restart child bridge action.

Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
Branch: feature/native-config-save
PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/25
Base main: a5ef2fe1f1157877b38e966789ddd9935295dca7
Final feature head: 48831dfecb8219714652a5dafe7b19e61dda1d80
Merged main commit: f61e53323e3314c734273ddd8b8317e222157f49
PR #25 merged. Release workflow 42855673326 and main Test workflow 42855673448 succeeded.
Published stable release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.6.1
Verified as GitHub’s latest release; not a draft or prerelease.
Target stable version: 0.6.1

Completed:
- Shared server validation produces staged full plugin blocks without writing configuration or changing runtime restart state. Full blocks are restricted to authenticated Homebridge IPC; the web API cannot retrieve them.
- The documented updatePluginConfig / enableSaveButton SDK flow stages restart-required edits and lets Homebridge own saving and restart prompts. No parent DOM manipulation or automatic bridge restart.
- Live climate changes retain Save changes. Mixed climate/accessory edits save together through Homebridge. Discard, invalid drafts, revision conflicts and obsolete asynchronous replies keep native Save disabled.
- Accounts and web access stage through native Save. Web login credentials save separately to private storage, including before the first runtime starts; password-only changes do not request a restart.
- Account drafts refresh when opened without unsaved edits. Concurrent edits in climate and account sections must be saved or discarded separately.
- Standalone Save changes and explicit Restart child bridge remain in place. Reconnection may require signing in again.
- Version files, stable release helpers, packaging checks, public documentation and browser fixtures updated.

Validation:
- 48 focused tests passed locally: server, config preservation/staging, authenticated IPC, account provisioning and native Save races.
- Publisher helper: 23 fixture cases passed. Installer helper: 14 cases passed.
- Final feature head passed all six Node/Homebridge combinations, lint, full source coverage, build, package/install checks and the complete embedded/standalone/proxy browser suite.
- Test workflow: 42855215184 succeeded. Standalone dashboard workflow: 42855215213 succeeded.
- Desktop and 390px native Save screenshots inspected; review/native-config-save contains fixture screenshots.
- README edit fa1872df0ec2ba3c5acf9b5077abf0a297ba4b1c preserved in merge.
- No live bridge restart, equipment command, npm publication or live installation performed. Actual Homebridge restart modal behavior is based on the documented SDK and Homebridge UI save implementation; the browser fixture verifies the plugin boundary rather than restarting a real installation.

Next steps:
1. User runs maintenance/publish-0.6.1.sh. It pins the merged release commit and verified publisher hash, publishes the tested GitHub package with the npm latest tag, and prints browser authentication links without opening a browser. Do not publish npm directly without user authorization.
2. User updates through Homebridge after npm publication. Changes requiring restart in config UI use Homebridge’s bottom Save; standalone uses Save changes followed by Restart child bridge.
3. If publication fails, inspect the report path and copy command printed by the helper.

Package SHA-256: 1b7fe92021281c57197d637ed39395f511c0aa581f709d00f39a2773f554cb26
Publisher SHA-256: 23c511e3ff9c546c5ac9865826dd584b930714554a03d1d6d858539f57cc7892
Installer SHA-256: 529a1667571a765790bf6f5777ab46589cfd5c47f5d0a81b62c98285b5517a4a

Workspace note: local .git is an older reconstructed snapshot with prior task edits. Do not push local history or all status entries. Use GitHub git-data trees based on the verified remote feature tree and only selected task files. Preserve unrelated files and do not create backups without approval.
