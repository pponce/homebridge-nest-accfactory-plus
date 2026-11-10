// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
// Shared Constants and Definitions
// Part of homebridge-nest-accfactory
//
// Defines shared constants used across the plugin, including device types,
// API mappings, timing values, resource paths, and configuration limits.
//
// Responsibilities:
// - Provide centralised constant definitions for all modules
// - Define supported device types and account types
// - Expose API resource mappings (Nest REST and Google protobuf)
// - Define timing intervals and operational limits
//
// Features:
// - Device type definitions used for module loading and HomeKit mapping
// - Protobuf resource mappings for device identification
// - Nest API bucket definitions for REST polling/subscription
// - Timer intervals for polling, cooldowns, and timeouts
// - Temperature, elevation, and duration constraints
// - Logging level definitions
//
// Notes:
// - This module contains no runtime logic — constants only
// - Imported throughout the codebase for consistency and reuse
// - Changes here may affect multiple subsystems (devices, configuration, APIs)
//
// Code version 2026.11.10
// Mark Hulskamp
'use strict';

// Define nodejs module requirements
import path from 'node:path';
import url from 'node:url';

// Define constants
export const MIN_NODE_VERSION = 22; // Minimum required Node.js version

export const TIMERS = {
  WEATHER: { name: 'weather', interval: 300000 }, // Weather location data refresh interval (ms)
  NEST_API: { name: 'nest-api', interval: 10000 }, // Nest API request timeout (ms)
  MOTION_COOLDOWN: { name: 'motion-cooldown', interval: 60000 }, // Cooldown timer for motion events (ms)
};

export const USER_AGENT = 'Nest/5.87.0 (iOScom.nestlabs.jasper.release) os=26.4'; // User Agent string

export const __dirname = path.dirname(url.fileURLToPath(import.meta.url)); // Make a defined for JS __dirname

export const DATA_SOURCE = {
  NEST: 'Nest', // From the Nest API
  GOOGLE: 'Google', // From the Protobuf/Google API
};

export const DAYS_OF_WEEK_FULL = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const DAYS_OF_WEEK_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const PROTOBUF_RESOURCES = {
  THERMOSTAT: [
    'nest.resource.NestAmber1DisplayResource',
    'nest.resource.NestAmber2DisplayResource',
    'nest.resource.NestLearningThermostat1Resource',
    'nest.resource.NestLearningThermostat2Resource',
    'nest.resource.NestLearningThermostat3Resource',
    'nest.resource.NestLearningThermostat3v2Resource',
    'nest.resource.NestAgateDisplayResource',
    'nest.resource.NestOnyxResource',
    'google.resource.GoogleZirconium1Resource',
    'google.resource.GoogleBismuth1Resource',
  ],
  HEATLINK: ['nest.resource.NestAgateHeatlinkResource'],
  KRYPTONITE: ['nest.resource.NestKryptoniteResource'],
  LOCK: ['yale.resource.LinusLockResource'],
  PROTECT: [
    'nest.resource.NestProtect1LinePoweredResource',
    'nest.resource.NestProtect1BatteryPoweredResource',
    'nest.resource.NestProtect2LinePoweredResource',
    'nest.resource.NestProtect2BatteryPoweredResource',
    'nest.resource.NestProtect2Resource',
  ],
  CONNECT: ['nest.resource.NestConnectResource'],
  DETECT: ['nest.resource.NestDetectResource'],
  GUARD: ['nest.resource.NestGuardResource'],
};

export const NEST_API_BUCKETS = [
  'buckets',
  'delayed_topaz',
  'demand_response',
  'device_alert_dialog',
  'geofence_info',
  'message',
  'message_center',
  'metadata',
  'occupancy',
  'safety',
  'safety_summary',
  'structure',
  'structure_metadata',
  'topaz',
  'topaz_resource',
  'trip',
  'tuneups',
  'user',
  'user_settings',
  'where',
  'widget_track',
];

export const DEVICE_TYPE = {
  THERMOSTAT: 'Thermostat',
  TEMPSENSOR: 'TemperatureSensor',
  PROTECT: 'Protect',
  WEATHER: 'Weather',
  HEATLINK: 'Heatlink',
  LOCK: 'Lock',
  ALARM: 'Alarm',
  HOMEAWAY: 'HomeAway',
};

export const DEVICE_CATEGORY_MAP = {
  [DEVICE_TYPE.LOCK]: 6,
  [DEVICE_TYPE.HEATLINK]: 8,
  [DEVICE_TYPE.THERMOSTAT]: 9,
  [DEVICE_TYPE.TEMPSENSOR]: 10,
  [DEVICE_TYPE.PROTECT]: 10,
  [DEVICE_TYPE.WEATHER]: 10,
  [DEVICE_TYPE.HOMEAWAY]: 10,
  [DEVICE_TYPE.ALARM]: 11,
};


export const ACCOUNT_TYPE = {
  NEST: 'Nest',
  GOOGLE: 'Google',
};

export const LOW_BATTERY_LEVEL = 10; // Low battery level percentage

export const THERMOSTAT_MIN_TEMPERATURE = 9; // Minimum temperature for Nest Thermostat

export const THERMOSTAT_MAX_TEMPERATURE = 32; // Maximum temperature for Nest Thermostat

export const HOTWATER_MIN_TEMPERATURE = 30; // Minimum temperature for hotwater heating

export const HOTWATER_MAX_TEMPERATURE = 70; // Maximum temperature for hotwater heating

export const HOTWATER_BOOST_TIMES = [
  1800, // 30m
  3600, // 1h
  7200, // 2h
];

export const FAN_DURATION_TIMES = [
  900, // 15m
  1800, // 30m
  2700, // 45m
  3600, // 1h
  7200, // 2h
  14400, // 4h
  28800, // 8h
  43200, // 12h
  86400, // 1d
  259200, // 3d
  432000, // 5d
  604800, // 1w
];

export const LOG_LEVELS = {
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
};

export const NESTLABS_MAC_PREFIX = '18B430';

export const MIN_ELEVATION = 0;

export const MAX_ELEVATION = 8848;

