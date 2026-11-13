# Combined dashboard and fan mapping release

## Objective

Release v0.6.4 combining PR28 Overview explanations, PR29 thermostat schedule context and diagnostics relocation, and optional per-fan manual speed mappings used by fan rules. Publish GitHub release with consolidated changelog and provide an SSH-safe npm publication launcher; do not publish npm from this environment.

## Repository and integration

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Released base: 662bd0ca9b3112506daca93cc6ba3771ef1d6dbb (v0.6.3).
- PR28 parent: cc5cea2da000362044cddc8c82878bc40356c713.
- PR29 parent: fe5b4b942666b10bcb94f53293d17ad1f3cf09a9.
- Integration branch: feature/fan-mappings-combined-release.
- Local workspace contains a reconstructed checkout; local git ancestry is not remote ancestry. Publish trees through the GitHub connector with the remote parents and expected-head protection.

## Implementation and decisions

- Optional climateFanMappings root config, exposed as config.fanMappings in the dashboard envelope. Each sourceId has labeled inclusive integer min/max ranges. Partial maps are allowed; uncovered percentages retain exact behavior. Zero remains Off. No plugin inspection/import logic.
- Shared helpers select a native-supported command near the mapped range midpoint within the rule's command limits. Comparison accepts percentages in one mapped physical setting, but preserves detection of different settings and power changes. Existing update intervals remain; mapped setting changes bypass the unmapped five-point deadband.
- Adapter re-reads devices before each write and receives the mapping explicitly from the engine. Mappings cannot grant capabilities or bypass command limits and final guards.
- Sensors & fans editor adds/removes rows, validates ambiguity and bounds, retains edits/expansion through source refresh, and saves live without restart. Rule tables/previews and saved Overview explanations include labels.
- Combined schedule UI prominently identifies the thermostat and mode, shows relevant targets, explains rule impacts and moves diagnostics to Settings.
- Package/root lock/release intent are 0.6.4. CHANGELOG contains exact release section and notes inherited v0.6.3 feedback recovery. Public usage is in WEB_DASHBOARD.md. maintenance/publish-0.6.4.sh launches the checksum-verified 0.6.4 publisher; publisher and installer pins match the package.

## Validation checkpoint

- 187 focused mapping/control/config/schedule/dashboard tests pass, including accepted settled feedback, manual changes, restoration, saved-state reload, missing mappings and config preservation/staging.
- Focused coverage: climate-explanations 100% lines / 95% branches / 100% functions; fan-speed-control 97.87% / 98.25% / 100% (above existing floors).
- Syntax and dashboard asset build pass. Local Chromium is unavailable due to socket sandbox restrictions; browser checks are delegated to GitHub Actions infrastructure, not treated as hardware validation.
- Combined browser suite passed in GitHub Actions run 43339456198 at candidate 725b6245f465d0474de28faba2112418c0726626; subsequent candidate corrects lint formatting, release-helper pins and final-adapter minimum propagation for narrow mapped ranges. Publisher/installer success and failure-path checks pass locally.
- Browser regression exercises add/remove/save/reload/overlap rejection/unsaved refresh/discard/mobile layout using the real dashboard config store.
- No physical fan or thermostat commands have been sent by this development work.

## Research for manual entry

homebridge-bigAssFans-2 v1.3.0, inspected upstream main 9c0b00649fb443c27d728f0905bd0f434abd342b and fork b2d192ef8d4a590991a7812dda3d3232d81a818e. src/platformAccessory.ts uses max(1, round(percent/100*7)) above zero and round(speed/7*100) for settled feedback. Integer input ranges: 1–21, 22–35, 36–49, 50–64, 65–78, 79–92, 93–100. Settled percentages: 14,29,43,57,71,86,100. These values are user-entered, not built-in presets.

## Next steps

1. Push combined candidate with both remote parents; open PR and complete the six Node/Homebridge combinations and browser/server/package checks.
2. Resolve any failures and rerun affected checks. Recheck main, then advance it only to the tested combined candidate.
3. Wait for release workflow validation and verify published v0.6.4 plus archive/checksums/helpers.
4. Return GitHub release and changelog links, manual mapping table, and full brace-block npm launcher. The release watcher is disabled to prevent a competing publication.
