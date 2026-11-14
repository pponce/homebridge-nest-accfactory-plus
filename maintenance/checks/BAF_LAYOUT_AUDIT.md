# Big Ass Fans layout audit

`baf-layout-audit.py` inventories the saved Homebridge services belonging to `homebridge-bigassfans-2`. It groups a fan with its light accessories and flags duplicated service subtypes and child accessories without a parent in the same cache. Accessory-information and protocol-information services are excluded from the visible counts.

Run the helper with Python 3 on the Homebridge host. Its default storage path is `/var/lib/homebridge`; use `--storage /path/to/homebridge` for another installation. The process needs read permission for `config.json` and the `accessories` directory. JSON is written to standard output, so it can be redirected to a report file.

By default it also attempts a bounded `GET /accessories` against the configured bridge on `127.0.0.1`. It uses the configured PIN only for that local request, bypasses proxies and refuses redirects. An unavailable or unauthorized live endpoint is recorded in the report; the helper does not change bridge access settings. Pass `--no-live` to inspect saved files only.

The helper does not write configuration, change caches, send fan commands or restart Homebridge. Reports contain accessory names, service types, selected layout options and findings. They omit PINs, account credentials, device addresses, UUIDs and raw configuration.

## Reading the report

- **Configured fan bridge** and **Main bridge cache** identify files associated with the current configuration.
- **Backup cache** contains saved recovery data. An older layout there does not establish that the bridge currently publishes it.
- **Other saved cache** belongs to a bridge not matched to the configured fan platform. Its presence alone does not prove it is active.
- **Live bridges** reports the local bridge's current accessory inventory when readable.
- Grouped light controls can be intentional for some single-light fans. Compare them with the configured layout and separate light accessories before treating them as stale.

Apple Home's private cache is not accessible from this helper. A clean current Homebridge inventory therefore cannot prove that every Home hub or client has refreshed its copy.

For a synthetic, read-only verification of the helper, run `python3 maintenance/checks/baf-layout-audit-test.py` from the repository root.
