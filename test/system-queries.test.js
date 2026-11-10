// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
// Follow real GET dispatch to weather requests with deterministic cloud responses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { platformHarness } from './helpers/platform-harness.js';

let weather = {
  now: {
    current_temperature: 21.2,
    current_humidity: 45,
    conditions: 'Sunny',
    wind_direction: 'N',
    current_wind: 12,
    sunrise: 100,
    sunset: 200,
  },
  forecast: { daily: [{ conditions: 'Cloudy' }] },
  display_city: 'Fixture City',
};
for (let [label, response, expected] of [
  [
    'complete',
    weather,
    { current_temperature: 21.2, current_humidity: 45, condition: 'Sunny', station: 'Fixture City', forecast: 'Cloudy' },
  ],
  ['API error', { error: 'Unavailable' }, undefined],
  ['missing fields', { now: {} }, undefined],
]) {
  test('platform weather GET: ' + label, async (context) => {
    let flow = await platformHarness(context, {
      value: { weather: { postal_code: '2000', country_code: 'AU' } },
      fetch: async () => ({ json: async () => response }),
    });
    let result = await flow.device.get({ uuid: 'DEVICE_TEST', location_weather: true });
    if (expected === undefined) {
      assert.equal(result.location_weather, undefined);
    } else {
      assert.partialDeepStrictEqual(result.location_weather, expected);
    }
    assert.equal(new URL(flow.requests.at(-1)[1]).pathname, '/api/0.1/weather/forecast/2000,AU');
  });
}
for (let [label, override] of [
  ['missing token', { token: '' }],
  ['unauthorised', { authorised: false }],
]) {
  test('weather GET skips unavailable account: ' + label, async (context) => {
    let flow = await platformHarness(context, { value: { weather: { postal_code: '2000', country_code: 'AU' } } });
    Object.assign(flow.connection, override);
    let before = flow.requests.length;
    assert.equal((await flow.device.get({ uuid: 'DEVICE_TEST', location_weather: true })).location_weather, undefined);
    assert.equal(flow.requests.length, before);
  });
}
