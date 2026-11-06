# Publishing Nest Climate Cntrl

The package and repository are `homebridge-nest-climate-cntrl`. Platform alias: `NestClimateCntrl`.

The first climate beta is `0.5.0-beta.1`, published with the npm `beta` tag. Do not label it `latest`.

## GitHub release

Update package.json and package-lock.json, write the exact version section in PRERELEASE_NOTES.md, and set `.github/release-version` to that version. The marker triggers release validation on main. The release workflow checks all five supported Node/Homebridge combinations, dashboard behavior and a production-only tarball installation before creating a prerelease.

Release assets include the tested npm tarball, a read-only migration preflight, a publishing/inspection helper, and SHA256SUMS. The prerelease notes must call out the platform-name change and link to MIGRATION.md.

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

Review the read-only report before deciding between cache-preserving migration and a separate beta child bridge. Backups require explicit maintainer approval. Keep all downloaded assets, reports and any approved backups in the existing project folder. No runtime files are modified by the preflight.
