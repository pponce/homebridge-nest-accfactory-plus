# Third-party notices

Nest Climate Cntrl is distributed under the [Apache License 2.0](LICENSE).
This document identifies inherited code, bundled source libraries, and
acknowledgments retained from those libraries. See [NOTICE](NOTICE) for the
upstream foundation and the distinction between it and this fork's additions.

| Component | Author / source | Included revision or files | License |
| --- | --- | --- | --- |
| Nest Accfactory foundation | Mark Hulskamp / n0rt0nthec4t and contributors, https://github.com/n0rt0nthec4t/homebridge-nest-accfactory | Inherited Nest/Google integration, device implementations and supporting infrastructure | Apache-2.0; `LICENSE` |
| HomeKitDevice | Mark Hulskamp / n0rt0nthec4t, https://github.com/n0rt0nthec4t/HomeKitDevice | `f2340d534e96ff5a1d48caf7df14692e53d40e56` | Apache-2.0; `dist/licenses/HomeKitDevice/LICENSE` |
| HomeKitHistory | Mark Hulskamp / n0rt0nthec4t, https://github.com/n0rt0nthec4t/HomeKitHistory | `113789b639d15b8b20b49a7bc31eb6ba3cac07f0` | Apache-2.0; `dist/licenses/HomeKitHistory/LICENSE` |
| fetchWrapper | Mark Hulskamp / n0rt0nthec4t, https://github.com/n0rt0nthec4t/fetchWrapper | `7a732d44078089d820e4a21a3cf63b41fdc6983d` | Apache-2.0; `dist/licenses/fetchWrapper/LICENSE` |
| Google RPC definitions | Google Inc. / Google LLC, https://github.com/googleapis/googleapis | `src/protobuf/google/rpc/status.proto`, `src/protobuf/google/rpc/stream_body.proto` | Apache-2.0; original copyright and license headers preserved |

The submodule source directories include their licenses. The build copies
each library's source without removing its author notices and includes its
license and any supplied `NOTICE` alongside the distribution.

## Acknowledgments retained from HomeKitHistory

HomeKitHistory credits the reverse-engineering work in
[fakegato-history](https://github.com/simont77/fakegato-history) and references
from [homebridge-lib](https://github.com/ebaauw/homebridge-lib)'s Eve HomeKit
types. These are acknowledgments from the bundled history implementation,
not additional runtime package dependencies of Nest Climate Cntrl.

- fakegato-history: MIT License, Copyright (c) 2017 simont77.
  See [license text](licenses/fakegato-history-LICENSE).
- homebridge-lib: Apache License 2.0.
  See [license text](licenses/homebridge-lib-LICENSE).

## Installed dependencies

Homebridge and the packages listed in `package.json` provide their own
licenses and attribution notices in their installed distributions. This
plugin does not replace those notices or claim authorship of those packages.
