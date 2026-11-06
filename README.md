<p align="center"><img src="homebridge-ui/public/nest-climate-cntrl-icon-512.png" alt="Nest Climate Cntrl" width="160" height="160"></p>

# Nest Climate Cntrl

Nest Climate Cntrl brings Nest thermostats, room sensors and Heat Link controls to Apple Home, with a live dashboard inside Homebridge Settings. It is independently maintained by [pponce](https://github.com/pponce), based on [Nest Accfactory by n0rt0nthec4t and its contributors](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory).

## Supported devices

- Nest thermostats supported by the Nest/Google connection
- Nest Temperature Sensors associated with a thermostat
- Nest Heat Links, including supported hot-water controls
- Nest Protect, Home/Away and weather accessories

Cameras, doorbells, floodlight cameras and Yale locks are outside this plugin's scope. A Heat Link connects a compatible Nest thermostat to the boiler/heating system; hot-water functions depend on the installed equipment and model.

## Climate dashboard

Open **Homebridge → Plugins → Nest Climate Cntrl → Settings**. The running plugin provides live status through a local authenticated connection.

| Area | Features |
| --- | --- |
| Account | Masked credentials, account options and setup guidance |
| Thermostats | Current and target temperatures, operating state, Eco and HVAC fan actions |
| Sensors & Heat Link | Associated sensor readings, native temperature-source selection and hot-water status |
| Apple Home features | Optional Eco switches, HVAC fan presets, humidity and Eve history settings |
| Schedule | Reported weekly setpoints and next planned change in the configured time zone |
| Runtime | Observed heating/cooling totals, seven-day chart and observed coverage |
| Diagnostics | Account authorization, update connection status and redacted diagnostic summary |

Use Homebridge's **Save** button and restart the Nest bridge to apply configuration changes. Live action buttons send commands immediately. API acceptance is followed by a device-state update; it is not proof that physical equipment has started.

### Optional Apple Home controls

Set per-device `ecoSwitch` to `true` to expose an Eco switch when the thermostat reports Eco capability. Switching it off exits Eco; it does not turn the thermostat off.

Set `fanPresetSwitches` to `true` to add 15-, 30- and 60-minute fan actions on thermostats with a controllable HVAC fan. These switches reset after the command is accepted. The separate fan service reports actual running state. Presets restart the timer even when the fan is already running and do not change the configured default `fanDuration`. Both switch options are disabled by default.

HVAC fan controls operate the blower connected to Nest. They do not operate independent room or ceiling fans.

### Sensors, schedules and runtime

**Temperature controlled by** selects the thermostat's built-in sensor or one of its associated Nest sensors. Nest's own sensor schedule may subsequently change that selection. External temperature sensors and mixed-source software control are not enabled by this selector.

Set `scheduleTimeZone` to an IANA zone such as `America/Los_Angeles` to calculate the next planned weekly setpoint. Eco, holds and learning can affect actual behavior; the next setpoint is not a confirmed manual-override expiry.

Runtime starts when the plugin observes valid state. It persists across restarts, keeps up to 31 days and displays seven UTC days. Offline periods, stopped Homebridge time and gaps in observation remain unknown. Runtime measures equipment state, not energy use or historical Nest reports.

## Authentication and installation

The package identifier is `homebridge-nest-accfactory-plus` and the platform identifier remains `NestAccfactory`. Preserve these identifiers when configuring this development version. See [MIGRATION.md](MIGRATION.md) for accessory identity and pairing guidance.

Google issue-token/cookie authentication and existing compatible legacy OAuth refresh tokens are supported. Nest account access tokens remain available for supported devices. No SDM project is required. Legacy refresh tokens must already exist and remain accepted by Google; the plugin cannot generate new legacy credentials.

## Configuration

### Obtaining an **access token** for Nest Accounts

If you have a **Nest Account**, you’ll need to obtain an **access token** from the Nest web app.

1. Go to [home.nest.com](https://home.nest.com) and click **Sign in with Nest**.  
2. After logging in, open [home.nest.com/session](https://home.nest.com/session).  
3. You’ll see a JSON string similar to:  
   ```json
   {"2fa_state":"enrolled","access_token":"XXX", ...}
   ```
4. Copy the value of **access_token** near the start (a long string beginning with `b`) and paste it into your Homebridge configuration.  
   - Ignore any other `access_token` entries further down the string.

**Note:** Do **not** log out of [home.nest.com](https://home.nest.com), as this will invalidate your credentials.

### Obtaining an **issueToken and cookie token** for Google Accounts (Safari method)

For the browser-based authentication method, Google Accounts require an **"issueToken"** and **"cookie"**, which are unique to your account. You only need to do this once as long as you stay logged into your Google Account.

1. Open Safari in a **Private Window**  
2. Enable the **Develop Menu** (Safari ▸ Settings ▸ Advanced ▸ check *Show features for web developers*)  
3. Open **Develop ▸ Show Web Inspector**, then select the **Network** tab  
4. Ensure **Preserve Log** or **Preserve Requests** is checked  
5. In the filter box, type **issueToken**  
6. Go to [home.nest.com](https://home.nest.com) and click **Sign in with Google**  
7. After login, click the **iframerpc** network request  
8. In **Headers**, copy:  
   - **Summary ▸ URL** this is your **issueToken**  
   - **Request ▸ Cookie:** this is your **cookie**, which must include a key starting with **`SIDCC=`** (if `SIDCC` is missing, the cookie is incomplete and authentication will fail)
9. Enter both into your Homebridge configuration  

**Important:** Tokens **must** be obtained using **Safari**. Other browsers (Chrome, Edge, Firefox, etc.) do not reliably generate valid or non-expiring `issueToken` and `cookie` values and will often result in authentication failures or token expiry.  
If you did not use Safari, re-capture the tokens using Safari.

**Note:** Do **not** log out of [home.nest.com](https://home.nest.com), as this will invalidate your credentials.

### Using a legacy Google OAuth refresh token

Existing refresh tokens issued by the historical `homebridge-nest` login utility can be used without a browser cookie. Select **Legacy Refresh Token** in Config UI and provide the refresh token. The plugin selects the historical production or TestFlight Nest iOS OAuth client identity based on `fieldTest`; these unofficial client identities belong to Google/Nest and may stop working without notice.

Some legacy tools exported a JSON credential containing `refresh_token`. That complete JSON value can also be pasted into `refreshToken`.

This feature is only for compatible, already-issued credentials. It does not recreate the deprecated Google OAuth out-of-band enrollment flow and cannot issue a new refresh token.

Treat all of these values as passwords. Do not include them in logs, issues, or support dumps. A refresh token that has been revoked must be replaced; restarting Homebridge cannot restore it.

At startup, a refresh-token account reports `using Google refresh-token credentials` in both the authorisation and success messages. An issueToken/cookie account instead reports `using Google issueToken/cookie credentials`. Authentication methods are selected explicitly and the plugin does not fall back from a failed refresh token to cookies.

### Installing a development branch from GitHub

Git installations fetch the pinned `HomeKitDevice` and `HomeKitHistory` sources and build the required `dist` files automatically. npm removes Git metadata before running the build, so the installer obtains those sources directly instead of invoking `git submodule update`. Use a raw Git URL rather than Markdown link syntax:

```sh
sudo hb-service stop
sudo hb-service add https://github.com/pponce/homebridge-nest-accfactory-plus.git#main
sudo hb-service start
```

If replacing an earlier installation of the same branch, remove that installation first or force Homebridge to reinstall it so a cached, incomplete package is not reused.

## Account Configuration

The plugin now supports **multiple Nest and Google accounts**.

Accounts are configured using the `"accounts"` array in `config.json`.  
Each entry defines the account name, account type, and authentication tokens.

Supported account types:

- **Nest** — requires an `access_token`
- **Google** — requires both `issueToken` and `cookie`
- **Google (legacy refresh token)** — requires a compatible, already-issued `refreshToken`

Each account entry may also optionally enable `fieldTest` for testing Nest API endpoints.

## config.json configuration

When using the plugin configuration with [homebridge-config-ui-x](https://github.com/homebridge/homebridge-config-ui-x), the config.json will be updated/generated with the configuration options available via the web-form. Additional options can be specified in the config.json directly.

Sample config.json entries below
```
{
    "accounts": [
        {
            "name": "Nest",
            "type": "nest",
            "access_token": "<nest access token>",
            "fieldTest": false
        },
        {
            "name": "Google",
            "type": "google",
            "authMethod": "issueTokenCookie",
            "issueToken": "<google issue token>",
            "cookie": "<google cookie>",
            "fieldTest": false
        },
        {
            "name": "Google legacy refresh token",
            "type": "google",
            "authMethod": "refreshToken",
            "refreshToken": "<google refresh token>",
            "fieldTest": false
        }
    ],
    "options": {
        "eveHistory": true,
        "debug": false
    },
    "homes": [
        {
            "name": "Main Home",
            "elevation": 321,
            "weather": true
        }
    ],
    "devices": [
        {
            "serialNumber": "XXXXXXXX",
            "name": "XXXXX Device",
            "exclude": false
        },
        {
            "serialNumber": "YYYYYYYY",
            "name": "YYYYY Device",
            "humiditySensor": true
        }
    ],
    "platform": "NestAccfactory"
}
```

#### options

The following options are available in the `config.json` `"options"` object. These apply to all discovered devices and homes.

| Name               | Description                                                                                  | Default        |
|--------------------|----------------------------------------------------------------------------------------------|----------------|
| debug              | Enable plugin verbose logging (independent of Homebridge debug setting)                      | false          |
| elevation          | Height above sea level for weather station(s)                                                | 0              |
| eveHistory         | Provide history in EveHome application where applicable                                      | true           |
| exclude            | Exclude all device(s)                                                                        | false          |
| ffmpegDebug        | Enable additional debugging output when ffmpeg is invoked                                    | false          |
| ffmpegHWaccel      | Enable video hardware acceleration for camera(s) and doorbell(s) where supported             | false          |
| ffmpegPath         | Path to the ffmpeg binary, directory containing ffmpeg, or command name available in system PATH | ffmpeg |
| ffmpegTranscode    | Enable video transcoding for camera(s) and doorbell(s) (higher CPU usage)                    | false          |
| logMotionEvents    | Enable logging of motion events for camera(s), doorbell(s) and Nest Protect device(s)        | true           |
| maxStreams         | Maximum simultaneous live view streams per camera (integer from 1 to 4)                       | 2              |
| supportDump        | Enable redacted Nest/Google API support dumps and streaming diagnostics                      | false          |

API support-dump blocks redact credentials, personal details, network addresses and camera URLs. Device and home identifiers use consistent aliases within a plugin run. Collection and output are bounded; empty delta updates produce no dump. Normal plugin logs and streaming debug messages can still contain device names and identifiers.

#### devices

Device-specific configuration can be applied using the `"devices"` array. Each entry represents **per-device settings** that are applied when a device with the matching `"serialNumber"` is discovered.


The **Device Settings** section in the Homebridge GUI provides basic management of these entries. However, **not all device options are exposed in the GUI**, and some advanced options may need to be configured directly in `config.json`.

Devices are identified using their **serial number**, which must match the value reported by the Nest or Google API. This value is **case-sensitive and must be in uppercase**.

The `"name"` field is optional and is only used to help identify the entry in the configuration. It does **not** rename the device in HomeKit.

| Name               | Description                                                                                  | Default |
|--------------------|----------------------------------------------------------------------------------------------|---------|
| doorbellCooldown   | Time between doorbell press events                                                           | 60s     |
| eveHistory         | Provide history in the EveHome application where applicable for this device                  | true    |
| exclude            | Exclude this device                                                                          | false   |
| fanDuration        | Fan runtime duration                                                                         |         |
| ffmpegDebug        | Enable additional debugging output when ffmpeg is invoked                                    | false   |
| ffmpegHWaccel      | Enable video hardware acceleration for camera(s) and doorbell(s) where supported             | false   |
| ffmpegTranscode    | Enable video transcoding for camera(s) and doorbell(s) (higher CPU usage)                    | false   |
| hotwaterBoostTime  | Duration for hot water boost heating (30, 60, 120 mins)                                      | 30mins  |
| hotwaterMaxTemp    | Maximum supported temperature for hot water heating                                          | 70c     |
| hotwaterMinTemp    | Minimum supported temperature for hot water heating                                          | 30c     |
| humiditySensor     | Enable a separate humidity sensor for thermostat(s) where supported                          | false   |
| ignoreIndoorChime  | Allow HomeKit doorbell rings when the indoor chime is disabled                               | false   |
| logMotionEvents    | Enable logging of motion events for camera(s), doorbell(s) and Nest Protect device(s)        | true    |
| motionCooldown     | Time between detected motion events                                                          | 60s     |
| name               | Optional label to help identify this device entry                                            |         |
| serialNumber       | Device serial number this configuration applies to                                           |         |

By default, HomeKit doorbell rings respect the indoor chime setting in Nest/Google Home: disabling the indoor
notifications and Apple TV doorbell alerts while the physical chime is disabled, for example when using
Google Home speakers as your chime. This option does not change the physical chime setting.

and Quiet Time in Nest/Google Home. The plugin no longer exposes a chime or Quiet Time switch; remove any
old `chimeSwitch`, `quietTimeSwitch` and `quietTimeDuration` options from your device configuration.

#### homes

Home settings are configured using the `"homes"` array in `config.json` or via the GUI **Home Settings** section.

Each entry in the `"homes"` array applies settings to a specific Nest or Google Home.

Homes are identified using the `"name"` field, which must match the Home name shown in the Nest or Google Home app. This match is **case-sensitive**.

| Name               | Description                                                                                  | Default        |
|--------------------|----------------------------------------------------------------------------------------------|----------------|
| elevation          | Height above sea level for the weather station                                               | 0              |
| name               | Name of home (from Nest/Google App) to which these settings belong to                        |                |
| weather            | Virtual weather station for this Home                                                        | false          |


## Development and verification

Run `npm ci`, then `npm run check` for lint, regression tests, coverage and build validation. Device commands and HVAC behavior also require testing on supported hardware.

## Support Policy

This plugin is developed and tested specifically for **Homebridge**.

Supported environments include Homebridge installations running on common platforms such as Linux or macOS, as well as official container or image distributions such as **docker-homebridge**, **homebridge-vm-image**, and **homebridge-raspbian-image**.

Platforms that bundle, modify, or wrap Homebridge — such as **HOOBS**, **Home Assistant**, or similar derivatives are **not officially supported** and may behave differently. Issues reported from these environments may be closed without investigation.

If you encounter a problem, please [raise an issue](https://github.com/pponce/homebridge-nest-accfactory-plus/issues) on the project's **GitHub repository**.

When reporting an issue, providing relevant diagnostic information (logs, configuration snippets, device details, etc.) and being available to assist with follow-up testing is greatly appreciated. Issues reported without sufficient detail may be difficult to investigate.

Feature requests and enhancements are welcome, but please keep in mind that this is a personal open-source project maintained in spare time.

## Disclaimer

This is a personal hobby project provided **"as-is"**, with no warranty whatsoever, express or implied, including but not limited to warranties of merchantability or fitness for a particular purpose.

Building and running this project is done entirely at your own risk.

I am not affiliated with any companies such as Google, Apple, or other related entities. The author of this project shall not be held liable for any damages or issues arising from its use.

If you find this project useful, consider supporting upstream author **n0rt0nthec4t** through [GitHub Sponsors](https://github.com/sponsors/n0rt0nthec4t) or [Buy Me a Coffee](https://buymeacoffee.com/n0rt0nthec4t).


