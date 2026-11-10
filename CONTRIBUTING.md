<!-- Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE. -->
# Contributing

## Development setup

Use Node.js 22 or 24. Node.js 26 support depends on the Homebridge version; use the compatibility ranges in `package.json` as authoritative. Preserve supported Homebridge 1.x and 2.x behaviour.

Clone the repository with its shared submodules and install dependencies:

```sh
git clone --recurse-submodules https://github.com/pponce/homebridge-nest-climate-cntrl.git
cd homebridge-nest-climate-cntrl
npm ci
```

For an existing checkout with missing submodules, run `git submodule update --init --recursive` before installing dependencies.

## Running checks

| Command | Purpose |
| --- | --- |
| `npm test` | Run the complete automated test suite without coverage instrumentation |
| `npm run test:coverage` | Run tests with coverage gates and write `coverage/summary.json` |
| `npm run lint` | Check source and test code with ESLint |
| `npm run build` | Build the distributable files in `dist/` |
| `npm run check` | Run lint, tests with coverage gates, and the build |

Run `npm run check` before submitting a change. Generated coverage reports remain in the ignored `coverage/` directory.

Tests use Node's built-in test runner. Network, process, filesystem and clock boundaries are isolated where needed; the automated suite does not require live account credentials or physical devices.

## Native HomeKit functionality

This project exposes device functionality through HomeKit services and characteristics that accurately represent its purpose. Standard HomeKit representations are preferred, while custom characteristics may be considered where they provide a meaningful and accurate representation of device-specific functionality. It does not aim to expose every feature available in the Nest or Google apps.

Custom characteristics must accurately represent the underlying device capability and use appropriate identifiers, data types, permissions and values.

Where no appropriate HomeKit representation exists, do not expose the functionality through an unrelated service or characteristic:

- Optional thermostat Eco switches and momentary HVAC fan-preset switches are supported. Keep them disabled by default and validate the underlying device capability.
- Do not repurpose standard HomeKit characteristics or their defined values to represent unrelated device functionality.
- Other accessory representations require a clear product decision and accurate service semantics.

Functionality without an appropriate HomeKit representation should remain in the Nest or Google app.

This is an intentional project design constraint, not a missing feature to work around. Feature requests and pull requests must follow this policy; proposals that depend on these accessory workarounds may be rejected.

## Making changes

- Keep each fix focused on the demonstrated problem. Avoid unrelated refactoring or formatting.
- Preserve supported devices, configuration compatibility, accessory identity and Nest/Google source handling.
- Add regression tests that assert observable state, commands or lifecycle outcomes. Cover failure paths relevant to the change.
- For device controls, test both upstream updates and HomeKit writes.
- Follow the repository's `AGENTS.md` instructions when using coding agents.

Every production `.js` and `.mjs` module under `src/` must appear in the coverage report, including the shared submodules. New modules need tests and an explicit entry in `test/coverage-baseline.json`.

Coverage floors apply separately to lines, branches and functions in each module. Do not lower floors simply to make checks pass; raise them as verified coverage improves. The existing floors allow for runtime accounting differences. Importing a module or reaching a percentage does not establish complete behaviour coverage.

Test dependency replacements must preserve production code and its source locations. Executions through rewritten data URLs or extracted methods do not measure coverage of the original source file.

## Verification limits

Successful automated tests do not verify live Nest/Google services, physical HomeKit or Matter accessories.

For affected behaviour, separately check native-app and HomeKit changes, offline recovery, cached accessory restoration and shutdown.

Describe what you tested and what remains unverified. For live checks, record relevant runtime, Homebridge/HAP versions, device models, source API and observed outcomes. Never include credentials, cookies or tokens in fixtures, logs or issue reports.

CI is configured to run checks with Node.js 22 and 24 against Homebridge 1.11.4 and 2.4.0, and Node.js 26 against Homebridge 2.4.0. A local pass does not establish that all CI combinations passed.

## Release notes

Record meaningful alpha and beta changes under the current version in `PRERELEASE_NOTES.md`. Entries describe that pre-release only and are not cumulative.

For a final release, consolidate meaningful outcomes into `CHANGELOG.md`. Shared modules may maintain their own code-date changelogs. Update existing source code-date metadata when changing those files, without changing unrelated package or release versions.



## Attribution

Preserve upstream author and license notices when editing inherited files, and identify modifications by this fork. Keep the README credits, NOTICE and THIRD_PARTY_NOTICES.md accurate. Bundled shared libraries retain their original sources and licenses; update the documented revisions when updating submodules. Run `node scripts/check-package.js` after building to verify the installable package, license files and climate-only media scope.
