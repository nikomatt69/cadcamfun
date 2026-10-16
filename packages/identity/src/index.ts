import { Hono, type Context } from "hono"
import { cors } from "hono/cors"
import {
  ACCESS_TTL_SECONDS,
  DEVICE_CODE_TTL_SECONDS,
  DEVICE_POLL_INTERVAL_SECONDS,
  isAllowedRedirect,
  isClientID,
  LEGACY_ISSUER_HOSTS,
  legacyIssuerHost,
} from "./constants.ts"
import { randomDigits, randomToken, secureEqual, sha256 } from "./crypto.ts"
import {
  consumeDeviceCode,
  createDeviceCode,
  getDeviceCode,
  hashDeviceCode,
  listPublicSigningKeys,
  markDevicePolled,
  pruneDeviceCodes,
  revokeRefreshByHash,
} from "./database.ts"
import { bearerToken, HttpError, logSignInFailure, noStore, oauthError, readForm, readJson, requestIP } from "./http.ts"
import {
  beginDeviceApproval,
  createLoginState,
  deviceConnectedPage,
  normalizeUserCode,
  passkeyOfferRoute,
  requestEmailCode,
  verifyEmailCode,
} from "./login.ts"
import {
  passkeyAuthenticationOptions,
  passkeyAuthenticationVerify,
  passkeyRegistrationOptions,
  passkeyRegistrationVerify,
  skipPasskey,
} from "./passkey.ts"
import { consumeRateLimit } from "./rate-limit.ts"
import { issueTokenPair, refreshTokenPair, verifyAccessToken } from "./tokens.ts"
import type { AuthCode, DeviceCodeRow } from "./types.ts"
import { devicePage, loginPage } from "./ui.ts"

type AppEnv = { Bindings: Env }
const app = new Hono<AppEnv>()

function formRecord(form: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {}
  form.forEach((value, key) => {
    result[key] = value
  })
  return result
}

const allowedOrigins = new Set([
  "https://cadcam.fun",
  "tauri://localhost",
  "http://tauri.localhost",
])

