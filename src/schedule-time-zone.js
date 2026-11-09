import { validTimeZone } from '../homebridge-ui/public/climate-utils.js';

function zoneFromTraits(resource) {
  // TimezoneTrait contains a wrapped timezoneName; labels can differ by resource.
  const zones = new Set(
    Object.values(resource?.value ?? {})
      .map((trait) => validTimeZone(trait?.timezoneName?.value ?? trait?.timezoneName))
      .filter(Boolean),
  );
  return zones.size === 1 ? [...zones][0] : null;
}

export function reportedScheduleTimeZone(rawData, deviceKey) {
  const device = rawData?.[deviceKey];
  const home = rawData?.[device?.value?.device_info?.pairerId?.resourceId];
  const thermostatZone = zoneFromTraits(device);
  const homeZone = zoneFromTraits(home);
  return {
    schedule_time_zone: thermostatZone ?? homeZone,
    schedule_time_zone_source: thermostatZone ? 'thermostat' : homeZone ? 'home' : null,
  };
}
