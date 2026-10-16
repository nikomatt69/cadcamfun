import type { ClientID } from "./constants.ts"

export type Account = {
  id: string
  email: string
  created_at: number
  updated_at: number
  disabled_at: number | null
}

export type LoginIntent =
  | {
      kind: "authorize"
      clientID: ClientID
      redirectURI: string
      state: string
      scope: string
      codeChallenge: string
    }
  | { kind: "device"; userCode: string }

export type AuthCode = {
  accountID: string
  clientID: ClientID
  redirectURI: string
  scope: string
  codeChallenge: string
}

export type EmailChallenge = {
  email: string
  nonce: string
  codeHash: string
  attempts: number
  /**
   * Absolute expiry of the emailed code. Wrong attempts rewrite the KV entry,
   * and rewriting it with a fresh `expirationTtl` would silently extend the
   * code's life every time the user mistyped it. Keeping the original instant
   * here lets each rewrite shorten the TTL to whatever is actually left.
   */
  expiresAt: number
}

export type DeviceCodeRow = {
  device_code_hash: string
  user_code: string
  client_id: ClientID
  scope: string
  status: "pending" | "approved" | "denied" | "consumed"
  account_id: string | null
  expires_at: number
  last_poll_at: number | null
  created_at: number
}

export type RefreshTokenRow = {
  id: string
  account_id: string
  token_hash: string
  client_id: ClientID
  family_id: string
  expires_at: number
  rotated_at: number | null
  revoked_at: number | null
  created_at: number
}

export type SigningKeyRow = {
  kid: string
  alg: "ES256"
  private_jwk: string
  public_jwk: string
  created_at: number
  retired_at: number | null
}

export type PasskeyRow = {
  id: string
  account_id: string
  credential_id: string
  public_key: string
  sign_count: number
  transports: string | null
  backed_up: number
  device_type: string | null
  user_handle: string
  created_at: number
  last_used_at: number | null
  /** NULL: saved before the column existed, under the pre-move issuer host. */
  rp_id: string | null
}

export type PasskeyOffer = {
  accountID: string
  /**
   * The login this offer interrupts.
   *
   * The offer is the last page of a sign-in that has *already succeeded* — the
   * account is verified by the time it renders. Without a copy of the intent,
   * finishing depended on the separate `login:` entry still being alive, so a
   * user who read the passkey prompt, thought about it, and then chose was told
   * "Session expired" and the terminal they had approved stayed unconnected.
   * The offer key is reached only through the same unguessable `login_state`,
   * so carrying the intent grants nothing the caller did not already hold.
   */
  intent?: LoginIntent
}
