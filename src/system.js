// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
// Overall system communications and device management
// Part of homebridge-nest-accfactory
//
// Core platform manager for coordinating Nest/Google cloud data with
// HomeKit device modules.
//
// Handles platform startup/shutdown, device discovery, raw data aggregation,
// protobuf-backed observe/subscribe processing, and
// routing of updates and commands between cloud APIs and HomeKit devices.
//
// Responsibilities:
// - Initialise validated configuration and device support modules
// - Build and start configured Nest/Google account connections
// - Observe and subscribe to cloud updates in near real-time
// - Aggregate and maintain raw device data from multiple API sources
// - Discover, create, update, and remove supported device instances
// - Route HomeKit get/set requests to the correct upstream API
// - Build protobuf-backed observe trait subscriptions
// - Generate support dumps for troubleshooting when enabled
//
// Features:
// - Multi-account support through the Connections module
// - Nest REST API subscribe loop and Google protobuf observe loop
// - Shared protobuf schema/type caching via protobuf.js helpers
// - Raw data merging across Nest and Google sources
// - Dynamic device module loading and HomeKit category selection
//
// Notes:
// - Account authorisation, token refresh, retry handling, and connection cleanup are handled by connections.js
// - HomeKit characteristic and service management is handled by individual device modules
// - Thermostat, sensor and other supported device behaviour is implemented in device-specific modules
//
// Architecture:
// - Exports the main NestAccfactory platform class
// - Maintains raw data cache and tracked HomeKit device instances
// - Uses Connections for account/session state and gRPC transport ownership
// - Uses shared protobuf helpers for schema/type loading and traversal
// - Creates and updates HomeKitDevice-based instances for supported device types
//
// Code version 2026.11.10
// Mark Hulskamp
'use strict';

// Define nodejs module requirements
import { setTimeout, clearTimeout } from 'node:timers';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import os from 'node:os';
import { URL } from 'node:url';

// Import our modules
import HomeKitDevice from './HomeKitDevice.js';
import Connections from './connections.js';
import GrpcTransport from './grpctransport.js';
import { loadDeviceModules, getDeviceHKCategory } from './devices.js';
import { processConfig } from './config.js';
import { fetchWrapper } from './fetchWrapper.js';
import { adjustTemperature } from './utils.js';
import { getProtoTypes } from './protobuf.js';
import { createSupportDump } from './supportdump.js';
import { ClimateDashboard } from './climate-dashboard.js';
import { WebDashboard } from './web-dashboard.js';
import { ClimateAutomation } from './climate-automation.js';
import { ClimatePresence } from './climate-presence.js';
import { rememberCachedIdentity } from './identity.js';
import { sensorControlUpdate } from './nest-sensor-control.js';

// Define constants
import {
  MIN_NODE_VERSION,
  USER_AGENT,
  __dirname,
  DATA_SOURCE,
  DEVICE_TYPE,
  NEST_API_BUCKETS,
} from './consts.js';

const API_STREAM_LOOP_INTERVAL = 1000; // Normal subscribe/observe loop restart delay
const API_STREAM_RETRY_INITIAL = 5000; // Initial retry delay after subscribe/observe failure
const API_STREAM_RETRY_MAX = 60000; // Maximum retry delay during API outage/failure

// We handle the connections to Nest/Google
// Perform device management (additions/removals/updates)
export default class NestAccfactory {
  dashboard = undefined;
  webDashboard = undefined;
  cachedAccessories = []; // Track restored cached accessories
  presenceAccessories = [];
  climateWrites = new Map();

  // Internal data only for this class
  #connections = undefined; // Connections manager
  #rawData = {}; // Cached copy of data from both Nest and Google APIs
  #trackedDevices = new Map(); // Devices we've created, keyed by serial number
  #deviceModules = undefined; // No loaded device support modules to start
  #supportDumpWriter = undefined; // Diagnostic writer and aliases, created only when enabled
  #starting;
  #shutdown;
  #stopping = false;

  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    // Set the shared HomeKitDevice module logger so device modules don't need it passed in.
    HomeKitDevice.LOGGER = log;

    // Validate required version of Node.js that we're running on.
    // If less than our minimum required version, log an error and stop initialisation
    let nodeVersion = Number(process.versions.node.split('.')[0]);

    if (nodeVersion < MIN_NODE_VERSION) {
      this.log.error(
        'We no longer support running on Node.js %s. Please upgrade to Node.js %s or newer. The plugin will not be started.',
        process.versions.node,
        MIN_NODE_VERSION,
      );
      return;
    }

    // Output some basic info about the plugin starting up, which can be useful for troubleshooting
    if (config?.options?.debug === true) {
      log?.warn?.('Verbose logging enabled via configuration');
    }

    // Output some debug info about the system we're running on, which can be useful for troubleshooting
    this?.log?.debug?.('System: %s %s (%s)', os.platform(), os.release(), os.arch());
    this?.log?.debug?.('CPU: %s (%d cores)', os.cpus()?.[0]?.model, os.cpus()?.length);
    this?.log?.debug?.('Memory: %d MB total', Math.round(os.totalmem() / 1024 / 1024));
    this?.log?.debug?.('Node.js: v%s', process.versions.node);

    // Perform validation on the configuration passed into us and set defaults if not present
    try {
      this.config = processConfig(config, this.log, this.api);
    } catch {
      this.log?.error?.('Nest Climate Cntrl configuration could not be loaded. Check the plugin Settings. The plugin is inactive.');
      return;
    }
    if (!this.config) {
      return;
    }

