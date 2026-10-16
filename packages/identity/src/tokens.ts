import { decodeProtectedHeader, importJWK, jwtVerify, SignJWT, type JWK } from "jose"
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, type ClientID } from "./constants.ts"
import { createID, randomToken, sha256 } from "./crypto.ts"
import {
  getAccount,
  getRefreshToken,
  getSigningKey,
  insertRefreshToken,
  pruneRefreshTokens,
  revokeRefreshFamily,
  rotateRefreshToken,
} from "./database.ts"
import type { Account, RefreshTokenRow, SigningKeyRow } from "./types.ts"

export type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

async function signAccessToken(env: Env, account: Account, clientID: ClientID, now: number): Promise<string> {
  const key = await getSigningKey(env.DB, now)
  const privateKey = await importJWK(JSON.parse(key.private_jwk) as JWK, "ES256")
  const issuedAt = Math.floor(now / 1000)
  return new SignJWT({ email: account.email, client_id: clientID })
    .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: "JWT" })
    .setIssuer(env.ISSUER)
    .setSubject(account.id)
    .setAudience(env.AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TTL_SECONDS)
    .setJti(createID("jwt", now))
    .sign(privateKey)
}

function refreshRow(
  accountID: string,
  clientID: ClientID,
  familyID: string,
  tokenHash: string,
  now: number,
): RefreshTokenRow {
  return {
    id: createID("rft", now),
    account_id: accountID,
    token_hash: tokenHash,
    client_id: clientID,
    family_id: familyID,
    expires_at: now + REFRESH_TTL_SECONDS * 1000,
    rotated_at: null,
    revoked_at: null,
    created_at: now,
  }
}

export async function issueTokenPair(
  env: Env,
  accountID: string,
  clientID: ClientID,
  now = Date.now(),
): Promise<TokenPair> {
  const account = await getAccount(env.DB, accountID)
  if (!account || account.disabled_at !== null) throw new Error("account is unavailable")
  const refreshToken = randomToken(48)
  const row = refreshRow(account.id, clientID, createID("fam", now), await sha256(refreshToken), now)
  const accessToken = await signAccessToken(env, account, clientID, now)
  await insertRefreshToken(env.DB, row)
  // Here rather than in `refreshTokenPair`: this runs once per sign-in, that
  // one runs every fifteen minutes per client, and a `DELETE` on the hot
  // refresh path would cost far more than the rows it reclaims. Never fatal —
  // a token was just issued and a failed cleanup must not undo it.
  await pruneRefreshTokens(env.DB, now).catch(() => 0)
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TTL_SECONDS,
    token_type: "Bearer",
  }
}

export async function refreshTokenPair(
  env: Env,
  refreshToken: string,
  requestedClientID: ClientID | undefined,
  now = Date.now(),
): Promise<TokenPair | null> {
  const previous = await getRefreshToken(env.DB, await sha256(refreshToken))
  if (!previous) return null
  if (
    previous.rotated_at !== null ||
    previous.revoked_at !== null ||
    previous.expires_at <= now ||
    (requestedClientID !== undefined && requestedClientID !== previous.client_id)
  ) {
    await revokeRefreshFamily(env.DB, previous.family_id, now)
    return null
  }

  const account = await getAccount(env.DB, previous.account_id)
  if (!account || account.disabled_at !== null) {
    await revokeRefreshFamily(env.DB, previous.family_id, now)
    return null
  }

  const nextRaw = randomToken(48)
  const next = refreshRow(account.id, previous.client_id, previous.family_id, await sha256(nextRaw), now)
  const rotated = await rotateRefreshToken(env.DB, previous, next, now)
  if (!rotated) {
    await revokeRefreshFamily(env.DB, previous.family_id, now)
    return null
  }
  const accessToken = await signAccessToken(env, account, previous.client_id, now)
  return {
    access_token: accessToken,
    refresh_token: nextRaw,
    expires_in: ACCESS_TTL_SECONDS,
    token_type: "Bearer",
  }
}

export async function verifyAccessToken(
  env: Env,
  token: string,
): Promise<{ account: Account; clientID: ClientID } | null> {
  let header: ReturnType<typeof decodeProtectedHeader>
  try {
    header = decodeProtectedHeader(token)
  } catch {
    return null
  }
  if (header.alg !== "ES256" || typeof header.kid !== "string") return null

  const row = await env.DB.prepare("SELECT * FROM signing_keys WHERE kid = ?").bind(header.kid).first<SigningKeyRow>()
  if (!row) return null
  try {
    const publicKey = await importJWK(JSON.parse(row.public_jwk) as JWK, "ES256")
    const result = await jwtVerify(token, publicKey, {
      issuer: env.ISSUER,
      audience: env.AUDIENCE,
      algorithms: ["ES256"],
      clockTolerance: 60,
    })
    if (typeof result.payload.sub !== "string" || typeof result.payload.client_id !== "string") return null
    const account = await getAccount(env.DB, result.payload.sub)
    if (!account || account.disabled_at !== null) return null
    return { account, clientID: result.payload.client_id as ClientID }
  } catch {
    return null
  }
}
