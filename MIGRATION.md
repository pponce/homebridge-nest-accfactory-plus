# Migrating to Nest Accfactory Plus

Plus 0.4.4 incorporates upstream 0.4.4. It retains legacy Google refresh-token authentication.

## Identity compatibility

The npm package and registration name change to `homebridge-nest-accfactory-plus`. The platform remains `NestAccfactory`. Device UUID generation retains the original `homebridge-nest-accfactory` namespace and serial-number normalization, including externally published cameras. Homebridge can reassociate cached dynamic-platform accessories by platform name when the old plugin is absent.

Keep the same Homebridge storage, bridge username, PIN and pairing records. If using a child bridge, preserve its existing `_bridge` configuration. The keep-accessories option preserves orphaned cached accessories; it does not replace a backup or recreate deleted pairings.

## Homebridge UI migration

Wait until the Plus npm version is available before uninstalling.

1. Download a fresh backup from **Backup & Restore → Backup Now**. Keep it private. GitHub-installed plugin code is not restored automatically by a UI backup; retain your old Git installation reference as well.
2. Enable **Settings → Startup & Environment → Keep Accessories Of Uninstalled Plugins**, save and restart to apply it.
3. On the Plugins page, uninstall `homebridge-nest-accfactory`. Leave **Remove plugin config?** unchecked.
4. Install `homebridge-nest-accfactory-plus` before restarting again. For this release, select `0.4.4` if the UI offers version selection, or use:

   ```sh
   sudo hb-service add homebridge-nest-accfactory-plus@0.4.4
   ```

5. Keep the existing `NestAccfactory` configuration and accounts. Do not add a second platform or generate a new child bridge. Restart Homebridge.
6. Confirm that existing devices respond in Apple Home with their rooms, scenes and automations intact. Check camera live view, HKSV configuration and legacy authentication logs.

Do not remove accessories or the bridge in Apple Home, clear cached accessories, reset/unpair a bridge, or delete the Homebridge storage directory.

If your configuration explicitly lists the old package under a top-level `plugins` allowlist or uses `homebridge-nest-accfactory.NestAccfactory` as a qualified platform identifier, change that package reference to Plus. Ordinary configurations with `"platform": "NestAccfactory"` need no platform-name change.

## Validation and recovery

Automated tests cover legacy UUID equivalence, cached accessory/service reuse, new registration and external publication identity. A packaged-install check verifies the actual tarball loads and registers. These checks do not prove live Google authentication, physical camera behavior or preservation of an individual Apple Home installation. Verify your installation after migration.

If migration fails, retain your cache and pairing records. Stop and inspect logs before resetting anything. Restore the backup if needed and reinstall the previous package/branch. Do not run the old and Plus packages together.
