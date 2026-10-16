import { createID, createSigningJwks, sha256 } from "./crypto.ts"
import { RETIRED_KEY_PUBLICATION_SECONDS, SIGNING_KEY_ROTATION_SECONDS } from "./constants.ts"
import type { Account, DeviceCodeRow, PasskeyRow, RefreshTokenRow, SigningKeyRow } from "./types.ts"

function changes(result: D1Result<unknown>): number {
  return result.meta.changes ?? 0
}

export async function getAccount(db: D1Database, accountID: string): Promise<Account | null> {
  return db
    .prepare("SELECT id, email, created_at, updated_at, disabled_at FROM accounts WHERE id = ?")
    .bind(accountID)
    .first<Account>()
}

export async function linkAccount(
  db: D1Database,
  provider: "email",
  subject: string,
  emailInput: string,
  now = Date.now(),
): Promise<Account> {
  const email = emailInput.trim().toLowerCase()
  const linked = await db
    .prepare(
      "SELECT a.id, a.email, a.created_at, a.updated_at, a.disabled_at FROM accounts a JOIN auth_methods m ON m.account_id = a.id WHERE m.provider = ? AND m.subject = ?",
    )
    .bind(provider, subject)
    .first<Account>()
  if (linked) return linked

  let account = await db
    .prepare("SELECT id, email, created_at, updated_at, disabled_at FROM accounts WHERE email = ? COLLATE NOCASE")
    .bind(email)
    .first<Account>()

  if (!account) {
    const id = createID("acc", now)
    await db
      .prepare("INSERT OR IGNORE INTO accounts (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(id, email, now, now)
      .run()
    account = await db
      .prepare("SELECT id, email, created_at, updated_at, disabled_at FROM accounts WHERE email = ? COLLATE NOCASE")
      .bind(email)
      .first<Account>()
  }
  if (!account) throw new Error("account creation failed")

  await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO auth_methods (id, account_id, provider, subject) VALUES (?, ?, ?, ?)")
      .bind(createID("auth", now), account.id, provider, subject),
    db
      .prepare("INSERT OR IGNORE INTO auth_methods (id, account_id, provider, subject) VALUES (?, ?, 'email', ?)")
      .bind(createID("auth", now + 1), account.id, email),
    db.prepare("UPDATE accounts SET updated_at = ? WHERE id = ?").bind(now, account.id),
  ])

  const authoritative = await db
    .prepare(
      "SELECT a.id, a.email, a.created_at, a.updated_at, a.disabled_at FROM accounts a JOIN auth_methods m ON m.account_id = a.id WHERE m.provider = ? AND m.subject = ?",
    )
    .bind(provider, subject)
    .first<Account>()
  if (!authoritative) throw new Error("account linking failed")
  return authoritative
}

export async function getDeviceCode(db: D1Database, deviceHash: string): Promise<DeviceCodeRow | null> {
  return db.prepare("SELECT * FROM device_codes WHERE device_code_hash = ?").bind(deviceHash).first<DeviceCodeRow>()
}

export async function getDeviceByUserCode(db: D1Database, userCode: string): Promise<DeviceCodeRow | null> {
  return db.prepare("SELECT * FROM device_codes WHERE user_code = ?").bind(userCode).first<DeviceCodeRow>()
}

/**
 * Drop device codes that can no longer be used.
 *
 * Nothing else ever deleted from this table, and `user_code` is `UNIQUE`: every
 * eight-digit code ever issued stayed reserved forever, so the space a new code
 * is drawn from shrank on every sign-in and the `INSERT` eventually started
 * losing to a code somebody used months ago — surfacing as a 500 from
 * `/oauth/device/code` and "Failed to start device code flow" in the terminal.
 * A code past `expires_at` cannot be approved, polled, or consumed, so keeping
 * the row buys nothing.
 */
export async function pruneDeviceCodes(db: D1Database, now: number): Promise<number> {
  return changes(await db.prepare("DELETE FROM device_codes WHERE expires_at <= ?").bind(now).run())
}

/**
 * Insert a device code, reporting rather than throwing when the generated
 * `user_code` is already taken. The caller draws another one; a bare `INSERT`
 * turned that collision into a 500.
 */
