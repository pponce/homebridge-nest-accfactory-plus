# Fan rules and dashboard confirmations checkpoint

Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Base: 446bb6c0986e20ca55f6af5d5b9cf2ff07b5bd9b. Latest release: v0.5.0-beta.12.

## Objective

Separate fan run conditions from speed choices, support several prioritized rules per fan, and use in-page dashboard confirmations.

## Completed implementation

- Temperature, active heating and active cooling triggers each offer last-setting on/off, fixed speed, or temperature-based speed.
- Priority 0–100; higher wins per fan. Enabled overlapping rules must use distinct priorities. Unknown required inputs reserve the fan and prevent lower-priority fallback.
- Handoffs retain original baseline and share the per-fan cooldown; caps can reduce speed immediately. Manual overrides block every rule for the affected fan until Resume, while other fans may continue.
- Legacy temperature-speed rules normalize with their original inclusive start threshold and stop gap. Existing on/off rules keep last-setting behavior.
- Dashboard editor, previews, execution assignments, public documentation and browser fixtures updated.
- Discard, delete and unsaved sign-out use an accessible in-page dialog. Keep editing is the initial focus; Escape cancels; failed reloads retain drafts.

## Validation at checkpoint

93 focused model, engine, HAP-source and configuration/web tests passed locally. Fan controller coverage: 97.73% lines, 98.05% branches, 100% functions; existing floors retained. Build passed. All six Node/Homebridge compatibility configurations passed lint, full tests, coverage, build and migration checks on code commit 7618c40bf196f4c40a2f4ecf567f3a20877bfe7e in Test run 42564910059. Embedded, standalone, reverse-proxy, heating-response and fan-speed browser suites passed. Browser checks include modal focus trapping, Escape/cancel, failed-discard recovery, mobile layout, all trigger/speed choices, legacy rule normalization and overlapping-priority validation.

## Next steps

GitHub prerelease v0.5.0-beta.12 was published from fc3445fcb24e4272d2e7cf1cdda8e750977612dd. Release run 42567862251 and Test run 42567862232 passed all six compatibility configurations and browser checks. The production tarball install/registration and both release helper test suites passed. Physical fan behavior and installed dashboard confirmation remain unverified. No live installation was changed and no npm publication was performed.

Next: run the release's checksum-pinned npm publisher from the existing clean main checkout, complete npm login/2FA as prompted, and confirm the publication report. Then update the installed plugin separately, refresh the dashboard, review and Resume enabled temperature/fan rules, and verify actual fan behavior and in-page confirmations.

Release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.5.0-beta.12
Publisher SHA-256: 904716e02ea8b561c84a29666b24e4f95f1b309c93cbb16301e3d4b8b86a0268
Package SHA-256: 469583bc9a920d1cf00e3d4ce8292f05d91be0b2ca4bede3da95f3c0e544d397

Use the current GitHub main tree and an expected-head check when pushing. The release changes only version metadata, release notes and version-pinned helpers.

## Copyable handoff

```text
Objective: independent fan triggers/speed choices, prioritized shared fans, and in-page confirmations.
Repository: pponce/homebridge-nest-climate-cntrl; branch main.
Implementation commit: 7618c40bf196f4c40a2f4ecf567f3a20877bfe7e.
Completed: last/fixed/curve speed for every trigger; per-fan priority and manual overrides; compatible legacy migration; styled discard/delete/sign-out confirmations.
Decision: highest priority wins; missing higher-priority readings block fallback; fan handoffs preserve baseline and cooldown.
Local validation: 93 focused tests, coverage floors and build passed.
GitHub validation: all six compatibility configurations and all browser suites passed; Test run 42564910059.
Released: v0.5.0-beta.12 at fc3445fcb24e4272d2e7cf1cdda8e750977612dd.
Release validation: run 42567862251 passed all six configurations, browser checks, production tarball installation and release helper checks.
Pending: maintainer-run npm publication and installed fan/UI confirmation.
No live installation or npm release was changed. Heating-control behavior was not changed.
Next: run the checksum-pinned beta.12 publisher, verify npm's beta tag, update the installed plugin separately, and confirm fan/UI behavior.
```

## Sensor setup feasibility discussion

The current heating controller requires a confirmed built-in Nest sensor. The dashboard/system already implement `temperature_sensor: ''` to select the backplate, but that command preserves the sensor schedule mode. The included RemoteComfortSensingSettingsTrait defines RCS_CONTROL_MODE_HOLD and RCS_CONTROL_MODE_SCHEDULE, plus newer multi-sensor settings. This establishes a possible implementation path, not verified behavior on live equipment.

Proposed follow-up: an explicit in-page setup confirmation, capability/model checks, preserve the saved native sensor schedule, select the backplate with an appropriate sensor hold, wait for fresh device confirmation, and only then allow temperature-group control. Provide a clear way to restore native sensor control; manual Nest changes retain priority. Schedule suspension and this assisted setup flow are not implemented in beta.12. Validate 4th-generation sensorSelection/multiSensorSettings behavior before claiming support; do not infer success merely from command acceptance or protobuf fields.
