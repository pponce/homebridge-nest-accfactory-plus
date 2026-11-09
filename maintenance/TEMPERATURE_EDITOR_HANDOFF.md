# Dashboard temperature editor and stable 0.5.0

Objective: allow inline temperature adjustments from the standalone web dashboard and publish a stable GitHub 0.5.0 release, followed by a user-run npm publication script for the latest channel.

Repository: pponce/homebridge-nest-climate-cntrl. Branch: feature/dashboard-temperature-control. PR: #19. Base main: d52e75f24aa6041b4903759e68e7a2326115205e (beta.21). Keep all project work in this checkout; maintenance notes belong here.

Implementation: standalone thermostat cards offer an inline numeric editor with plus/minus, Apply, Cancel and Escape. Active rules edit their absolute desired room target using the same durable runtime path as Apple Home, independent of the per-thermostat HomeKit projection setting. Native or paused-rule control edits the physical Nest target; paused rules remain paused. The editor is absent in the embedded Homebridge Settings view. Heat, Cool and Heat • Cool targets, C/F conversion, mobile and dark layouts are covered.

Validation: backend checks current controller, mode, Eco, lock, connectivity, supported capabilities and numeric limits. An opaque expected-state token rejects stale edits and is rechecked before queued native commands. Room writes also check current persisted rule configuration. Unconfirmed or restoring rules cannot silently fall through to native target editing. The browser preserves edits during polling, displays pending requests optimistically, waits at most 30 seconds and never resends automatically. Stop waiting dismisses confirmation only; it does not undo a sent command. Room writes retain source selections and minimum write interval and survive restart. Existing HomeKit opt-in semantics remain intact.

Release preparation: package/version marker 0.5.0, publishConfig latest, consolidated CHANGELOG.md, current README/Migration/dashboard docs, stable installer and stable publisher. The release workflow chooses beta or stable assets by version, marks stable releases latest and keeps all matrix/browser/package/helper gates. No npm publish is performed by the agent.

Local evidence: 121 focused runtime/API tests pass, including room-target persistence, paused/restoring transitions, invalid values, C/F conversion foundations, modes/capability checks and authentication/CSRF. All 23 publisher and 14 installer scenarios pass using mocked remote commands. Browser launch is unavailable in this local sandbox due to socket restrictions; GitHub browser jobs provide the actual execution and screenshots. Physical thermostat operation is not hardware-verified.

Integration checkpoint: PR #19 merged into main at f0a078676a3bcc6cec74f32edc7c570f2da1c4f9. Feature head a70f9d7b630ac5e2481b50e93c5ca6b31f731b95 passed the full matrix and browser checks in Test run 42698479350 and production package/browser/visual review checks in run 42698462960. Desktop, phone and dark screenshots on review/temperature-control were inspected. Main Test run 42698920643 passed all six combinations and browser checks. Stable release run 42698920290 passed all matrix, browser, production package and helper checks and published v0.5.0. GitHub reports it as the latest release with prerelease=false and draft=false. Release and tag both point to the merged main commit f0a078676a3bcc6cec74f32edc7c570f2da1c4f9. All 11 migration tests passed locally. No tests or release gates were skipped or relaxed.

Verified assets: package SHA256 b22906fe65c3a75164807994a1d851c479d58e28cb1e0d78e98c78af79067c62; publisher SHA256 5e8a8fd731e296274c913d93b8de80168e91292eb35dec8f044597526f0f9d9b. Release URL: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0.

Next steps:

1. Run the full block in maintenance/publish-0.5.0.sh on the publishing host. It downloads the exact-revision stable helper, verifies its hash, fast-forwards the existing clean checkout, verifies the GitHub package, publishes to npm latest and verifies registry integrity. Open any printed authorization URL on a separate computer. The helper prints START/END and a publication-report copy command; it does not install or restart Homebridge.
2. Install homebridge-nest-climate-cntrl@0.5.0 through the existing Homebridge update flow. No accessory re-pairing is needed for an existing Climate installation.
3. Reload the standalone dashboard, click a thermostat target, adjust the desired room temperature and Apply. Confirm the sensor group remains active and its new desired value appears. The adjusted Nest target may wait for the rule's configured interval. Check native or paused-rule target changes separately if desired.

Outstanding: user-run npm publication and live physical thermostat verification. No npm publication or live installation changes were performed by the agent. No pending implementation or CI failures remain.
