# Publishing Nest Climate Cntrl

The package and repository are `homebridge-nest-climate-cntrl`. Platform alias: `NestClimateCntrl`.

The first climate beta is `0.5.0-beta.1`, published with the npm `beta` tag. Do not label it `latest`.

## GitHub release

Update package.json and package-lock.json, write the exact version section in PRERELEASE_NOTES.md, and set `.github/release-version` to that version. The marker triggers release validation on main. The release workflow checks all five supported Node/Homebridge combinations, dashboard behavior and a production-only tarball installation before creating a prerelease.

Release assets include the tested npm tarball, a read-only migration preflight, a publishing/inspection helper, and SHA256SUMS. The next beta prerelease notes must lead with the required fresh cutover from Nest Accfactory/Plus, name the `NestClimateCntrl` platform, and link to MIGRATION.md. Explicitly state that affected Apple Home assignments, scenes and automations must be recreated; existing Climate beta.1 installations can update normally. Keep the legacy Google authentication and upstream capability callouts.

## npm

The first publication requires the maintainer's authenticated npm account. Do not put npm credentials in a chat, repository or script. Use the checked release tarball with `npm publish --ignore-scripts --access public --tag beta`.

The release helper prompts for npm login if necessary. It also creates a redacted installation preflight report; it does not stop Homebridge, install the plugin, alter caches or create backups.

After the package exists, configure trusted publishing in npm's package settings:

- Provider: GitHub Actions
- User: `pponce`
- Repository: `homebridge-nest-climate-cntrl`
- Workflow filename: `npm-publish.yml`
- Allow direct publication with `npm publish`.

Run **Publish Climate Cntrl to npm** manually for an existing release tag. It downloads and verifies the tested release tarball. Ordinary pushes and GitHub release creation do not publish to npm.

## Migration checkpoint

Accfactory/Plus users follow the fresh cutover in MIGRATION.md: disable the old Nest platform, configure and pair a new Climate child bridge, verify devices, then remove the old Nest setup and rebuild affected Apple Home assignments. Do not run the experimental offline cache-ownership helper. Keep `Keep Accessories Of Uninstalled Plugins` unchanged and clean up only old Nest entries. Backups require explicit maintainer approval. Keep project files in the existing checkout. The preflight remains read-only.
