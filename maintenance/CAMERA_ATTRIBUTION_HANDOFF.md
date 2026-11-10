# Camera removal and attribution checkpoint

Objective: keep the existing Nest climate integration and pinned shared libraries,
make upstream attribution explicit, and remove unsupported camera code from source
and the distributable.

- Repository: `pponce/homebridge-nest-climate-cntrl`.
- Base: `main` at `a7095f93330cdac45dfffed07f19d5b22f83d736`.
- Work branch: `cleanup/camera-code-and-attribution`.
- Review: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/26.
- Validated code commit: `5ffe7c2b01a4cc24976f7aa4ae43fa102cac3757`.
- Release version: `0.6.2`. GitHub publication was explicitly requested after the
  cleanup review. npm publication is performed separately by the supplied script;
  no live Homebridge installation is part of this release task.

## Changes

- README ends with credits for Nest Accfactory, HomeKitDevice, HomeKitHistory,
  fetchWrapper, the history library's acknowledged research, Google RPC definitions,
  and the principal runtime dependencies.
- NOTICE and THIRD_PARTY_NOTICES.md identify the upstream foundation and fork additions.
- Build retains each bundled shared library's license and any upstream NOTICE.
  Existing author/copyright headers remain intact. Modified inherited files carry
  an explicit fork modification notice, including JSON metadata where comments
  are unavailable.
- Removed camera, doorbell, floodlight, streaming, media helpers, camera assets,
  camera-only protocol definitions and their dedicated tests. Retained shared
  Nest/Google schemas and climate/safety behavior.
- Removed camera snapshot, event and settings handlers from the platform,
  camera credential propagation, and the separate legacy camera-cookie login.
  Legacy Nest climate authentication uses the existing `/session` exchange;
  Google OAuth/JWT/session and refresh/retry behavior remain in place.
- Removed FFmpeg probing and the direct `werift` and `@evan/opus` dependencies.
- Package checks require licenses and reject camera/media paths. Protocol regression
  checks resolve retained HVAC/safety definitions and reject camera message types.

## Attribution audit

Compared inherited files against common upstream ancestor
`6ab7fc31f54c02c44d328550d79b4838048e615d` and inspected retained source headers.
That upstream tree contains LICENSE and no separate NOTICE. The three pinned
library trees also contain LICENSE and no NOTICE; the build will retain NOTICE
if a future pinned revision supplies one.

Shared libraries remain unchanged at:

- HomeKitDevice: `f2340d534e96ff5a1d48caf7df14692e53d40e56`.
- HomeKitHistory: `113789b639d15b8b20b49a7bc31eb6ba3cac07f0`.
- fetchWrapper: `7a732d44078089d820e4a21a3cf63b41fdc6983d`.

HomeKitHistory acknowledges fakegato-history protocol research and homebridge-lib
Eve type references. Their acknowledgments and license texts are retained.
HomeKitDevice uses Homebridge/HAP-NodeJS APIs and Node.js standard library facilities;
the README credits these runtime foundations separately from the library itself.
The inspected source, README and public commit history identify Mark Hulskamp as
HomeKitDevice's author. No acknowledgment of another author's predecessor
implementation was found in that inspection; this is not proof of exclusive origin.
The first public repository commit is
`3c34d3abc4b4cf097c65113fb73d994fad1b454a` (2024-10-07).
Google RPC files retain their original copyright/license headers. Camera-specific
credits stay with historical camera source; the current distribution does not
claim to use those removed implementations.

## Validation and next steps

- Local build and syntax checks pass. The final tarball contains 154 files,
  including all eight required license/notice paths and no forbidden camera/media paths.
- Compared 81 local modified/deleted/new file paths with the remote Git tree:
  all match. All three submodule pins are unchanged.
- Focused authentication, HTTP wrapper and command failure-path tests: 103 passed.
- Broad local test attempt: 822 passed; missing dependency installations prevented
  the remaining integration test files from loading. GitHub CI subsequently installed
  the dependencies and passed the full project checks on all six matrix combinations:
  Node 22 with Homebridge 1.11.4/2.4.0, Node 24 with 1.11.4/2.4.0/2.5.0,
  and Node 26 with 2.4.0. Lint, tests, coverage floors, build, migration restoration,
  and production-package installation pass in every combination.
- CI: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42902831659.
- Embedded and standalone dashboard browser checks pass. All seven CI jobs passed
  for the validated code commit above; this checkpoint update changes documentation only.
- Live Google/Nest endpoints, physical thermostats and HomeKit were not exercised.
- Release preparation updates package/lockfile versions, changelog, the release
  trigger, and stable publishing/installing helpers to `0.6.2`. The existing
  GitHub workflow gates publication on the six compatibility jobs, browser checks,
  package installation and mocked helper tests.
- GitHub release: https://github.com/pponce/homebridge-nest-climate-cntrl/releases/tag/v0.6.2.
- npm bootstrap: `maintenance/publish-0.6.2.sh`. It downloads the stable publishing
  helper from commit `acc7f2d63ea5fb95afc3b0227ad66d41152247ae`, verifies its pinned SHA-256, and invokes it. The
  helper verifies the released tarball, publishes to `latest`, and checks registry
  integrity. Login and publication use `--browser=false` for SSH use.
- PR #26 is merged. GitHub v0.6.2 is published at commit
  `acc7f2d63ea5fb95afc3b0227ad66d41152247ae`, with all eight release-workflow jobs
  successful: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/42904387642.
  The package, installer, migration preflight, publisher and SHA256SUMS assets are
  uploaded. Package SHA-256:
  `6644dd0a1d7d3832050b54e6c819f1a4ec911b992aa32c8e26ee6833c6f01b69`.
  The publisher asset digest matches the bootstrap's pinned checksum.
- Next: run `maintenance/publish-0.6.2.sh` on the publishing host, complete any npm
  web sign-in using the printed URL, and check the saved publication result. Live authentication
  and thermostat behavior remain to be exercised on a real installation.
- No direct npm publication or live installation was performed by the agent.
