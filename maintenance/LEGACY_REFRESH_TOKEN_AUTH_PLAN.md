# Legacy refresh-token authentication plan

## Goal

Allow a Google-migrated Nest account with an existing legacy refresh-token credential to authenticate without an `issueToken`/cookie pair, while preserving the current Google cookie and pre-migration Nest account flows.

The completed branch must also be installable directly from GitHub with:

```sh
sudo hb-service stop
sudo hb-service add https://github.com/pponce/homebridge-nest-accfactory.git#addLegacyRefreshtokenAuth
sudo hb-service start
```

Secrets must never be written to logs, error messages, support dumps, generated test snapshots, or committed fixtures.

## Proposed configuration contract

Keep `type` as the account identity (`google` or `nest`) and add an explicit Google authentication method. This avoids presenting a Google account as a third account provider and leaves room for future Google credential exchanges.

```json
{
  "accounts": [
    {
      "name": "Google legacy refresh token",
      "type": "google",
      "authMethod": "refreshToken",
      "refreshToken": "<compatible legacy refresh token>",
      "fieldTest": false
    }
  ]
}
```

For backward compatibility, an omitted `authMethod` continues to mean `issueTokenCookie`, so existing configurations require no changes. Schema validation should enforce exactly the credentials required by the selected method:

| Account / method | Required | Rejected or ignored |
| --- | --- | --- |
| `google` / `issueTokenCookie` | `issueToken`, `cookie` | `refreshToken` |
| `google` / `refreshToken` | `refreshToken` | `issueToken`, `cookie` |
| `nest` | `access_token` | Google credentials and `authMethod` |

The supported value is a bare refresh token issued by the historical `homebridge-nest` flow. A serialized JSON value containing `refresh_token` is normalized at the configuration boundary. The OAuth client identity is selected internally from `fieldTest`, matching the client to which that legacy token is bound.

## Implementation phases

### 1. Characterize the legacy exchange

1. Obtain a redacted example that preserves the credential's shape (prefix, separators, and approximate component lengths), plus the former plugin name/version that created it.
2. Identify the OAuth token endpoint and required non-secret parameters from that plugin's source or provider documentation. Verify whether a client ID, client secret, redirect URI, or PKCE verifier is intrinsic to the legacy format.
3. Exercise the exchange with the real credential only in a local, unlogged probe. Record response field names and expiry behavior, not credential values.
4. Confirm that the resulting Google OAuth access token works with the existing Nest JWT exchange and session bootstrap. If it does not, document the additional exchange rather than forcing it into the cookie path.

This phase is a release gate: endpoint and client parameters must not be guessed, and a real refresh token must never be added to the repository.

### 2. Extend configuration and migration

1. Add `authMethod` and `refreshToken` to `config.schema.json`, with conditional requirements and secret/password presentation for all credential fields.
2. Update `src/config.js` to trim and normalize the new fields. Preserve existing account arrays and the current legacy top-level `nest`/`google` migration behavior.
3. If the old plugin used a well-defined top-level refresh-token property, migrate it only when the conversion is unambiguous; otherwise emit an actionable validation warning and leave the user's configuration untouched.
4. Update README examples, credential acquisition/import guidance, troubleshooting, and redaction warnings.

### 3. Add a refresh-token authenticator

1. Extract the Google OAuth acquisition step from `Connections` into a small internal authenticator boundary. Both Google methods should return a normalized object containing the OAuth access token, token type, and expiry.
2. Keep the current issueToken/cookie request as one implementation and add the legacy refresh-token exchange as the second.
3. Feed both results through the existing `issue_jwt` request, session request, `#applyAuthorisedConnection`, camera authorization, gRPC setup, and lifecycle scheduler. Do not duplicate these downstream stages.
4. Derive refresh timing from `expires_in` with the current safety margin and fallback. Continue using bounded retry backoff for transient failures.
5. Classify permanent OAuth failures such as an invalid/revoked grant separately from network and server failures, and log concise remediation without including response bodies that might contain sensitive data.
6. Ensure cleanup replaces all access-token-derived transports and camera credentials after every successful refresh.

### 4. Add automated coverage

Add focused tests for:

- schema acceptance/rejection for every row in the configuration table;
- normalization and backward compatibility when `authMethod` is omitted;
- refresh-token request method, headers, and body using a mocked fetch implementation;
- successful OAuth-to-JWT-to-session flow and propagation of refreshed runtime credentials;
- expiry scheduling and the minimum refresh interval;
- malformed OAuth responses, revoked grants, HTTP failures, retry behavior, and shutdown during an in-flight exchange;
- log/error redaction, including assertions that refresh tokens, client secrets, cookies, and access tokens are absent;
- unchanged behavior for existing issueToken/cookie and Nest `access_token` accounts.

Prefer dependency injection for HTTP requests and timers over calls to live authentication services. Keep one manual test with a real credential as an uncommitted release checklist item.

### 5. Make GitHub installation reliable

The package entry point is `dist/index.js`, while `dist` is currently ignored and generated only by the build script. A GitHub install therefore needs an explicit build lifecycle.

1. Add a `prepare` script that runs the build for Git-based installs. Do not commit generated `dist` output unless Homebridge's installer is shown not to run npm's Git dependency lifecycle.
2. Verify `npm pack --dry-run` contains `dist/index.js`, plugin modules, protobuf files, and media resources.
3. Test installation from a local Git URL/commit in a clean temporary Homebridge environment, then test the exact GitHub branch URL on a disposable Homebridge instance.
4. Confirm production installation can complete with build tooling available during `prepare`. If Homebridge omits development dependencies for Git installs, move only the required build packages to runtime dependencies or, as a documented fallback, track release-branch `dist` artifacts.
5. Use the raw URL shown above; the Markdown link form (`[url](url)`) is documentation syntax and must not be pasted into the shell.

## Acceptance criteria

- Existing Google issueToken/cookie and Nest access-token configurations start without modification.
- A valid legacy refresh-token configuration obtains a session, discovers devices, and refreshes before expiry for at least two consecutive cycles.
- Cameras receive refreshed OAuth/session credentials without restarting Homebridge.
- A revoked token produces an actionable, redacted message and bounded retries; restoring a valid credential recovers without deleting accessories.
- Invalid combinations are rejected in Config UI and safely refused at runtime.
- No authentication secret appears in normal/debug logs or support dumps.
- `npm run check` passes on the supported Node versions.
- `npm pack --dry-run` includes a runnable `dist/index.js`.
- A clean install from the `addLegacyRefreshtokenAuth` GitHub branch starts the plugin using the documented `hb-service` commands.

## Delivery sequence

Keep review risk low with these commits:

1. Configuration schema, normalization, and configuration tests.
2. Authenticator boundary, refresh-token exchange, and lifecycle/error tests.
3. Documentation and redaction review.
4. Git-install `prepare` lifecycle and clean-install verification.

Do not publish or merge until the characterization gate and the clean GitHub installation check both pass.
