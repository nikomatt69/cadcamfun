# CADCAMFUN account identity

Status: implementation in progress. Owner-requested cross-WP integration: new `packages/identity`, API auth contract, sidecar auth/config/repository/layers and companion route policy, desktop auth/session UI, mobile auth/storage/transport/UI, workspace dependencies and lockfile.

## Contract

A dedicated Cloudflare identity issuer follows `/Volumes/SSD/Projects/nikcli/packages/identity`: Emailed sign-in codes, optional passkeys, OAuth authorization code with PKCE S256, ES256 access JWTs, rotating refresh tokens with reuse detection, discovery/JWKS and revocation. Cloud D1 and KV are independent of the installation SQLite database. No nikcli account or infrastructure identifiers are reused. Default issuer: `https://auth.cadcam.fun`; audience: `cadcamfun-api`. Local development permits HTTP only on loopback. Production provisioning and verified Cloudflare Email Sending are deployment prerequisites.

Desktop account login is optional: startup remains local with no login gate, and sign-out returns to the local profile. Desktop uses a temporary loopback callback owned by the sidecar Layer. Auth API exposes start, poll and cancel; callbacks validate state and use a single-use PKCE verifier. Pending flows expire and close on cancellation, completion and shutdown. The desktop stores OAuth tokens in the existing OS keyring. Mobile uses Expo AuthSession and its registered `cadcamfun://auth/callback` scheme, storing OAuth tokens in SecureStore. Refresh is serialized; sign-out revokes refresh tokens and clears local credentials. Tokens are never stored in localStorage.

The `x-identity-token` header carries identity access JWTs; `x-session-token` retains local installation sessions. The sidecar verifies ES256 signature, configured issuer, audience, expiry and client before resolving a local User through Account(providerId=issuer, accountId=subject). Identity linking uses the issuer subject, never an unverified email assertion; existing local accounts are not automatically linked by email. A supplied invalid identity credential fails closed. No credentials means the existing local profile behavior. Identity sessions retain the JWT's short expiry through refresh; OAuth does not grant extra project permissions.

Pairing remains independent of account sign-in. The pinned companion transport forwards the account header and allows only auth session read in addition to its existing scoped routes. Signing in as the same identity on desktop and phone resolves the same local User. Account changes invalidate cached project data and assistant state.

## Verification

Issuer tests: discovery, redirect registration, email-code safety, account linking, passkeys and refresh rotation. Sidecar integration: real signed JWT/JWKS, invalid issuer/audience/expiry/signature, stable user mapping, scoped gateway forwarding, loopback PKCE success/state rejection/cancellation. Desktop/mobile: token parsing, refresh serialization, secure storage lifecycle, login/error/cancel/logout and app session propagation. Typecheck all affected packages, generate and check clients, build desktop and mobile JS bundles.

## Change log

- 2026-10-16: established the owner-requested identity and native OAuth contracts before cross-WP changes.

## Domain and Cloudflare deployment (2026-10-16)

Owner-requested domain migration applies repository-wide: `cadcam.fun` is the canonical website, `/docs` holds documentation, and `auth.cadcam.fun` is the dedicated OAuth issuer. `dev.auth.cadcam.fun` is an isolated staging issuer. The web Worker serves only `cadcam.fun`; documentation and all other website sections use path routes such as `/docs`. Cloudflare Workers host both services; identity uses D1, KV and Email Sending, web uses Workers AI, KV rate limiting and R2 artifacts. Wrangler owns custom domains and resource bindings. Never reuse nikcli resource identifiers. Native desktop sidecar and paired mobile gateway remain local and the desktop account remains optional. This domain/configuration task does not resume the paused OAuth implementation goal.

- 2026-10-16: owner selected email codes and passkeys; removed GitHub as an account sign-in provider. Identity credentials resolve to application User/Account rows after signature verification.

- Deployment follow-up: exclude serialized DocViewer3D scene data from Tailwind class scanning; this does not alter rendered geometry and prevents the site build from stalling before Cloudflare deployment.

- 2026-10-16: owner consolidated the website on the apex domain; removed separate documentation and site subdomains from Worker routing and identity CORS.

- 2026-10-20: the first identity account that signs in on an installation adopts the installation's local profile (reaching sign-in already needs the desktop's own token), so projects created locally belong to that account on desktop and phone; an adopted-before-this-change empty identity user is moved onto the local profile. Later accounts still get separate users and email never links accounts. The companion gateway now also allows `POST /api/projects`, so the phone can create projects owned by the signed-in account.
