# Google OAuth Activation

BazaarLens uses Google Identity Services in popup mode on the web console. The browser receives a Google-signed ID token and posts it to `/auth/google`; the API verifies that token with `GOOGLE_CLIENT_ID` as the expected audience. This current sign-in flow needs the web client ID, not a Google client secret. Add a client secret only if the app later moves to a server-side authorization-code callback or requests Google API scopes/refresh tokens.

Official references:

- Google Identity Services setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Google JavaScript API reference: https://developers.google.com/identity/gsi/web/reference/js-reference

## Google Cloud Setup

1. Open Google Cloud Console and create or choose the project for BazaarLens.
2. Configure OAuth branding and consent settings for BazaarLens.
3. Create an OAuth 2.0 client of type `Web application`.
4. Add these Authorized JavaScript origins:

```text
https://bazaarlens.xyz
https://www.bazaarlens.xyz
```

For local testing, also add:

```text
http://localhost
http://localhost:3000
```

5. Copy the client ID. It should look like:

```text
1234567890-abcdef.apps.googleusercontent.com
```

The current BazaarLens web flow uses `ux_mode: "popup"` and a JavaScript callback, so it does not need an Authorized redirect URI unless the web implementation changes to redirect mode.

## Deploy

From the repo root:

```bash
GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com pnpm deploy:google-oauth
```

The deploy helper updates both server-side and public browser config in `/opt/bazaarlens/.env`:

```text
GOOGLE_CLIENT_ID=...
VITE_GOOGLE_CLIENT_ID=...
```

It then recreates only the BazaarLens API and web containers and checks:

- `https://api.bazaarlens.xyz/health/ready` reports `google: configured`
- `https://bazaarlens.xyz/bazaarlens-config.js` exposes the public Google client ID

## Strict Verification

Run these before a demo that claims Google auth is live:

```bash
pnpm prod:check:google -- deploy/production.env
pnpm live:check:google -- deploy/production.env
REQUIRE_GOOGLE=1 pnpm smoke:live:web
```

Pass whichever local production env file you are validating. On the hackathon server, run the same commands from `/opt/bazaarlens` with `.env` as the env path.
