# CADCAMFUN identity

Dedicated Cloudflare Worker at `https://auth.cadcam.fun`. Staging uses `https://dev.auth.cadcam.fun` and separate D1/KV resources.

Sign in with an emailed code; optionally enroll a passkey for subsequent sign-ins. GitHub is not an account sign-in provider. OAuth 2.1 authorization-code + PKCE S256 is the protocol used by native clients, independent of the sign-in method. Access tokens are ES256 JWTs for the `cadcamfun-api` audience; refresh tokens rotate and detect family reuse. Discovery, JWKS, revocation and device authorization are available.

## Application account

The issuer stores the verified account and authentication methods in Cloudflare D1. The CADCAMFUN sidecar verifies the access token against the configured issuer's JWKS and links `(issuer, subject)` to the existing application `Account` and `User` tables. Desktop and phone credentials for the same subject resolve to the same application user. Email alone never takes over an existing local account. Projects retain their existing ownership checks. Desktop login is optional; no identity credential keeps the installation's local profile.

Production issuer: `https://auth.cadcam.fun`. Override the sidecar with `CADCAMFUN_IDENTITY_ISSUER` for local or staging tests. Registered public clients:

- `cadcamfun-desktop`: `http://127.0.0.1:<ephemeral-port>/callback`.
- `cadcamfun-mobile`: `cadcamfun://auth/callback`.

The native UI integration is tracked in `specs/30-identity.md`; deployment of this service alone does not install an updated native app.

## Cloudflare

`wrangler.jsonc` owns the custom domains, D1, KV and Email Sending binding. Resource IDs belong exclusively to CADCAMFUN. `workers.dev` and preview URLs are disabled so OAuth uses the configured issuer origin. Cloudflare Email Sending must be enabled for `cadcam.fun`; the sender is `auth@cadcam.fun`. No external OAuth app or GitHub secrets are required.

From this package:

```sh
bun run types
bun run typecheck
bun test test
bun run migrate:local
bun run dev
bun run deploy
bun run deploy:staging
```

Deployment applies D1 migrations before publishing the Worker. On a new account, provision D1 first and record its ID; Wrangler can provision a missing KV binding during deployment. Production and staging bindings are deliberately separate.