    // Homebridge events do not consume rejected promises. Each lifecycle operation handles its own failures.
    api?.on?.('didFinishLaunching', () => {
      if (this.#stopping) {
        return Promise.resolve();
      }
      this.#starting ??= this.#start().catch(async () => {
        this.log?.error?.(
          'Nest Climate Cntrl could not start. Check the plugin configuration and storage permissions, then restart the bridge.',
        );
        await this.#stop();
      });
      return this.#starting;
    });
    api?.on?.('shutdown', () => {
      this.#stopping = true;
      this.#shutdown ??= (async () => {
        await this.#starting;
        await this.#stop();
      })();
      return this.#shutdown;
    });
  }

  async #start() {
    // Building account entries performs no I/O. Do not create listeners, files, timers or devices without a usable account.
    this.#connections = this.#createConnections();
    if (this.#connections.size === 0) {
      this.log?.error?.(
        'No active connections are configured. Add an account in Menu → Accounts & web access, then restart the bridge.',
      );
      return;
    }
    this.#deviceModules = await loadDeviceModules(this.log, 'plugins', [
      'thermostat.js',
      'tempsensor.js',
      'heatlink.js',
      'homeaway.js',
      'protect.js',
    ]);
    if (this.#stopping) {
      return;
    }

    try {
      if (typeof this.api?.user?.storagePath === 'function') {
        this.dashboard = new ClimateDashboard(this.api.user.storagePath(), {
          accounts: () =>
            [...this.#connections.entries()].map(([id, account]) => ({
              id,
              name: account.name,
              authorised: account.authorised === true,
              authMethod: account.authMethod ?? account.type,
              observing: account.climateObserving === true,
              lastUpdate: account.climateLastUpdate ?? null,
            })),
          command: (id, values, origin) => this.#set(this.#rawData?.[id]?.connection, id, values, origin),
          log: this.log,
        });
        await this.dashboard.start();
        if (this.#stopping) {
          return;
        }
        if (typeof this.api?.user?.configPath === 'function') {
          this.webDashboard = new WebDashboard({
            storage: this.api.user.storagePath(),
            configPath: this.api.user.configPath(),
            platformConfig: this.config,
            dashboard: this.dashboard,
            log: this.log,
          });
          this.dashboard.webDashboard = this.webDashboard;
          await this.webDashboard.start();
          if (this.#stopping) {
            return;
          }
          this.automation = new ClimateAutomation({
            directory: this.webDashboard.directory,
            dashboard: this.dashboard,
            config: this.webDashboard.config,
            onState: () => {
              for (const tracked of this.#trackedDevices.values()) {
                tracked.device?.updateClimateRoom?.();
              }
            },
            presence: new ClimatePresence(this.api, this.presenceAccessories, this.config?._bridge?.username ?? 'main'),
            log: this.log,
          });
          await this.automation.start();
        }
      }
    } catch {
      this.log?.warn?.(
        'Climate services could not start. Check plugin storage and dashboard settings. Native thermostat controls remain available.',
      );
      await this.#stopClimateServices();
    }

    if (!this.#stopping) {
      for (let [uuid] of this.#connections.entries()) {
        await this.#connections.start(uuid);
      }
    }
  }

  async #stopClimateServices() {
    for (const [name, service] of [
      ['automation', this.automation], ['web dashboard', this.webDashboard], ['configuration dashboard', this.dashboard],
    ]) {
      try {
        await service?.stop();
      } catch {
        this.log?.warn?.('Climate %s could not finish shutdown. Check equipment state and the plugin storage permissions.', name);
      }
    }
    this.automation = undefined;
    this.webDashboard = undefined;
    this.dashboard = undefined;
  }

  async #stop() {
    await this.#stopClimateServices();
    try {
      await this.#connections?.shutdown?.();
    } catch {
      this.log?.warn?.('Nest connections could not finish shutdown.');
    }
    this.#trackedDevices.clear();
    this.#rawData = {};
    this.#supportDumpWriter = undefined;
    this.#connections = undefined;
    this.#deviceModules?.clear?.();
    this.cachedAccessories = [];
  }

  configureAccessory(accessory) {
    if (!this.config) {
      return;
    }
    try {
      this.#restoreAccessory(accessory);
    } catch {
      this.log?.warn?.('A cached Nest accessory could not be restored. Check the accessory configuration and restart the bridge.');
    }
  }

  #restoreAccessory(accessory) {
    if (accessory?.context?.climatePresence === true) {
      this.presenceAccessories.push(accessory);
      return;
    }
    const removedTypes = ['CameraRTPStreamManagement', 'Doorbell', 'LockMechanism']
      .map((name) => this.api?.hap?.Service?.[name]?.UUID)
      .filter(Boolean);
    if (accessory?.services?.some((service) => removedTypes.includes(service.UUID))) {
      this.api.unregisterPlatformAccessories(HomeKitDevice.PLUGIN_NAME, HomeKitDevice.PLATFORM_NAME, [accessory]);
      return;
    }
    // This gets called from Homebridge each time it restores an accessory from its cache
    this?.log?.info?.('Loading accessory from cache:', accessory.displayName);

    let informationService = accessory?.getService?.(this.api.hap.Service.AccessoryInformation);
    if (informationService === undefined) {
      // Accessory is missing the required AccessoryInformation service
      // means it's not going to work and is likely a stale entry in the cache. Remove it and log an error.
      this?.log?.warn?.('Cached accessory "%s" is missing AccessoryInformation service. Removing from cache', accessory.displayName);

      try {
        this.api.unregisterPlatformAccessories(HomeKitDevice.PLUGIN_NAME, HomeKitDevice.PLATFORM_NAME, [accessory]);
        // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // Empty
      }

      return;
    }

    // Accessory has the required AccessoryInformation service, so we can add the restored accessory to the accessories cache
    // This allows us to track if it has already been registered
    rememberCachedIdentity(this.api, accessory.UUID);
    this.cachedAccessories.push(accessory);
  }

  #createConnections() {
    return Connections.fromConfig(this.config, {
      log: this.log,
      onAuthorised: async (uuid, connection, details = {}) => {
        // Initial authorisation/re-authorisation should start ingestion loops.
        // Token refreshes keep existing loops running.
        if (details?.wasAuthorised !== true) {
          this.#subscribeNestAPI(uuid).catch((error) => {
            this?.log?.debug?.(
              'Unable to start Nest API subscribe for connection "%s": %s',
              connection?.name,
              typeof error?.message === 'string' ? error.message : String(error),
            );
          });
          this.#observeGoogleAPI(uuid).catch((error) => {
            this?.log?.debug?.(
              'Unable to start Google API observe for connection "%s": %s',
              connection?.name,
              typeof error?.message === 'string' ? error.message : String(error),
            );
          });
        }
      },
    });
  }

  async #subscribeNestAPI(uuid, firstRun = true, fullRead = true) {
    let connection = this.#connections?.get(uuid);
    let subscribeFailed = false;

    if (
      typeof connection !== 'object' ||
      connection === null ||
      connection.authorised !== true ||
      this.config?.options?.useNestAPI !== true
    ) {
      // Not a valid connection object and/or we're not authorised
      return;
    }

    // By default, setup for a full data read from the Nest API
    let subscribeJSONData = undefined;
    if (firstRun !== false || fullRead !== false) {
      this?.log?.debug?.('Starting Nest API subscribe for connection "%s"', connection.name);
      subscribeJSONData = { known_bucket_types: NEST_API_BUCKETS, known_bucket_versions: [] };
    }

    // We have data stored from this Nest API, so setup read using known object
    // We exclude any data source other than from Nest API and also any injected data
    if (firstRun === false && fullRead === false) {
      subscribeJSONData = { objects: [] };
      subscribeJSONData.objects.push(
        ...Object.entries(this.#rawData)
          .filter(
            ([key, value]) =>
              value.source === DATA_SOURCE.NEST &&
              value.connection === uuid &&
              value?.injected !== true &&
              NEST_API_BUCKETS.includes(key.split('.')[0]) === true,
          )
          .map(([key, value]) => ({
            object_key: key,
            object_revision: value.object_revision,
            object_timestamp: value.object_timestamp,
          })),
      );
    }

    fetchWrapper(
      'post',
      subscribeJSONData?.objects !== undefined
        ? new URL('/v5/subscribe', connection.transport_url).href
        : new URL('/api/0.1/user/' + connection.userID + '/app_launch', 'https://' + connection.restAPIHost).href,
      {
        headers: {
          Referer: 'https://' + connection.referer,
          Origin: 'https://' + connection.referer,
          Authorization: 'Basic ' + connection.token,
          Connection: 'keep-alive',
          'User-Agent': USER_AGENT,
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-nl-protocol-version': 1,
          'Content-Type': 'application/json',
        },
        retry: 3,
      },
      subscribeJSONData,
    )
      .then((response) => response.json())
      .then(async (data) => {
        let changedData = new Map(); // Map of objectKey to { fields: Set(...) }
        let objects = [];

        if (Array.isArray(data?.updated_buckets) === true) {
          // Full data read response
          objects = data.updated_buckets;
        }

        if (Array.isArray(data?.objects) === true) {
          // Incremental subscribe update response
          objects = data.objects;
        }

        // Process the data we received
        fullRead = false; // Reset full refresh flag unless triggered below

        for (let object of objects) {
          let objectKey = object?.object_key;
          // The server may return unrequested buckets; keep them out of the cache and later subscriptions.
          if (typeof objectKey !== 'string' || NEST_API_BUCKETS.includes(objectKey.split('.')[0]) !== true) {
            continue;
          }
          let incomingValue = typeof object?.value === 'object' && object.value !== null ? { ...object.value } : {};
          let existingEntry = this.#rawData?.[objectKey];
          let existingValue = typeof existingEntry?.value === 'object' && existingEntry.value !== null ? existingEntry.value : {};
          let changedFields = new Set();

          if ((objectKey?.trim?.() ?? '') === '') {
            continue;
          }

          // Detect changed top-level raw fields using shallow comparison.
          // This is intentional:
          // - nested objects/arrays are treated as changed if their reference differs
          // - avoids expensive deep comparison during frequent Nest API updates
          // - HomeKitDevice performs a deeper comparison later on the final merged device data
          //
          // NOTE: This may over-report changes for complex values, but that is acceptable here
          // because this change set is only used to guide downstream processing.
          Object.keys(incomingValue).forEach((field) => {
            if (existingValue[field] !== incomingValue[field]) {
              changedFields.add(field);
            }
          });

          if (objectKey.startsWith('structure.') === true) {
            // Detect removed child objects from the swarm list and clean up local cache
            if (typeof existingValue?.swarm === 'object' && Array.isArray(incomingValue?.swarm) === true) {
              let newSwarmSet = new Set(incomingValue.swarm);

              existingValue.swarm.forEach((childObjectKey) => {
                if (newSwarmSet.has(childObjectKey) === false) {
                  delete this.#rawData[childObjectKey];
                }
              });
            }

            // Store the internal Nest structure uuid if matched to a configured home
            Object.assign(
              this.config?.homes?.find((home) => home?.name?.trim?.().toUpperCase() === incomingValue?.name?.trim?.().toUpperCase()) || {},
              { nest_home_uuid: objectKey },
            );
          }

          if (objectKey.startsWith('buckets.') === true) {
            if (
              typeof existingEntry === 'object' &&
              Array.isArray(existingValue?.buckets) === true &&
              Array.isArray(incomingValue?.buckets) === true
            ) {
              // Compare previous vs incoming buckets list to detect topology changes
              let newBucketsSet = new Set(incomingValue.buckets);

              // Missing objects trigger a full refresh and are removed from local state immediately.
              for (let childObjectKey of existingValue.buckets) {
                if (newBucketsSet.has(childObjectKey) === false) {
                  fullRead = true;

                  // Object existed previously but is no longer referenced, so treat as removed
                  if (
                    childObjectKey.startsWith('structure.') === true ||
                    childObjectKey.startsWith('topaz.') === true ||
                    childObjectKey.startsWith('quartz.') === true
                  ) {
                    let serialNumber = this.#rawData?.[childObjectKey]?.value?.serial_number;
                    let trackedDevice = this.#trackedDevices.get(serialNumber);

                    if (trackedDevice !== undefined) {
                      // Send removed notice onto HomeKit device for it to process
                      await HomeKitDevice.message(trackedDevice.uuid, HomeKitDevice.REMOVE, {});

                      // Finally, remove from tracked devices
                      this.dashboard?.remove(serialNumber);
                      this.#trackedDevices.delete(serialNumber);
                    }
                  }

                  delete this.#rawData[childObjectKey];
                }
              }
            }
          }

          // Only record this object if at least one field changed
          if (changedFields.size !== 0) {
            changedData.set(objectKey, { fields: changedFields });
          }

          // Merge incoming data into the raw data store
          this.#rawData[objectKey] = {
            object_revision: object.object_revision,
            object_timestamp: object.object_timestamp,
            connection: uuid,
            source: DATA_SOURCE.NEST,
            value: {
              ...existingValue,
              ...incomingValue,
            },
          };
        }

        await this.#processData(uuid, changedData);

        connection.subscribeRetryDelay = undefined;
      })
      .catch((error) => {
        subscribeFailed = true;

        // Attempt to extract HTTP status code from error cause or error object
        let statusCode =
          error?.code !== undefined && error?.code !== null
            ? error.code
            : error?.status !== undefined && error?.status !== null
              ? error.status
              : undefined;

        // If we get a 401 Unauthorized or 403 Forbidden, wake the connection
        // lifecycle so it can re-authorise and reschedule itself.
        if ((statusCode === 401 || statusCode === 403) && connection.authorised === true) {
          this?.log?.debug?.('Connection "%s" is no longer authorised with the Nest API, will attempt to reconnect', connection.name);
          this.#connections?.markUnauthorised?.(uuid, 'nest-api-' + statusCode);
          return;
        }

        // Log unexpected errors (excluding timeouts) for debugging
        if (
          error?.cause === undefined ||
          (error.cause?.message?.toUpperCase?.()?.includes('TIMEOUT') === false &&
            error.cause?.code?.toUpperCase?.()?.includes('TIMEOUT') === false)
        ) {
          this?.log?.debug?.(
            'Nest API had an error performing subscription with connection "%s". Error was "%s"',
            connection.name,
            typeof error?.message === 'string' ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        // Only continue the subscription loop if this exact connection is still active and authorised.
        if (this.#connections?.get(uuid) === connection && connection.authorised === true) {
          let subscribeDelay = API_STREAM_LOOP_INTERVAL;

          if (subscribeFailed === true) {
            subscribeDelay =
              Number.isFinite(connection.subscribeRetryDelay) === true && connection.subscribeRetryDelay > 0
                ? Math.min(connection.subscribeRetryDelay * 2, API_STREAM_RETRY_MAX)
                : API_STREAM_RETRY_INITIAL;

            connection.subscribeRetryDelay = subscribeDelay;
          }

          clearTimeout(connection.subscribeTimer);
          connection.subscribeTimer = setTimeout(() => this.#subscribeNestAPI(uuid, false, fullRead), subscribeDelay);
        }
      });
  }

  async #observeGoogleAPI(uuid) {
    let connection = this.#connections?.get(uuid);
    let observeFailed = false;

    if (
      typeof connection !== 'object' ||
      connection === null ||
      connection.authorised !== true ||
      connection.grpcTransport === undefined ||
      this.config?.options?.useGoogleAPI !== true
    ) {
      // Not a valid connection object and/or we're not authorised
      return;
    }

    // Dynamically build the 'observe' post body data from cached protobuf message types
    let observeTraitsList = getProtoTypes(path.join(__dirname, 'protobuf/root.proto'), this.log)
      .filter((type) => type.fullName.startsWith('.nest.trait') || type.fullName.startsWith('.weave.'))
      .map((type) => ({
        traitType: type.fullName.replace(/^\.*|\.*$/g, ''),
      }));

    // Dedupe the observe traits list since there can be some overlap in the traits
    // due to the dynamic nature of the protobuf loading and trait type matching
    observeTraitsList = [...new Map(observeTraitsList.map((entry) => [entry.traitType, entry])).values()];

    // If protobuf support is unavailable or no observable traits were found,
    // do not start the observe loop. Retrying every second would only create
    // noise until the underlying protobuf load problem is fixed.
    if (observeTraitsList.length === 0) {
      this?.log?.warn?.(
        'Google API observe cannot start for connection "%s" because no observable protobuf traits were loaded',
        connection.name,
      );
      return;
    }

    let grpcTransport = connection.grpcTransport;
    grpcTransport
      .observe(
        'nestlabs.gateway.v2.',
        'GatewayService',
        'Observe',
        { stateTypes: ['CONFIRMED', 'ACCEPTED'], traitTypeParams: observeTraitsList },
        async (message) => {
          // A released Observe stream can still finish a queued callback.
          // Only the active account transport may mutate the cache or remove accessories.
          if (this.#connections?.get(uuid) !== connection || connection.grpcTransport !== grpcTransport || connection.authorised !== true) {
            return;
          }

          connection.climateObserving = true;
          connection.climateLastUpdate = Date.now();
          let observeResponses = Array.isArray(message?.observeResponse) === true ? message.observeResponse : [message].filter(Boolean);
          let changedData = new Map(); // Map of resourceId to { fields: Set(...) } for processing after the loop

          // We'll use the resource status message to look for structure and/or device removals
          // We could also check for structure and/or device additions here, but we'll want to be flagged
          // that a device is 'ready' for use before we add in. This data is populated in the trait data
          for (let observeResponse of observeResponses) {
            // resourceMetas
            if (Array.isArray(observeResponse?.resourceMetas) === true) {
              for (let resource of observeResponse.resourceMetas) {
                if (
                  resource.status === 'REMOVED' &&
                  (resource.resourceId.startsWith('STRUCTURE_') === true || resource.resourceId.startsWith('DEVICE_') === true)
                ) {
                  // We have the removal of a 'home' and/or device
                  // Tidy up tracked devices since this one is removed
                  let serialNumber = this.#rawData?.[resource.resourceId]?.value?.device_identity?.serialNumber;
                  let trackedDevice = this.#trackedDevices.get(serialNumber);

                  if (trackedDevice !== undefined) {
                    // Send removed notice onto HomeKit device for it to process
                    await HomeKitDevice.message(trackedDevice.uuid, HomeKitDevice.REMOVE, {});

                    // Finally, remove from tracked devices
                    this.#trackedDevices.delete(serialNumber);
                  }

                  delete this.#rawData[resource.resourceId];
                }
              }
            }

            // traitStates
            if (Array.isArray(observeResponse?.traitStates) === true) {
              // Tidy up our received trait states. This ensures we only have one status for the trait in the data we process
              // We'll favour a trait with accepted status over the same with confirmed status
              let traits = observeResponse.traitStates;
              let acceptedKeys = new Set(
                traits
                  .filter((trait) => trait.stateTypes.includes('ACCEPTED') === true)
                  .map((trait) => trait.traitId.resourceId + '/' + trait.traitId.traitLabel),
              );

              observeResponse.traitStates = [
                ...traits.filter((trait) => acceptedKeys.has(trait.traitId.resourceId + '/' + trait.traitId.traitLabel) === false),
                ...traits.filter((trait) => trait.stateTypes.includes('ACCEPTED') === true),
              ];

              for (let trait of observeResponse.traitStates) {
                let resourceId = trait.traitId.resourceId;
                let traitLabel = trait.traitId.traitLabel;
                let patchValues = trait?.patch?.values ?? {};
                let changedEntry = changedData.get(resourceId);

                // Mapped changed data for processing after the loop
                if (changedEntry === undefined) {
                  changedEntry = { fields: new Set() };
                  changedData.set(resourceId, changedEntry);
                }

                changedEntry.fields.add(traitLabel);

                // Create or update trait entry and assign latest patch values
                this.#rawData[resourceId] = {
                  connection: uuid,
                  source: DATA_SOURCE.GOOGLE,
                  value: {
                    ...this.#rawData?.[resourceId]?.value,
                    [traitLabel]: patchValues,
                  },
                };

                // Remove trait type metadata — we don't need to store it
                delete this.#rawData[resourceId]?.value?.[traitLabel]?.['@type'];

                // Store the internal Nest and Google structure uuids if matched to a defined home array entry
                if (
                  resourceId.startsWith('STRUCTURE_') === true &&
                  traitLabel === 'structure_info' &&
                  (patchValues?.name?.trim?.() ?? '') !== ''
                ) {
                  Object.assign(
                    this.config?.homes?.find((home) => home?.name?.trim?.().toUpperCase() === patchValues.name?.trim?.().toUpperCase()) ||
                      {},
                    { nest_home_uuid: patchValues.rtsStructureId, google_home_uuid: resourceId },
                  );
                }

              }
            }
          }

          await this.#processData(uuid, changedData);

          connection.observeRetryDelay = undefined;
        },
      )
      .then((result) => {
        // gRPC failures normally resolve with a status rather than reject.
        observeFailed = result.status !== 0;

        // Expired/revoked credentials need account reauthentication, not another
        // Observe request with the same token. A retired transport must not
        // invalidate credentials installed by a refresh while it was closing.
        if (
          result.status === GrpcTransport.STATUS.UNAUTHENTICATED &&
          this.#connections?.get(uuid) === connection &&
          connection.grpcTransport === grpcTransport &&
          connection.authorised === true
        ) {
          this.#connections?.markUnauthorised?.(uuid, 'google-api-' + result.status);
        }
      })
      .catch((error) => {
        observeFailed = true;

        this?.log?.debug?.(
          'Google API observe failed for connection "%s": %s',
          connection.name,
          typeof error?.message === 'string' ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.#connections?.get(uuid) === connection && connection.grpcTransport === grpcTransport) {
          connection.climateObserving = false;
          this.dashboard?.invalidate(uuid);
        }
        // Only continue the observe loop if this exact connection is still active and authorised.
        if (this.#connections?.get(uuid) === connection && connection.grpcTransport === grpcTransport && connection.authorised === true) {
          let observeDelay = API_STREAM_LOOP_INTERVAL;

          if (observeFailed === true) {
            observeDelay =
              Number.isFinite(connection.observeRetryDelay) === true && connection.observeRetryDelay > 0
                ? Math.min(connection.observeRetryDelay * 2, API_STREAM_RETRY_MAX)
                : API_STREAM_RETRY_INITIAL;

            connection.observeRetryDelay = observeDelay;
          }

          clearTimeout(connection.observeTimer);
          connection.observeTimer = setTimeout(() => this.#observeGoogleAPI(uuid), observeDelay);
        }
      });
  }

  async #processData(uuid, changedData = undefined) {
    let connection = this.#connections?.get(uuid);

    if (this.config?.options?.supportDump === true && typeof connection === 'object' && connection !== null) {
      this.#supportDumpWriter ??= createSupportDump(this.log);
      this.#supportDumpWriter(this.#rawData, uuid, changedData);
    }

    // Process the raw data through each of the device modules to get the latest device details and states
    for (let [deviceType, deviceModule] of this.#deviceModules) {
      if (typeof deviceModule?.processRawData === 'function') {
        let devices = {};

        try {
          devices = deviceModule.processRawData(this.log, this.#rawData, this.config, deviceType, changedData);
        } catch (error) {
          this?.log?.warn?.('%s module failed to process data. Error was "%s"', deviceType, String(error));
        }

        if (typeof devices === 'object' && devices !== null) {
          for (let [serialNumber, result] of Object.entries(devices)) {
            let deviceData = result?.data;
            let isFull = result?.full === true;
            let trackedDevice = this.#trackedDevices.get(serialNumber);

            if (deviceData === null || typeof deviceData !== 'object' || deviceData?.constructor !== Object) {
              continue;
            }

            if (trackedDevice === undefined && isFull === true && deviceData?.excluded === true) {
              // We haven't tracked this device before (ie: should be a new one) and but its excluded
              let homeName =
                this.#rawData?.[deviceData.nest_google_home_uuid]?.value?.name ||
                this.#rawData?.[deviceData.nest_google_home_uuid]?.value?.structure_info?.name;

              if (deviceType !== DEVICE_TYPE.WEATHER) {
                this?.log?.warn?.(
                  'Device "%s"%s is ignored due to it being marked as excluded',
                  deviceData.description,
                  (homeName?.trim?.() ?? '') !== '' ? ' in "' + homeName + '"' : '',
                );
              }

              // Track this device even though its excluded
              this.#trackedDevices.set(serialNumber, {
                uuid: HomeKitDevice.generateUUID(HomeKitDevice.PLUGIN_NAME, this.api, serialNumber),
                nest_google_device_uuid: deviceData.nest_google_device_uuid,
                type: deviceModule.class.TYPE, // Store type of device
                source: undefined, // gets filled out later
                timers: undefined,
                exclude: true,
              });

              trackedDevice = this.#trackedDevices.get(serialNumber);

              // If the device is now marked as excluded and present in accessory cache
              // Then we'll unregister it from the Homebridge platform
              let accessory = this.cachedAccessories.find((accessory) => accessory?.UUID === trackedDevice.uuid);

              if (accessory !== undefined && typeof accessory === 'object') {
                try {
                  this.api.unregisterPlatformAccessories(HomeKitDevice.PLUGIN_NAME, HomeKitDevice.PLATFORM_NAME, [accessory]);
                  // eslint-disable-next-line no-unused-vars
                } catch (error) {
                  // Empty
                }
              }
            }

            if (trackedDevice === undefined && isFull === true && deviceData?.excluded === false) {
              // We haven't tracked this device before (ie: should be a new one) and its not excluded
              // so create the required HomeKit accessories based upon the device data
              if (
                typeof deviceModule?.class === 'function' &&
                (deviceModule.class.TYPE?.trim?.() ?? '') !== '' &&
                (deviceModule.class.VERSION?.trim?.() ?? '') !== ''
              ) {
                // We have found a device class for this device type, so we can create the device
                let accessoryName =
                  (deviceData.manufacturer?.trim() || 'Nest') +
                  ' ' +
                  deviceModule.class.TYPE.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
                    .toLowerCase()
                    .replace(/\b\w/g, (character) => character.toUpperCase());

                let tempDevice = new deviceModule.class(this.cachedAccessories, this.api, deviceData);
                if (deviceModule.class.TYPE === DEVICE_TYPE.THERMOSTAT) {
                  tempDevice.getClimateRoom = () => this.automation?.homeKitRoom?.(serialNumber) ?? null;
                }
                await tempDevice.add({
                  hapAccessoryName: accessoryName,
                  hapCategory: getDeviceHKCategory(deviceModule.class.TYPE),
                  enableHistory: deviceData?.eveHistory === true,
                });

                // Register per-device set/get handlers
                HomeKitDevice.message(tempDevice.uuid, HomeKitDevice.SET, async (values) => {
                  await this.#set(this.#rawData?.[values?.uuid]?.connection, values?.uuid, values);
                });

                HomeKitDevice.message(tempDevice.uuid, HomeKitDevice.GET, async (values) => {
                  return await this.#get(this.#rawData?.[values?.uuid]?.connection, values?.uuid, values);
                });

                // Track this device once created
                this.#trackedDevices.set(serialNumber, {
                  uuid: tempDevice.uuid,
                  device: tempDevice,
                  nest_google_device_uuid: deviceData.nest_google_device_uuid,
                  type: deviceModule.class.TYPE, // Store type of device
                  source: undefined, // gets filled out later
                  timers: {},
                  exclude: false,
                });

                trackedDevice = this.#trackedDevices.get(serialNumber);
              }
            }

            // Ignore partial payloads for devices we have not yet created/tracked
            if (trackedDevice === undefined) {
              continue;
            }

            // Finally, if device is not excluded, send updated data to device for it to process
            if (trackedDevice?.exclude === false) {
              let resourceId = deviceData?.nest_google_device_uuid;
              let resourceData = this.#rawData?.[resourceId];
              let newSource = resourceData?.source;

              if (newSource !== undefined && newSource !== trackedDevice.source) {
                // Data source for this device has changed.
                // Allow initial source assignment and Nest -> Google upgrades.
                if (
                  trackedDevice.source === undefined ||
                  (trackedDevice.source === DATA_SOURCE.NEST && newSource === DATA_SOURCE.GOOGLE)
                ) {
                  this?.log?.debug?.(
                    'Using %s API as data source for "%s" from connection "%s"',
                    newSource,
                    deviceData.description,
                    this.#connections.get(resourceData.connection)?.name,
                  );

                  trackedDevice.source = newSource;
                  trackedDevice.nest_google_device_uuid = resourceId;
                } else {
                  // Rejected sources must not overwrite accessory state or its cloud ID used for SET commands.
                  continue;
                }
              }

              this.dashboard?.update(serialNumber, deviceModule.class.TYPE, deviceData, resourceData?.connection);
              // Send updated data onto HomeKit device for it to process
              await HomeKitDevice.message(trackedDevice.uuid, HomeKitDevice.UPDATE, deviceData);
            }
          }
        }
      }
    }
  }

  async #set(uuid, nest_google_device_uuid, values, origin) {
    if (Object.hasOwn(values ?? {}, 'climate_room_target')) {
      if (origin?.automation || !this.automation?.setHomeKitRoomTarget ||
          Object.keys(values).some((key) => !['uuid', 'climate_room_target'].includes(key))) {
        throw new Error('Invalid room-temperature command.');
      }
      return this.automation.setHomeKitRoomTarget(nest_google_device_uuid, values.climate_room_target);
    }
    let manualTargetRequests;
    if (
      !origin?.automation &&
      values &&
      [
        'target_temperature', 'target_temperature_low', 'target_temperature_high', 'hvac_mode',
        'eco_mode', 'temperature_sensor', 'native_sensor_control', 'temperature_lock',
      ].some((key) => Object.hasOwn(values, key))
    ) {
      manualTargetRequests = await this.automation?.manualThermostat(nest_google_device_uuid, values);
    }
    const previous = this.climateWrites.get(nest_google_device_uuid) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(() => {
        if (origin?.guard && !origin.guard()) {
          const error = new Error('Thermostat changed before the queued command.');
          error.code = 'CLIMATE_CONFLICT';
          throw error;
        }
        return this.#performSet(uuid, nest_google_device_uuid, values);
      });
    this.climateWrites.set(nest_google_device_uuid, operation);
    try {
      const result = await operation;
      if (manualTargetRequests?.length) {
        await this.automation?.manualThermostatResult?.(manualTargetRequests, true);
      }
      return result;
    } catch (error) {
      if (manualTargetRequests?.length) {
        await this.automation?.manualThermostatResult?.(manualTargetRequests, false);
      }
      throw error;
    } finally {
      if (this.climateWrites.get(nest_google_device_uuid) === operation) {
        this.climateWrites.delete(nest_google_device_uuid);
      }
    }
  }

  async #performSet(uuid, nest_google_device_uuid, values) {
    const timestamp = (milliseconds) => ({
      // Derive both protobuf timestamp fields from the same millisecond value.
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1e6,
    });

    let connection = this.#connections?.get(uuid);

    if (
      typeof values !== 'object' ||
      values === null ||
      typeof this.#rawData?.[nest_google_device_uuid] !== 'object' ||
      typeof connection !== 'object' ||
      connection === null ||
      connection.authorised !== true
    ) {
      throw new Error('SET requires an available authorised device connection');
    }

    if (this.#rawData[nest_google_device_uuid].source === DATA_SOURCE.GOOGLE && connection.grpcTransport === undefined) {
      throw new Error('Google command transport is unavailable');
    }

    let failures = [];
    for (let [key, value] of Object.entries(values)) {
      try {
        if (key === 'uuid') {
          // We don't do anything with the key containing the uuid
          continue;
        }

        if (key === 'native_sensor_control' && this.#rawData[nest_google_device_uuid].source !== DATA_SOURCE.GOOGLE) {
          throw new Error('Automatic Nest sensor setup requires the Google thermostat connection');
        }

        if (this.#rawData?.[nest_google_device_uuid]?.source === DATA_SOURCE.GOOGLE && connection.grpcTransport !== undefined) {
          let updatedTraits = [];
          let commandTraits = [];

          let updateElement = {
            traitRequest: {
              resourceId: nest_google_device_uuid,
              traitLabel: '',
              requestId: crypto.randomUUID(),
            },
            state: {
              type_url: '',
              value: {},
            },
          };
          let commandElement = {
            resourceRequest: {
              resourceId: nest_google_device_uuid,
              requestId: crypto.randomUUID(),
            },
            resourceCommands: [],
          };

          // Helper function to set the update trait details based on the key/value passed in.
          // with optional explicit trait value and updates to merge in
          let setUpdateTrait = (traitLabel, typeURL, traitValue = undefined, updates = undefined) => {
            updateElement.traitRequest.traitLabel = traitLabel;
            updateElement.state.type_url = typeURL;

            // If no explicit value passed, infer from rawData
            if (traitValue === undefined) {
              traitValue = this.#rawData?.[nest_google_device_uuid]?.value?.[traitLabel];
            }

            updateElement.state.value = typeof traitValue === 'object' && traitValue !== null ? structuredClone(traitValue) : {};

            // Optionally merge in simple top-level updates
            if (typeof updates === 'object' && updates !== null) {
              Object.assign(updateElement.state.value, updates);
            }
          };

          // Helper function to set the command trait details based on the key/value passed in (optional explicit resourceId override)
          let setCommandTrait = (traitLabel, typeURL, commandValue, resourceId = nest_google_device_uuid) => {
            commandElement.resourceRequest.resourceId = resourceId;
            commandElement.resourceCommands = [
              {
                traitLabel,
                command: {
                  type_url: typeURL,
                  value: commandValue,
                },
              },
            ];
          };

          if (key === 'eco_mode') {
            if (typeof value !== 'boolean' || this.#rawData[nest_google_device_uuid].value?.eco_mode_state === undefined) {
              throw new Error('Eco mode is unavailable for this thermostat');
            }
            setCommandTrait('eco_mode_state', 'type.nestlabs.com/nest.trait.hvac.EcoModeStateTrait.EcoModeChangeRequest', {
              ecoMode: value ? 'ECO_MODE_MANUAL_ECO' : 'ECO_MODE_INACTIVE',
              ecoModeActor: { method: 'HVAC_ACTOR_METHOD_REMOTE', timeOfAction: timestamp(Date.now()) },
              setAll: false,
            });
          }

          if (key === 'temperature_sensor') {
            const settings = this.#rawData[nest_google_device_uuid].value?.remote_comfort_sensing_settings;
            if (
              typeof value !== 'string' ||
              settings === undefined ||
              (value !== '' && !settings.associatedRcsSensors?.some((sensor) => sensor.deviceId?.resourceId === value))
            ) {
              throw new Error('Temperature sensor does not belong to this thermostat');
            }
            setUpdateTrait('remote_comfort_sensing_settings', 'type.nestlabs.com/nest.trait.hvac.RemoteComfortSensingSettingsTrait');
            updateElement.state.value.activeRcsSelection =
              value === ''
                ? { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' }
                : { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: value } };
          }

          if (key === 'native_sensor_control') {
            const settings = this.#rawData[nest_google_device_uuid].value?.remote_comfort_sensing_settings;
            setUpdateTrait(
              'remote_comfort_sensing_settings',
              'type.nestlabs.com/nest.trait.hvac.RemoteComfortSensingSettingsTrait',
              sensorControlUpdate(settings, value),
            );
          }

          if (
            (key === 'hvac_mode' && ['OFF', 'COOL', 'HEAT', 'RANGE'].includes(value?.toUpperCase?.())) ||
            (['target_temperature', 'target_temperature_low', 'target_temperature_high'].includes(key) === true &&
              this.#rawData?.[nest_google_device_uuid]?.value?.eco_mode_state?.ecoMode === 'ECO_MODE_INACTIVE' &&
              Number.isFinite(Number(value)) === true)
          ) {
            // Set either the 'mode' and/or non-eco temperatures on the target thermostat
            setUpdateTrait('target_temperature_settings', 'type.nestlabs.com/nest.trait.hvac.TargetTemperatureSettingsTrait');

            if (
              (key === 'target_temperature_low' || key === 'target_temperature') &&
              (updateElement.state.value.targetTemperature.setpointType === 'SET_POINT_TYPE_HEAT' ||
                updateElement.state.value.targetTemperature.setpointType === 'SET_POINT_TYPE_RANGE')
            ) {
              // Changing heating target temperature
              updateElement.state.value.targetTemperature.heatingTarget = { value: Number(value) };
            }
            if (
              (key === 'target_temperature_high' || key === 'target_temperature') &&
              (updateElement.state.value.targetTemperature.setpointType === 'SET_POINT_TYPE_COOL' ||
                updateElement.state.value.targetTemperature.setpointType === 'SET_POINT_TYPE_RANGE')
            ) {
              // Changing cooling target temperature
              updateElement.state.value.targetTemperature.coolingTarget = { value: Number(value) };
            }

            if (key === 'hvac_mode' && value.toUpperCase() !== 'OFF') {
              updateElement.state.value.targetTemperature.setpointType = 'SET_POINT_TYPE_' + value.toUpperCase();
              updateElement.state.value.enabled = { value: true };
            }

            if (key === 'hvac_mode' && value.toUpperCase() === 'OFF') {
              updateElement.state.value.enabled = { value: false };
            }

            // Tag 'who' is doing the temperature/mode change. We are ie: the device :-)
            updateElement.state.value.targetTemperature.currentActorInfo = {
              method: 'HVAC_ACTOR_METHOD_IOS',
              originator: { resourceId: nest_google_device_uuid },
              timeOfAction: timestamp(Date.now()),
            };
          }

          if (
            ['target_temperature', 'target_temperature_low', 'target_temperature_high'].includes(key) === true &&
            this.#rawData?.[nest_google_device_uuid]?.value?.eco_mode_state?.ecoMode !== 'ECO_MODE_INACTIVE' &&
            Number.isFinite(Number(value)) === true
          ) {
            // Set eco mode temperatures on the target thermostat
            setUpdateTrait('eco_mode_settings', 'type.nestlabs.com/nest.trait.hvac.EcoModeSettingsTrait');

            updateElement.state.value.ecoTemperatureHeat.value.value =
              updateElement.state.value.ecoTemperatureHeat.enabled === true &&
              updateElement.state.value.ecoTemperatureCool.enabled === false
                ? Number(value)
                : updateElement.state.value.ecoTemperatureHeat.value.value;
            updateElement.state.value.ecoTemperatureCool.value.value =
              updateElement.state.value.ecoTemperatureHeat.enabled === false &&
              updateElement.state.value.ecoTemperatureCool.enabled === true
                ? Number(value)
                : updateElement.state.value.ecoTemperatureCool.value.value;
            updateElement.state.value.ecoTemperatureHeat.value.value =
              updateElement.state.value.ecoTemperatureHeat.enabled === true &&
              updateElement.state.value.ecoTemperatureCool.enabled === true &&
              key === 'target_temperature_low'
                ? Number(value)
                : updateElement.state.value.ecoTemperatureHeat.value.value;
            updateElement.state.value.ecoTemperatureCool.value.value =
              updateElement.state.value.ecoTemperatureHeat.enabled === true &&
              updateElement.state.value.ecoTemperatureCool.enabled === true &&
              key === 'target_temperature_high'
                ? Number(value)
                : updateElement.state.value.ecoTemperatureCool.value.value;
          }

          if (key === 'temperature_scale' && (value?.toUpperCase?.() === 'C' || value?.toUpperCase?.() === 'F')) {
            // Set the temperature scale on the target thermostat
            setUpdateTrait('display_settings', 'type.nestlabs.com/nest.trait.hvac.DisplaySettingsTrait', undefined, {
              temperatureScale: value.toUpperCase() === 'F' ? 'TEMPERATURE_SCALE_F' : 'TEMPERATURE_SCALE_C',
            });
          }

          if (key === 'temperature_lock' && typeof value === 'boolean') {
            // Set lock mode on the target thermostat
            setUpdateTrait('temperature_lock_settings', 'type.nestlabs.com/nest.trait.hvac.TemperatureLockSettingsTrait', undefined, {
              enabled: value,
            });
          }

          if (
            key === 'fan_state' &&
            typeof value === 'boolean' &&
            Number.isFinite(Number(values?.fan_preset_duration ?? values?.fan_duration)) === true
          ) {
            // Set fan mode on the target thermostat, including runtime if turning on
            setUpdateTrait('fan_control_settings', 'type.nestlabs.com/nest.trait.hvac.FanControlSettingsTrait');
            updateElement.state.value.timerEnd =
              value === true ? timestamp(Date.now() + Number(values.fan_preset_duration ?? values.fan_duration) * 1000) : timestamp(0);
            if (values?.fan_timer_speed !== undefined) {
              // We have a value to set fan speed also, so handle here as combined setting
              updateElement.state.value.timerSpeed =
                values?.fan_timer_speed !== 0
                  ? 'FAN_SPEED_SETTING_STAGE' + values?.fan_timer_speed
                  : this.#rawData[nest_google_device_uuid].value.fan_control_settings.timerSpeed;
            }
          }

          if (key === 'fan_timer_speed' && Number.isFinite(Number(value)) === true && values?.fan_state === undefined) {
            // Set fan speed on the target thermostat only if we're not changing fan on/off state also
            setUpdateTrait('fan_control_settings', 'type.nestlabs.com/nest.trait.hvac.FanControlSettingsTrait');
            updateElement.state.value.timerSpeed =
              value !== 0
                ? 'FAN_SPEED_SETTING_STAGE' + value
                : this.#rawData[nest_google_device_uuid].value.fan_control_settings.timerSpeed;
          }

          if (
            key === 'active_sensor' &&
            typeof value === 'boolean' &&
            typeof this.#rawData?.[this.#rawData[nest_google_device_uuid]?.value?.associated_thermostat]?.value
              ?.remote_comfort_sensing_settings === 'object'
          ) {
            // Set active temperature sensor for associated thermostat
            updateElement.traitRequest.resourceId = this.#rawData[nest_google_device_uuid].value.associated_thermostat;
            setUpdateTrait(
              'remote_comfort_sensing_settings',
              'type.nestlabs.com/nest.trait.hvac.RemoteComfortSensingSettingsTrait',
              this.#rawData[this.#rawData[nest_google_device_uuid].value.associated_thermostat].value.remote_comfort_sensing_settings,
            );
            updateElement.state.value.activeRcsSelection =
              value === true
                ? { rcsSourceType: 'RCS_SOURCE_TYPE_SINGLE_SENSOR', activeRcsSensor: { resourceId: nest_google_device_uuid } }
                : { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' };
          }

          if (
            key === 'hot_water_boost_active' &&
            typeof value === 'object' &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasHotWaterControl === true
          ) {
            // Turn hotwater boost heating on/off
            setUpdateTrait('hot_water_settings', 'type.nestlabs.com/nest.trait.hvac.HotWaterSettingsTrait');

            let boostTime = Number.isFinite(Number(value?.time)) === true ? Number(value.time) : 30 * 60;

            updateElement.state.value.boostTimerEnd = value?.state === true ? timestamp(Date.now() + boostTime * 1000) : timestamp(0);
          }

          if (
            key === 'hot_water_temperature' &&
            Number.isFinite(Number(value)) === true &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasHotWaterTemperature === true
          ) {
            // Set hotwater boiler temperature
            setUpdateTrait('hot_water_settings', 'type.nestlabs.com/nest.trait.hvac.HotWaterSettingsTrait');
            updateElement.state.value.temperature = {
              ...(updateElement.state.value.temperature ?? {}),
              value: value,
            };
          }

          if (key === 'bolt_lock' && typeof value === 'boolean') {
            // Set lock state
            setCommandTrait('bolt_lock', 'type.nestlabs.com/weave.trait.security.BoltLockTrait.BoltLockChangeRequest', {
              state: value === true ? 'BOLT_STATE_EXTENDED' : 'BOLT_STATE_RETRACTED',
              boltLockActor: {
                method: 'BOLT_LOCK_ACTOR_METHOD_REMOTE_USER_EXPLICIT',
                originator: { resourceId: nest_google_device_uuid },
                agent: null,
              },
            });
          }

          if (key === 'auto_relock_duration' && Number.isFinite(Number(value)) === true) {
            // Set lock auto-relock duration
            setUpdateTrait('bolt_lock_settings', 'type.nestlabs.com/weave.trait.security.BoltLockSettingsTrait');
            updateElement.state.value.autoRelockDuration = {
              ...(updateElement.state.value.autoRelockDuration ?? {}),
              seconds: Number(value),
            };
          }

          if (
            key === 'vacation_mode' &&
            typeof value === 'boolean' &&
            (this.#rawData?.[nest_google_device_uuid]?.value?.device_info?.pairerId?.resourceId ?? '') !== ''
          ) {
            // Set vacation mode on structure
            setCommandTrait(
              'structure_mode',
              'type.nestlabs.com/nest.trait.occupancy.StructureModeTrait.StructureModeChangeRequest',
              {
                structureMode: value === true ? 'STRUCTURE_MODE_VACATION' : 'STRUCTURE_MODE_HOME',
                reason: 'STRUCTURE_MODE_REASON_EXPLICIT_INTENT',
                userId: {
                  resourceId: nest_google_device_uuid,
                },
              },
              this.#rawData[nest_google_device_uuid].value.device_info.pairerId.resourceId,
            );
          }

          if (
            key === 'dehumidifier_state' &&
            typeof value === 'boolean' &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasDehumidifier === true
          ) {
            // Set dehumidifier on/off on the target thermostat
            setUpdateTrait('humidity_control_settings', 'type.nestlabs.com/nest.trait.hvac.HumidityControlSettingsTrait');
            updateElement.state.value.dehumidifierTargetHumidity = {
              ...(updateElement.state.value.dehumidifierTargetHumidity ?? {}),
              enabled: value,
            };
          }

          if (
            key === 'target_humidity_dehumidifier' &&
            Number.isFinite(Number(value)) === true &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasDehumidifier === true
          ) {
            // Set dehumidifier target humidity on the target thermostat
            setUpdateTrait('humidity_control_settings', 'type.nestlabs.com/nest.trait.hvac.HumidityControlSettingsTrait');
            updateElement.state.value.dehumidifierTargetHumidity = {
              ...(updateElement.state.value.dehumidifierTargetHumidity ?? {}),
              value: Number(value),
            };
          }

          if (
            key === 'humidifier_state' &&
            typeof value === 'boolean' &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasHumidifier === true
          ) {
            // Set humidifier on/off on the target thermostat
            setUpdateTrait('humidity_control_settings', 'type.nestlabs.com/nest.trait.hvac.HumidityControlSettingsTrait');
            updateElement.state.value.humidifierTargetHumidity = {
              ...(updateElement.state.value.humidifierTargetHumidity ?? {}),
              enabled: value,
            };
          }

          if (
            key === 'target_humidity_humidifier' &&
            Number.isFinite(Number(value)) === true &&
            this.#rawData?.[nest_google_device_uuid]?.value?.hvac_equipment_capabilities?.hasHumidifier === true
          ) {
            // Set humidifier target humidity on the target thermostat
            setUpdateTrait('humidity_control_settings', 'type.nestlabs.com/nest.trait.hvac.HumidityControlSettingsTrait');
            updateElement.state.value.humidifierTargetHumidity = {
              ...(updateElement.state.value.humidifierTargetHumidity ?? {}),
              value: Number(value),
            };
          }

          if (updateElement.traitRequest.traitLabel !== '' && updateElement.state.type_url !== '') {
            updatedTraits.push(structuredClone(updateElement));
          }

          if (Array.isArray(commandElement?.resourceCommands) === true && commandElement.resourceCommands.length !== 0) {
            commandTraits.push(structuredClone(commandElement));
          }

          // Perform any direct trait updates we have to do. This can be done via a single call in a batch
          if (updatedTraits.length !== 0) {
            let grpcResult = await connection.grpcTransport.command('nestlabs.gateway.v1.', 'TraitBatchApi', 'BatchUpdateState', {
              batchUpdateStateRequest: updatedTraits,
            });
            let commandResponse = Array.isArray(grpcResult?.data) === true ? grpcResult.data[0] : undefined;
            let operation = commandResponse?.traitOperations?.[0];
            if (grpcResult?.status !== 0 || operation?.progress !== 'COMPLETE' || (operation?.status?.code ?? 0) !== 0) {
              throw new Error('Google API rejected setting "' + key + '"');
            }
          }

          // Perform any trait updates required via resource commands. Each one is done separately
          for (let command of commandTraits ?? []) {
            let grpcResult = await connection.grpcTransport.command('nestlabs.gateway.v1.', 'ResourceApi', 'SendCommand', command);
            let commandResponse = Array.isArray(grpcResult?.data) === true ? grpcResult.data[0] : undefined;
            let operation = commandResponse?.traitOperations?.[0];
            if (grpcResult?.status !== 0 || operation?.progress !== 'COMPLETE' || (operation?.status?.code ?? 0) !== 0) {
              throw new Error('Google API rejected setting "' + key + '"');
            }
          }
        }

        if (this.#rawData?.[nest_google_device_uuid]?.source === DATA_SOURCE.NEST) {
          // Retain Nest REST controls for Protect devices.
          let subscribeJSONData = { objects: [] };

          if (key === 'ntp_green_led_enable' && typeof value === 'boolean' && nest_google_device_uuid.startsWith('topaz.') === true) {
            // Set night time promise Led status on Protect
            subscribeJSONData.objects.push({ object_key: nest_google_device_uuid, op: 'MERGE', value: { ntp_green_led_enable: value } });
          }

          if (subscribeJSONData.objects.length !== 0) {
            let response = await fetchWrapper(
              fetchWrapper.POST,
              new URL('/v5/put', connection.transport_url).href,
              {
                headers: {
                  Referer: 'https://' + connection.referer,
                  Origin: 'https://' + connection.referer,
                  Authorization: 'Basic ' + connection.token,
                  'User-Agent': USER_AGENT,
                  'Sec-Fetch-Mode': 'cors',
                  'Sec-Fetch-Site': 'same-origin',
                  'X-nl-protocol-version': 1,
                  'Content-Type': 'application/json',
                },
                retry: 3,
              },
              JSON.stringify(subscribeJSONData),
            );
            let data = await response.json();
            if (Array.isArray(data?.objects) === false || data.objects.length === 0) {
              throw new Error('Nest API property update failed');
            }
          }
        }
      } catch (error) {
        failures.push(error);
        this?.log?.debug?.(
          'Failed processing set request for key "%s" on device uuid "%s". Error was "%s"',
          key,
          nest_google_device_uuid,
          typeof error?.message === 'string' ? error.message : String(error),
        );
      }
    }

    // Preserve attempts for remaining fields, but prevent SET from committing a partially accepted request.
    // Upstream updates reconcile fields that reached the cloud before another field failed.
    if (failures.length > 0) {
      throw new AggregateError(failures, 'One or more device settings were rejected');
    }
  }

  async #get(uuid, nest_google_device_uuid, values) {
    if (typeof values !== 'object' || typeof this.#rawData?.[nest_google_device_uuid] !== 'object') {
      return;
    }

    for (let key of Object.keys(values)) {
      if (key === 'uuid') {
        // We don't do anything with the key containing the uuid
        continue;
      }

      // We'll return the data under the original key value
      // By default, the returned value will be undefined. If call is successful, the key value will have the data requested
      values[key] = undefined;

      if (key === 'location_weather') {
        // Weather data requested.
        // We'll pass in the postal code and country code for the device if available to get localised weather data
        try {
          values[key] = await this.#getLocationWeather(
            uuid,
            nest_google_device_uuid,
            this.#rawData[nest_google_device_uuid].value?.weather?.postal_code,
            this.#rawData[nest_google_device_uuid].value?.weather?.country_code,
          );
        } catch (error) {
          this?.log?.debug?.(
            'Weather request failed for device uuid "%s". Error was "%s"',
            nest_google_device_uuid,
            typeof error?.message === 'string' ? error.message : String(error),
          );
          values[key] = undefined;
        }
      }

    }

    return values;
  }

  async #getLocationWeather(uuid, nest_google_device_uuid, postal_code, country_code) {
    let connection = this.#connections?.get(uuid);

    if (
      typeof connection !== 'object' ||
      connection === null ||
      connection.authorised !== true ||
      (connection.referer ?? '') === '' ||
      (connection.token ?? '') === '' ||
      (connection.restAPIHost ?? '') === '' ||
      (postal_code?.trim?.() ?? '') === '' ||
      (country_code?.trim?.() ?? '') === '' ||
      (nest_google_device_uuid?.trim?.() ?? '') === ''
    ) {
      // Not a valid connection object and/or we're not authorised
      return;
    }

    try {
      let response = await fetchWrapper(
        fetchWrapper.GET,
        new URL('/api/0.1/weather/forecast/' + postal_code + ',' + country_code, 'https://' + connection.restAPIHost).href,
        {
          headers: {
            Referer: 'https://' + connection.referer,
            Origin: 'https://' + connection.referer,
            Authorization: 'Basic ' + connection.token,
            'User-Agent': USER_AGENT,
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
          },
          retry: 3,
          timeout: 4000,
        },
      );

      let data = await response.json();

      // If returned JSON has an error defined, throw it
      if (data?.error !== undefined) {
        throw new Error(data.error);
      }

      // Ensure we have valid data
      if (
        data?.now?.current_temperature === undefined ||
        data?.now?.current_humidity === undefined ||
        data?.now?.conditions === undefined ||
        data?.now?.wind_direction === undefined ||
        data?.now?.current_wind === undefined ||
        data?.now?.sunrise === undefined ||
        data?.now?.sunset === undefined ||
        data?.forecast?.daily?.[0]?.conditions === undefined
      ) {
        throw new Error('Missing or invalid weather data');
      }

      let weather = {
        // Store the used post/country codes
        postal_code: postal_code,
        country_code: country_code,

        // Update weather data
        current_temperature: adjustTemperature(data.now.current_temperature, 'C', 'C', false),
        current_humidity: data.now.current_humidity,
        condition: data.now.conditions,
        wind_direction: data.now.wind_direction,
        wind_speed: data.now.current_wind,
        sunrise: data.now.sunrise,
        sunset: data.now.sunset,
        station: data.display_city,
        forecast: data.forecast.daily[0].conditions,
      };
      return weather;
    } catch (error) {
      // Log unexpected errors (excluding timeouts) for debugging
      this?.log?.debug?.(
        'Nest API failed to retrieve weather details for device uuid "%s". Error was "%s"',
        nest_google_device_uuid,
        typeof error?.message === 'string' ? error.message : String(error),
      );
      return; // Return undefined if error occurs getting weather data
    }
  }

}
