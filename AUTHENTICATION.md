# Account setup

Open **Homebridge → Plugins → Nest Climate Cntrl → Settings → Account**. Add the account that owns your devices. Multiple accounts are supported.

## Google account: issue token and cookie

Choose **Google → Issue token and cookie**.

Using Safari's Web Inspector:

1. Open a private window, enable the Develop menu in Safari settings and open **Develop → Show Web Inspector → Network**.
2. Enable **Preserve Log/Requests**, then sign in with Google at [home.nest.com](https://home.nest.com).
3. Find the `iframerpc` request whose URL contains `issueToken`.
4. Copy the full request URL into **Issue token**, and its **Cookie** request header into **Cookie**.
5. Save and restart the plugin's bridge. Do not sign out of that Nest session; doing so can invalidate the credentials.

These are unofficial account credentials and may expire or be revoked. Re-capture them if Google rejects them.

## Google account: existing legacy refresh token

Choose **Google → Existing legacy refresh token**, then paste your compatible token. A JSON credential containing `refresh_token` is also accepted.

This option is for credentials already issued by compatible legacy Nest sign-in tools. The plugin cannot generate new legacy tokens or restore revoked ones. It does not silently fall back to cookie authentication.

## Legacy Nest account

Choose **Nest** and enter your access token. Sign in with Nest at [home.nest.com](https://home.nest.com), then open [home.nest.com/session](https://home.nest.com/session) and copy the top-level `access_token` value. Do not sign out afterward.

Device availability depends on the account and backend; the climate features use devices reported by the Nest/Google connection.

## Connection checks

After saving, restart the bridge and open **Diagnostics**. Account authorization and the device update connection are shown separately.

Treat cookies, access tokens and refresh tokens as passwords. Do not include them in issues, screenshots or shared configuration. No Google SDM/Device Access project is needed.
