import assert from 'node:assert/strict';
import test from 'node:test';
import { URLSearchParams } from 'node:url';

import {
  exchangeGoogleRefreshToken,
  GOOGLE_NEST_CLIENT_ID,
  GOOGLE_NEST_FIELD_TEST_CLIENT_ID,
  GOOGLE_TOKEN_ENDPOINT,
  parseLegacyRefreshToken,
} from '../src/auth.js';

test('parseLegacyRefreshToken accepts a bare token', () => {
  assert.deepEqual(parseLegacyRefreshToken('  refresh-value  '), { refreshToken: 'refresh-value' });
});

test('legacy credentials reject malformed input and accept supported JSON field names', async () => {
  for (const value of [undefined, '', ' ', '{invalid']) {
    assert.equal(parseLegacyRefreshToken(value), undefined);
  }
  assert.deepEqual(parseLegacyRefreshToken('{}'), { refreshToken: '', clientId: '', clientSecret: '' });
  assert.deepEqual(parseLegacyRefreshToken('{"refreshToken":"token","clientId":"id","clientSecret":"secret"}'),
    { refreshToken: 'token', clientId: 'id', clientSecret: 'secret' });
  await assert.rejects(exchangeGoogleRefreshToken({ refreshToken: 'token' }), TypeError);
  await assert.rejects(exchangeGoogleRefreshToken(undefined), /refresh token/);
  await assert.rejects(exchangeGoogleRefreshToken({ refreshToken: 'token' }, async () => ({
    json: async () => ({}),
  })), /no access token/);
});

test('parseLegacyRefreshToken accepts legacy serialized credentials', () => {
  assert.deepEqual(
    parseLegacyRefreshToken(JSON.stringify({ refresh_token: 'refresh-value', client_id: 'client-id', client_secret: 'client-secret' })),
    { refreshToken: 'refresh-value', clientId: 'client-id', clientSecret: 'client-secret' },
  );
});

test('exchangeGoogleRefreshToken sends a form request and normalizes the response', async () => {
  let observed;
  let result = await exchangeGoogleRefreshToken(
    { refreshToken: 'refresh-value', userAgent: 'test-agent' },
    async (method, url, options, body) => {
      observed = { method, url, options, body: body.toString() };
      return {
        async json() {
          return { access_token: 'access-value', expires_in: 3600, token_type: 'Bearer' };
        },
      };
    },
  );

  assert.equal(observed.method, 'post');
  assert.equal(observed.url, GOOGLE_TOKEN_ENDPOINT);
  assert.equal(observed.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(observed.options.headers['User-Agent'], 'test-agent');
  assert.equal(observed.options.timeout, 40000);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(observed.body)), {
    client_id: GOOGLE_NEST_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: 'refresh-value',
  });
  assert.deepEqual(result, { access_token: 'access-value', expires_in: 3600, token_type: 'Bearer' });
});

test('exchangeGoogleRefreshToken selects the historical field-test client', async () => {
  let body;
  await exchangeGoogleRefreshToken(
    {
      refreshToken: 'refresh-value',
      fieldTest: true,
    },
    async (method, url, options, requestBody) => {
      body = requestBody.toString();
      return { json: async () => ({ access_token: 'access-value', expires_in: 3600 }) };
    },
  );

  assert.equal(new URLSearchParams(body).get('client_id'), GOOGLE_NEST_FIELD_TEST_CLIENT_ID);
  assert.equal(new URLSearchParams(body).has('client_secret'), false);
});

test('exchangeGoogleRefreshToken validates credentials without exposing them', async () => {
  await assert.rejects(exchangeGoogleRefreshToken({ refreshToken: '' }), (error) => {
    assert.equal(error.message.includes('sensitive-refresh-token'), false);
    assert.match(error.message, /refresh token/);
    return true;
  });
});

test('exchangeGoogleRefreshToken redacts provider error descriptions', async () => {
  await assert.rejects(
    exchangeGoogleRefreshToken({ refreshToken: 'refresh-value' }, async () => ({
      json: async () => ({ error: 'invalid_grant', error_description: 'revoked refresh-value' }),
    })),
    (error) => {
      assert.equal(error.code, 'invalid_grant');
      assert.equal(error.message, 'Google refresh-token exchange failed (invalid_grant)');
      assert.equal(error.message.includes('refresh-value'), false);
      return true;
    },
  );
});
