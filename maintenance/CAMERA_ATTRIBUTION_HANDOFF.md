# Camera removal and attribution checkpoint

Objective: keep the existing Nest climate integration and pinned shared libraries,
make upstream attribution explicit, and remove unsupported camera code from source
and the distributable.

- Repository: `pponce/homebridge-nest-climate-cntrl`.
- Base: `main` at `a7095f93330cdac45dfffed07f19d5b22f83d736`.
- Work branch: `cleanup/camera-code-and-attribution`.
- Package version remains `0.6.1`. No npm publication or live installation is authorized by this cleanup.

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
Google RPC files retain their original copyright/license headers. Camera-specific
credits stay with historical camera source; the current distribution does not
claim to use those removed implementations.

## Validation and next steps

- Local build and syntax checks pass; package inspection found the required notices
  and licenses and no forbidden camera/media paths.
- Focused authentication, HTTP wrapper and command failure-path tests: 103 passed.
- Broad local test attempt: 822 passed; missing dependency installations prevented
  the remaining integration test files from loading. Full CI results are pending.
- Live Google/Nest endpoints, physical thermostats and HomeKit were not exercised.
- Next: complete GitHub CI, address failures without lowering existing coverage
  floors, and update this checkpoint with the exact results before merge/release.
- Publishing to npm requires a separate explicit user instruction.