export async function createDeviceCode(db: D1Database, row: DeviceCodeRow): Promise<boolean> {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO device_codes (device_code_hash, user_code, client_id, scope, status, account_id, expires_at, last_poll_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.device_code_hash,
      row.user_code,
      row.client_id,
      row.scope,
      row.status,
      row.account_id,
      row.expires_at,
      row.last_poll_at,
      row.created_at,
    )
    .run()
  return changes(result) === 1
}

export async function setDeviceDecision(
  db: D1Database,
  userCode: string,
  decision: "approved" | "denied",
  accountID: string | null,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE device_codes SET status = ?, account_id = ? WHERE user_code = ? AND status = 'pending' AND expires_at > ?",
    )
    .bind(decision, accountID, userCode, now)
    .run()
  return changes(result) === 1
}

export async function markDevicePolled(db: D1Database, deviceHash: string, now: number): Promise<void> {
  await db.prepare("UPDATE device_codes SET last_poll_at = ? WHERE device_code_hash = ?").bind(now, deviceHash).run()
}

export async function consumeDeviceCode(db: D1Database, deviceHash: string, now: number): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE device_codes SET status = 'consumed' WHERE device_code_hash = ? AND status = 'approved' AND expires_at > ?",
    )
    .bind(deviceHash, now)
    .run()
  return changes(result) === 1
}

/**
 * Drop refresh tokens that can no longer be presented.
 *
 * Same omission as `device_codes`, with a much faster clock: an access token
 * lives fifteen minutes, so every signed-in client rotates its refresh token
 * about a hundred times a day and each rotation leaves the superseded row
 * behind forever. Unlike a user code, a spent row is never *wrong* — the hash
 * is 48 random bytes — so this is growth rather than breakage, which is exactly
 * why it would have gone unnoticed until the table became a problem.
 *
 * Only rows past their expiry go: a rotated or revoked token inside its window
 * still has to be findable, because presenting one is how `refreshTokenPair`
 * detects replay and kills the whole family.
 */
export async function pruneRefreshTokens(db: D1Database, now: number): Promise<number> {
  return changes(await db.prepare("DELETE FROM refresh_tokens WHERE expires_at <= ?").bind(now).run())
}

export async function getRefreshToken(db: D1Database, tokenHash: string): Promise<RefreshTokenRow | null> {
  return db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").bind(tokenHash).first<RefreshTokenRow>()
}

export async function insertRefreshToken(db: D1Database, row: RefreshTokenRow): Promise<void> {
  await db
    .prepare(
      "INSERT INTO refresh_tokens (id, account_id, token_hash, client_id, family_id, expires_at, rotated_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.id,
      row.account_id,
      row.token_hash,
      row.client_id,
      row.family_id,
      row.expires_at,
      row.rotated_at,
      row.revoked_at,
      row.created_at,
    )
    .run()
}

export async function rotateRefreshToken(
  db: D1Database,
  previous: RefreshTokenRow,
  next: RefreshTokenRow,
  now: number,
): Promise<boolean> {
  const results = await db.batch([
    db
      .prepare(
        "UPDATE refresh_tokens SET rotated_at = ? WHERE id = ? AND rotated_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
      )
      .bind(now, previous.id, now),
    db
      .prepare(
        "INSERT INTO refresh_tokens (id, account_id, token_hash, client_id, family_id, expires_at, rotated_at, revoked_at, created_at) SELECT ?, ?, ?, ?, ?, ?, NULL, NULL, ? WHERE changes() = 1",
      )
      .bind(
        next.id,
        next.account_id,
        next.token_hash,
        next.client_id,
        next.family_id,
        next.expires_at,
        next.created_at,
      ),
  ])
  return changes(results[0]) === 1 && changes(results[1]) === 1
}

export async function revokeRefreshFamily(db: D1Database, familyID: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?")
    .bind(now, familyID)
    .run()
}

export async function revokeRefreshByHash(db: D1Database, tokenHash: string, now: number): Promise<void> {
  const row = await getRefreshToken(db, tokenHash)
  if (row) await revokeRefreshFamily(db, row.family_id, now)
}

