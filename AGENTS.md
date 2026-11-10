<!-- Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE. -->
# homebridge-nest-climate-cntrl — Agent Instructions

Apply pragmatic engineering principles: preserve compatibility, keep changes focused, validate failure paths, and test behavior. The external core-engineering-principles skill is optional.

This file contains project-specific architecture, compatibility, and implementation requirements. These instructions take precedence where they intentionally narrow or override a general rule from the core skill.

## Project

`homebridge-nest-climate-cntrl` extends the Nest Accfactory foundation with climate automation through Homebridge.

Supported device families include thermostats, Heat Links, Nest Protect,
temperature sensors, and Home/Away accessories. Climate rules coordinate
Homebridge temperature sensors, fans and presence sources.

Cameras, doorbells, floodlight cameras, video streaming and HKSV are outside
this plugin's scope. Do not add camera modules, media assets or dependencies
to its source or distribution. Shared Nest/Google schemas needed by climate
devices must retain compatible field definitions.

The project integrates with both Nest and Google APIs. Some devices may be represented by both sources.

Preserve existing device support and compatibility unless a change intentionally modifies it.

## Runtime and Homebridge Support

- Minimum Node.js version is **22**.
- Node.js **22 and 24** are supported production runtimes.
- Node.js **26** support is conditional on the supported Homebridge version.
- Use the Homebridge compatibility ranges declared by the project as authoritative.
- Preserve Homebridge 1.x compatibility where currently supported.
- Do not assume Homebridge 2.x APIs are universally available.

## Documentation and JSDoc

Do not add new JSDoc solely because a function, class, method, parameter, or object shape is undocumented.

Preserve and update existing JSDoc when a code change makes it inaccurate.

Add new JSDoc only when:

- the requested task specifically includes documentation;
- a new public or shared API requires a documented contract; or
- the surrounding code already uses JSDoc consistently and the new code forms part of that documented interface.

Do not expand the scope of a bug fix, review, or refactor by adding JSDoc to existing unrelated code.

Do not add JSDoc merely to satisfy the general documentation guidance in `core-engineering-principles`.

Use normal comments for non-obvious implementation reasoning, protocol behaviour, lifecycle decisions, compatibility requirements, workarounds, and failure-handling behaviour.

## HomeKitDevice

`HomeKitDevice` provides the shared accessory lifecycle and HomeKit abstraction used by this project.

Changes affecting it can impact many device types and runtime environments.

When changing its integration or callers, consider:

- Homebridge HAP;
- standalone HAP-NodeJS where supported;
- optional Homebridge Matter;
- cached Homebridge accessories;
- accessory registration and removal;
- persistence;
- lifecycle messages including `ADD`, `UPDATE`, `REMOVE`, and `SHUTDOWN`; and
- existing accessory identity.

Avoid changes that unnecessarily recreate existing HomeKit accessories.

Fix genuinely shared lifecycle behaviour in `HomeKitDevice` rather than adding equivalent workarounds to individual device plugins.

Keep device-specific behaviour out of `HomeKitDevice`.

## Nest and Google APIs

The same physical device may be represented through both Nest and Google data sources.

Where both sources are available:

- preserve the established preference for Google data where applicable;
- do not assume equivalent Nest and Google properties have identical schemas or semantics;
- normalise equivalent states at an appropriate shared boundary;
- retain source-specific handling where behaviour genuinely differs; and
- preserve required fallback behaviour.

Nest REST and Google Observe/gRPC connection behaviour is long-running infrastructure.

Preserve established authentication refresh, retry, backoff, reconnect, and shutdown semantics unless the change specifically addresses them.

Do not remove a Nest fallback solely because an equivalent Google data source currently exists without first establishing that the fallback is no longer required by supported devices or accounts.

## Native HomeKit Functionality

Follow the [native HomeKit functionality policy in CONTRIBUTING.md](CONTRIBUTING.md#native-homekit-functionality) when implementing or reviewing device functionality.

Only expose device functionality through HomeKit services and characteristics that accurately represent its purpose. Prefer standard HomeKit representations; custom characteristics may be considered where they provide a meaningful and accurate representation of device-specific functionality.

Optional thermostat Eco switches and momentary HVAC fan-preset switches are explicitly supported in this fork. Keep them disabled by default and label their purpose accurately. Do not create unrelated outlets or lights to represent climate controls. Do not repurpose standard HomeKit characteristics or their defined values to represent unrelated device functionality.

Where no appropriate HomeKit representation exists, do not expose the functionality through an unrelated service or characteristic. Additional representations require an explicit product decision and capability validation.

Treat this as an intentional project design constraint, not a missing feature to work around.

## Device Plugins

Device plugins own interpretation and behaviour specific to their Nest/Google device type.

Preserve existing HomeKit service and characteristic identity where possible.

Do not recreate services merely to update their state.

Optional services should appear or disappear according to actual device capability and configuration.

Do not expose a HomeKit control when the underlying device does not genuinely support that operation.

Device-specific workarounds should remain within the relevant device implementation unless evidence establishes that the behaviour is genuinely shared.

## Configuration

Preserve existing configuration compatibility unless a breaking change is explicitly intended.

The project supports:

- plugin-level options;
- account configuration;
- per-home configuration;
- device configuration; and
- per-device overrides.

Do not silently change the meaning or default of an existing option.

Prefer reliable automatic detection over introducing another configuration option.

Configuration changes exposed through the Homebridge UI must remain consistent with the underlying configuration schema and documented behaviour.

## Logging and Support Dumps

Normal logs should remain useful without being dominated by expected camera, network, polling, or lifecycle behaviour.

Detailed streaming and protocol diagnostics belong in debug logging or support dumps where appropriate.

Support-dump collection must remain bounded and should not add significant background processing when disabled.

Never expose Nest/Google authentication credentials, cookies, OAuth tokens, or other secrets in logs or support dumps.

When suppressing expected errors or warnings, preserve visibility of unexpected variants that may indicate a real failure.

## Project Documentation

The main plugin uses:

- `CHANGELOG.md` for consolidated release notes; and
- `PRERELEASE_NOTES.md` for changes specific to individual alpha and beta releases.

Pre-release notes are not cumulative.

When preparing a final release, consolidate meaningful pre-release outcomes into `CHANGELOG.md` rather than copying the complete pre-release history.

Shared modules such as `HomeKitDevice` may maintain their own code-date-oriented changelog.

Follow the changelog and code-date rules from `core-engineering-principles` when updating these files.

## Repository-Specific Verification

Use the project's existing test, lint, coverage, and validation scripts.

Package checks must verify that camera/media code is absent and bundled library licenses are present.

Changes to shared `HomeKitDevice` behaviour should consider regression coverage across its lifecycle and supported HAP execution environments where relevant.

Changes to Nest/Google data processing should consider both data sources when the affected behaviour can originate from either source.

Hardware-specific behaviour that cannot be exercised locally must be identified as not hardware-verified rather than inferred from unit tests.

Do not treat successful unit tests as evidence that Google/Nest backend behaviour or physical HomeKit devices have been verified.


