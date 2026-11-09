# Publishing Nest Climate Cntrl

The package and repository are `homebridge-nest-climate-cntrl`. Platform alias: `NestClimateCntrl`.

The current climate release target is `0.5.0-beta.12`. Publish it with the npm `beta` tag. Do not label it `latest`.

## GitHub release

Update package.json and package-lock.json, write the exact version section in PRERELEASE_NOTES.md, and set `.github/release-version` to that version. The marker triggers release validation on main. The release workflow checks all six supported Node/Homebridge combinations, embedded and standalone dashboard behavior and a production-only tarball installation before creating a prerelease.

Release assets include the tested npm tarball, a read-only migration preflight, a checkout-update/publication helper, an execution-beta installer, and SHA256SUMS. Release notes describe the current feature scope and link to the setup guide. Accfactory/Plus migration remains a fresh cutover under MIGRATION.md; existing Climate installations update normally.

## npm

The first publication requires the maintainer's authenticated npm account. Do not put npm credentials in a chat, repository or script. Use the checked release tarball with `npm publish --ignore-scripts --access public --tag beta`.

After explicit publication approval, run the current `maintenance/update-checkout-and-publish-beta.sh` from the existing project checkout. It fast-forwards a clean local `main`, updates submodules, downloads and verifies the tested GitHub tarball, and prompts for npm login/2FA if needed. It does not stop Homebridge, install the plugin, alter accessory caches or create backups. A private publication-result report includes a command for copying it to a Mac. Registry propagation is retried; accepted uploads are not republished.

After the package exists, configure trusted publishing in npm's package settings:

- Provider: GitHub Actions
- User: `pponce`
- Repository: `homebridge-nest-climate-cntrl`
- Workflow filename: `npm-publish.yml`
- Allow direct publication with `npm publish`.

Run **Publish Climate Cntrl to npm** manually for an existing release tag. It downloads and verifies the tested release tarball. Ordinary pushes and GitHub release creation do not publish to npm.

## Migration checkpoint

Accfactory/Plus users follow the fresh cutover in MIGRATION.md: disable the old Nest platform, configure and pair a new Climate child bridge, verify devices, then remove the old Nest setup and rebuild affected Apple Home assignments. Do not run the experimental offline cache-ownership helper. Keep `Keep Accessories Of Uninstalled Plugins` unchanged and clean up only old Nest entries. Backups require explicit maintainer approval. Keep project files in the existing checkout. The preflight remains read-only.