app.use(
  "*",
  cors({
    origin(origin) {
      return allowedOrigins.has(origin) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) ? origin : null
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
)

app.use("*", async (c, next) => {
  await next()
  if (c.req.path !== "/.well-known/jwks.json" && c.req.path !== "/.well-known/webauthn") noStore(c.res)
  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("Referrer-Policy", "no-referrer")
})

/**
 * A legacy issuer host (see LEGACY_ISSUER_HOSTS) keeps answering the endpoints
 * installed clients call directly — token, device, userinfo, revoke and the
 * well-known documents — but sends browser pages to the current issuer, so new
 * sign-ins and passkey ceremonies all run on one origin.
 */
const legacyHosts = new Set(Object.values(LEGACY_ISSUER_HOSTS))

app.use("*", async (c, next) => {
  const url = new URL(c.req.url)
  const isPage = c.req.method === "GET" || c.req.method === "HEAD"
  const isAPI = url.pathname.startsWith("/.well-known/") || url.pathname === "/userinfo" || url.pathname === "/health"
  if (!legacyHosts.has(url.hostname) || !isPage || isAPI) return next()
  const issuer = new URL(c.env.ISSUER)
  url.protocol = issuer.protocol
  url.host = issuer.host
  return c.redirect(url.toString(), 308)
})

app.onError((error, c) => {
  const status = error instanceof HttpError ? error.status : 500
  console.error(
    JSON.stringify({
      message: "identity request failed",
      method: c.req.method,
      path: c.req.path,
      status,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  return c.json(
    {
      error: status < 500 ? "invalid_request" : "server_error",
      error_description: status < 500 ? error.message : "The identity service could not complete the request",
    },
    status as 400,
  )
})

app.get("/health", (c) => c.json({ status: "ok", service: "cadcamfun-identity" }))

app.get("/authorize", async (c) => {
  const responseType = c.req.query("response_type")
  const clientID = c.req.query("client_id") ?? ""
  const redirectURI = c.req.query("redirect_uri") ?? ""
  const state = c.req.query("state") ?? ""
  const challenge = c.req.query("code_challenge") ?? ""
  const challengeMethod = c.req.query("code_challenge_method")
  if (responseType !== "code") return oauthError(c, "unsupported_response_type", "response_type must be code")
  if (!isClientID(clientID)) return oauthError(c, "invalid_client", "Unknown public client")
  if (!isAllowedRedirect(clientID, redirectURI))
    return oauthError(c, "invalid_request", "redirect_uri is not registered")
  if (!state || state.length > 512) return oauthError(c, "invalid_request", "state is required")
  if (challengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return oauthError(c, "invalid_request", "PKCE S256 is required")
  }
  const loginState = await createLoginState(c.env, {
    kind: "authorize",
    clientID,
    redirectURI,
    state,
    scope: c.req.query("scope") ?? "openid profile email offline_access",
    codeChallenge: challenge,
  })
  return loginPage(c, loginState)
})

app.post("/login/email/request", requestEmailCode)
app.post("/login/email/verify", verifyEmailCode)
app.post("/login/passkey/authentication/options", passkeyAuthenticationOptions)
app.post("/login/passkey/authentication/verify", passkeyAuthenticationVerify)
app.post("/login/passkey/registration/options", passkeyRegistrationOptions)
app.post("/login/passkey/registration/verify", passkeyRegistrationVerify)
app.post("/login/passkey/skip", skipPasskey)
app.get("/login/passkey/offer", passkeyOfferRoute)

// The CLI hands out `verification_uri_complete`, and users forward that link
// between machines — normalize whatever shape the code arrives in so the field
// is prefilled in its canonical form rather than rejected on submit.
app.get("/device", (c) => {
  const provided = c.req.query("user_code") ?? ""
  return devicePage(c, normalizeUserCode(provided) || provided.replace(/\D+/g, "").slice(0, 8))
})
app.post("/device", beginDeviceApproval)
// Where the passkey script lands after approving a device, so the confirmation
// survives a reload instead of replaying a spent authorization code.
app.get("/device/connected", deviceConnectedPage)

app.post("/oauth/device/code", async (c) => {
  const rate = await consumeRateLimit(c.env.STATE, "device-start", requestIP(c.req.raw), 20, 60)
  if (!rate.allowed) {
    c.header("Retry-After", String(rate.retryAfter))
    return c.json({ error: "rate_limited" }, 429)
  }
  // RFC 8628 specifies this request as form-encoded, and the metadata document
  // advertises the route as `device_authorization_endpoint`, so a conformant
  // client sends a form and used to get a bare 415. cadcamfun's own CLI sets a
  // JSON content-type explicitly, so reading both costs it nothing — the same
  // shape `pollDevice` below already uses.
  const body = c.req.header("content-type")?.startsWith("application/json")
    ? await readJson(c.req.raw)
    : formRecord(await readForm(c.req.raw))
  const clientID = typeof body.client_id === "string" ? body.client_id : ""
  if (!isClientID(clientID)) return oauthError(c, "invalid_client", "Unknown public client")
  const now = Date.now()
  // Expired codes hold their `user_code` against every later sign-in, so clear
  // them before drawing one. This is the only writer of the table, so it is
  // also the only place the cleanup can live without a scheduled worker.
  await pruneDeviceCodes(c.env.DB, now).catch(() => 0)
  const scope = typeof body.scope === "string" ? body.scope : "openid profile email offline_access"
  const expiresAt = now + DEVICE_CODE_TTL_SECONDS * 1000
  // A taken `user_code` is not a failure, it is a redraw. Three attempts put
  // the odds of giving up below any rate the table can reach.
  let created: { deviceCode: string; userCode: string } | undefined
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const deviceCode = randomToken(48)
    const userDigits = randomDigits(8)
    const userCode = `${userDigits.slice(0, 4)}-${userDigits.slice(4)}`
    const row: DeviceCodeRow = {
      device_code_hash: await hashDeviceCode(deviceCode),
      user_code: userCode,
      client_id: clientID,
      scope,
      status: "pending",
      account_id: null,
      expires_at: expiresAt,
      last_poll_at: null,
      created_at: now,
    }
    if (await createDeviceCode(c.env.DB, row)) created = { deviceCode, userCode }
  }
  if (!created) return oauthError(c, "temporarily_unavailable", "Could not allocate a device code", 503)
  const { deviceCode, userCode } = created
  const verificationURL = new URL("/device", c.env.ISSUER).toString()
  return c.json({
    device_code: deviceCode,
    user_code: userCode,
    // `verification_url` is the name cadcamfun's own clients read and cannot be
    // dropped; `verification_uri` is the one RFC 8628 defines, and without it a
    // conformant client sees the complete URI but no base to fall back on.
    verification_url: verificationURL,
    verification_uri: verificationURL,
    verification_uri_complete: `${verificationURL}?user_code=${encodeURIComponent(userCode)}`,
    interval: DEVICE_POLL_INTERVAL_SECONDS,
    expires_in: DEVICE_CODE_TTL_SECONDS,
  })
})

async function pollDevice(c: Context<AppEnv>, provided?: Record<string, unknown>) {
  const body =
    provided ??
    (c.req.header("content-type")?.startsWith("application/json")
      ? await readJson(c.req.raw)
      : formRecord(await readForm(c.req.raw)))
  const clientID = typeof body.client_id === "string" ? body.client_id : ""
  const deviceCode = typeof body.device_code === "string" ? body.device_code : ""
  if (!isClientID(clientID) || !deviceCode) {
    logSignInFailure(c, "device-poll", "malformed-request", { client: clientID || null })
    return c.json({ status: "expired" })
  }
  const hash = await hashDeviceCode(deviceCode)
  const row = await getDeviceCode(c.env.DB, hash)
  const now = Date.now()
  // Four very different situations answered one indistinguishable "expired":
  // a code the issuer never had, a code polled by the wrong client, a code the
  // user simply did not approve in time, and one already redeemed. Only the
  // third is a lifetime problem, and telling them apart is the whole point of
  // logging here — the wire answer stays exactly as it was.
  if (!row || row.client_id !== clientID || row.expires_at <= now || row.status === "consumed") {
    logSignInFailure(c, "device-poll", "expired", {
      client: clientID,
      cause: !row
        ? "unknown-code"
        : row.client_id !== clientID
          ? "client-mismatch"
          : row.status === "consumed"
            ? "already-redeemed"
            : "lapsed",
      status: row?.status ?? null,
      // How long the code outlived its window, for a lapsed one: the number
      // that says whether the lifetime is the problem.
      lateBySeconds: row && row.expires_at <= now ? Math.round((now - row.expires_at) / 1000) : null,
    })
    return c.json({ status: "expired" })
  }
  if (row.status === "denied") return c.json({ status: "denied" })
  if (row.status === "pending") {
    const tooFast = row.last_poll_at !== null && now - row.last_poll_at < DEVICE_POLL_INTERVAL_SECONDS * 1000
    await markDevicePolled(c.env.DB, hash, now)
    return c.json(
      tooFast
        ? { status: "slow_down", interval: DEVICE_POLL_INTERVAL_SECONDS + 5 }
        : { status: "pending", interval: DEVICE_POLL_INTERVAL_SECONDS },
    )
  }
  if (!row.account_id || !(await consumeDeviceCode(c.env.DB, hash, now))) return c.json({ status: "expired" })
  return c.json({
    status: "success",
    ...(await issueTokenPair(c.env, row.account_id, row.client_id, now)),
  })
}

app.post("/oauth/device/token", (c) => pollDevice(c))

async function exchangeToken(c: Context<AppEnv>) {
  const rate = await consumeRateLimit(c.env.STATE, "token", requestIP(c.req.raw), 60, 60)
  if (!rate.allowed) {
    c.header("Retry-After", String(rate.retryAfter))
    return oauthError(c, "temporarily_unavailable", "Too many token requests", 429)
  }
  const form = await readForm(c.req.raw)
  const grantType = form.get("grant_type")
  if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
    return pollDevice(c, formRecord(form))
  }
  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? ""
    const requested = form.get("client_id") ?? ""
    if (!refreshToken || (requested && !isClientID(requested))) {
      return oauthError(c, "invalid_request", "Valid refresh_token and client_id are required")
    }
    const pair = await refreshTokenPair(c.env, refreshToken, requested && isClientID(requested) ? requested : undefined)
    return pair ? c.json(pair) : oauthError(c, "invalid_grant", "Refresh token is invalid or reused")
  }
  if (grantType !== "authorization_code") {
    return oauthError(c, "unsupported_grant_type", "Unsupported grant_type")
  }
  const code = form.get("code") ?? ""
  const verifier = form.get("code_verifier") ?? ""
  const clientID = form.get("client_id") ?? ""
  const redirectURI = form.get("redirect_uri") ?? ""
  if (!code || !verifier || !isClientID(clientID)) {
    return oauthError(c, "invalid_request", "code, code_verifier, and client_id are required")
  }
  const key = `authcode:${await sha256(code)}`
  const authorization = await c.env.STATE.get<AuthCode>(key, "json")
  if (!authorization) return oauthError(c, "invalid_grant", "Authorization code is invalid or expired")
  const challenge = await sha256(verifier)
  if (
    authorization.clientID !== clientID ||
    authorization.redirectURI !== redirectURI ||
    !(await secureEqual(challenge, authorization.codeChallenge))
  ) {
    return oauthError(c, "invalid_grant", "Authorization code binding or PKCE validation failed")
  }
  await c.env.STATE.delete(key)
  return c.json(await issueTokenPair(c.env, authorization.accountID, authorization.clientID))
}

app.post("/token", exchangeToken)
app.post("/oauth/token", exchangeToken)

app.post("/revoke", async (c) => {
  const form = await readForm(c.req.raw)
  const token = form.get("token")
  if (token) await revokeRefreshByHash(c.env.DB, await sha256(token), Date.now())
  return new Response(null, { status: 200 })
})

app.get("/userinfo", async (c) => {
  const token = bearerToken(c.req.raw)
  if (!token) return oauthError(c, "invalid_token", "Bearer access token is required", 401)
  const identity = await verifyAccessToken(c.env, token)
  if (!identity) return oauthError(c, "invalid_token", "Access token is invalid or expired", 401)
  return c.json({
    id: identity.account.id,
    sub: identity.account.id,
    email: identity.account.email,
    created_at: identity.account.created_at,
    updated_at: identity.account.updated_at,
  })
})

app.get("/.well-known/jwks.json", async (c) => {
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
  return c.json({ keys: await listPublicSigningKeys(c.env.DB) })
})

app.get("/.well-known/oauth-authorization-server", (c) =>
  c.json({
    issuer: c.env.ISSUER,
    authorization_endpoint: new URL("/authorize", c.env.ISSUER).toString(),
    token_endpoint: new URL("/token", c.env.ISSUER).toString(),
    revocation_endpoint: new URL("/revoke", c.env.ISSUER).toString(),
    device_authorization_endpoint: new URL("/oauth/device/code", c.env.ISSUER).toString(),
    userinfo_endpoint: new URL("/userinfo", c.env.ISSUER).toString(),
    jwks_uri: new URL("/.well-known/jwks.json", c.env.ISSUER).toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    access_token_ttl: ACCESS_TTL_SECONDS,
  }),
)

/**
 * WebAuthn Related Origin Requests: lets the current issuer origin use passkeys
 * whose RP ID is the legacy issuer host. The browser fetches this from the RP ID
 * host, so it matters on the legacy host and is harmless on the current one.
 */
app.get("/.well-known/webauthn", (c) => {
  if (!legacyIssuerHost(c.env.ISSUER)) return c.notFound()
  c.header("Cache-Control", "public, max-age=3600")
  return c.json({ origins: [new URL(c.env.ISSUER).origin] })
})

app.get("/.well-known/cadcamfun/issuer", (c) => c.text(c.env.ISSUER))
app.get("/.well-known/cadcamfun", (c) =>
  c.json({
    issuer: c.env.ISSUER,
    authorization_endpoint: new URL("/authorize", c.env.ISSUER).toString(),
    token_endpoint: new URL("/oauth/token", c.env.ISSUER).toString(),
    device_authorization_endpoint: new URL("/oauth/device/code", c.env.ISSUER).toString(),
    device_token_endpoint: new URL("/oauth/device/token", c.env.ISSUER).toString(),
    jwks_uri: new URL("/.well-known/jwks.json", c.env.ISSUER).toString(),
    auth: {
      command: ["curl", "-fsS", new URL("/.well-known/cadcamfun/issuer", c.env.ISSUER).toString()],
      env: "CADCAMFUN_ACCOUNT_URL",
    },
  }),
)

export default app
