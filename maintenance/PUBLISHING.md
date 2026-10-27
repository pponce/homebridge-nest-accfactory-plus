# Publishing Plus

GitHub releases and npm publication are separate operations. The release workflow tests Node 22/24/26, installs the production tarball, and attaches it to a GitHub release. It runs when `.github/release-version` changes on main or when explicitly dispatched. The marker must match package.json and release notes.

For the npm publication, use your own npm account locally. Do not send npm credentials to anyone. From a clean checkout of the GitHub release tag, with submodules initialized and Node 24 installed:

```sh
npm ci
npm run check
node scripts/check-package.js
npm login
npm publish --access public --tag latest
```

Stable releases use the `latest` npm tag; prereleases use `beta`. Confirm the package name, version and npm account before publishing.

After the package exists, configure npm trusted publishing in the package settings:

- Provider: GitHub Actions
- Organization/user: `pponce`
- Repository: `homebridge-nest-accfactory-plus`
- Workflow: `npm-publish.yml`

Then run **Publish Plus to npm** from GitHub Actions on main, supplying an existing release tag. This workflow is manual only. Ordinary pushes, upstream merges and GitHub release creation do not publish to npm. Already published name/version pairs cannot be published again.

For future releases, update package.json and package-lock.json versions, add exact version release notes, then update `.github/release-version` to the same version. Review upstream submodule and Git-install pins before release.

## Keeping up with upstream

`main` is the development and future release branch for Plus, including legacy authentication support. Future upstream updates should be merged from [upstream main](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory/tree/main) through a pull request targeting **this repository's `main`**. Review conflicts, run checks, and use a merge commit so the shared history and Plus changes are retained. Do not discard this fork's commits when syncing.

When upstream changes shared submodule revisions, also review the matching revision pins in `scripts/prepare-git-install.js`.