export async function getSigningKey(db: D1Database, now = Date.now()): Promise<SigningKeyRow> {
  const active = await db
    .prepare("SELECT * FROM signing_keys WHERE retired_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .first<SigningKeyRow>()
  if (active && now - active.created_at < SIGNING_KEY_ROTATION_SECONDS * 1000) return active

  const kid = createID("key", now)
  const jwks = await createSigningJwks(kid)
  const results = await db.batch([
    db.prepare("UPDATE signing_keys SET retired_at = ? WHERE retired_at IS NULL").bind(now),
    db
      .prepare(
        "INSERT INTO signing_keys (kid, alg, private_jwk, public_jwk, created_at, retired_at) VALUES (?, 'ES256', ?, ?, ?, NULL)",
      )
      .bind(kid, JSON.stringify(jwks.privateJwk), JSON.stringify(jwks.publicJwk), now),
  ])
  if (changes(results[1]) !== 1) throw new Error("signing key creation failed")
  const created = await db.prepare("SELECT * FROM signing_keys WHERE kid = ?").bind(kid).first<SigningKeyRow>()
  if (!created) throw new Error("signing key not found after creation")
  return created
}

export async function listPublicSigningKeys(db: D1Database, now = Date.now()): Promise<JsonWebKey[]> {
  const cutoff = now - RETIRED_KEY_PUBLICATION_SECONDS * 1000
  const result = await db
    .prepare("SELECT public_jwk FROM signing_keys WHERE retired_at IS NULL OR retired_at > ? ORDER BY created_at DESC")
    .bind(cutoff)
    .all<{ public_jwk: string }>()
  return result.results.map((row) => JSON.parse(row.public_jwk) as JsonWebKey)
}

export async function hashDeviceCode(deviceCode: string): Promise<string> {
  return sha256(deviceCode)
}

export async function listPasskeys(db: D1Database, accountID: string): Promise<PasskeyRow[]> {
  const result = await db
    .prepare("SELECT * FROM passkeys WHERE account_id = ? ORDER BY created_at")
    .bind(accountID)
    .all<PasskeyRow>()
  return result.results
}

export async function getPasskeyByCredentialID(db: D1Database, credentialID: string): Promise<PasskeyRow | null> {
  return db.prepare("SELECT * FROM passkeys WHERE credential_id = ?").bind(credentialID).first<PasskeyRow>()
}

/**
 * Register a passkey, tolerating the one that is already there.
 *
 * `credential_id` is `UNIQUE` and this was a bare `INSERT`, so re-sending an
 * attestation the server had already stored — a double-tap on "Save a passkey",
 * a retried request, a browser replaying the POST — threw and answered 500 on a
 * registration that had in fact succeeded. Storing the same credential twice is
 * a no-op, not a failure.
 *
 * The one case that must not pass quietly is a credential already registered to
 * a *different* account: succeeding there would let a sign-in appear to save a
 * passkey that in fact authenticates as somebody else.
 */
export async function insertPasskey(db: D1Database, row: PasskeyRow): Promise<"inserted" | "already" | "conflict"> {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO passkeys (id, account_id, credential_id, public_key, sign_count, transports, backed_up, device_type, user_handle, created_at, last_used_at, rp_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.id,
      row.account_id,
      row.credential_id,
      row.public_key,
      row.sign_count,
      row.transports,
      row.backed_up,
      row.device_type,
      row.user_handle,
      row.created_at,
      row.last_used_at,
      row.rp_id,
    )
    .run()
  if (changes(result) === 1) return "inserted"
  const existing = await getPasskeyByCredentialID(db, row.credential_id)
  return existing?.account_id === row.account_id ? "already" : "conflict"
}

export async function updatePasskeyCounter(
  db: D1Database,
  credentialID: string,
  signCount: number,
  lastUsedAt: number,
): Promise<void> {
  await db
    .prepare("UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE credential_id = ?")
    .bind(signCount, lastUsedAt, credentialID)
    .run()
}

/**
 * Passkeys the account can use under `rpID`. A row without an RP ID was saved
 * before the column existed: under the legacy issuer host when there is one,
 * otherwise under the only host there has ever been.
 */
export async function countPasskeys(
  db: D1Database,
  accountID: string,
  rpID: string,
  unlabelledIsCurrent: boolean,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM passkeys WHERE account_id = ? AND (rp_id = ? OR (? = 1 AND rp_id IS NULL))")
    .bind(accountID, rpID, unlabelledIsCurrent ? 1 : 0)
    .first<{ n: number }>()
  return row?.n ?? 0
}
