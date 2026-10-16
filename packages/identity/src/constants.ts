export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60
export const AUTH_CODE_TTL_SECONDS = 5 * 60
export const EMAIL_CODE_TTL_SECONDS = 10 * 60

/** Keep device approval and its email/passkey sign-in usable for the same window. */
export const DEVICE_CODE_TTL_SECONDS = 20 * 60
export const LOGIN_STATE_TTL_SECONDS = 20 * 60
export const DEVICE_POLL_INTERVAL_SECONDS = 5

/**
 * Email code delivery limits, as a burst window plus a sustained window.
 *
 * A single hourly quota punished the most common legitimate case — the first
 * mail is slow or lands in spam, so the user asks for another one or two —
 * by locking the address out for a full hour. Splitting the budget keeps
 * re-sends available while still bounding how much mail one address can pull.
 */
export const EMAIL_CODE_BURST_LIMIT = 3
export const EMAIL_CODE_BURST_WINDOW_SECONDS = 5 * 60
export const EMAIL_CODE_HOURLY_LIMIT = 10
export const EMAIL_CODE_HOURLY_WINDOW_SECONDS = 60 * 60

/**
 * Sign-in codes one network may ask for, across every address.
 *
 * The two budgets above are keyed by the recipient, which bounds how much mail
 * a single address can be made to receive and nothing else: a caller who varies
 * the address was unlimited, and every other endpoint here — device start,
 * token, device approval, passkey auth — already carries an IP bucket, so this
 * was the one hole in the set. What comes out of it is mail from
 * `auth@cadcam.fun`, so the cost of leaving it open is charged to the
 * issuer's own sending reputation and quota, not to an attacker.
 *
 * Sized for humans rather than for the limit: ten codes in ten minutes is more
 * than a shared office address will ever legitimately need behind one NAT, and
 * far less than a flood is worth.
 */
export const EMAIL_CODE_IP_LIMIT = 10
export const EMAIL_CODE_IP_WINDOW_SECONDS = 10 * 60

/** Wrong-code submissions allowed per emailed code before it is burned. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5

/** Device approvals attempted per IP per minute (8-digit code brute-force guard). */
export const DEVICE_APPROVAL_LIMIT = 12
export const DEVICE_APPROVAL_WINDOW_SECONDS = 60

/** WebAuthn challenge lifetime, and authentication attempts per IP per minute. */
export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60
export const PASSKEY_AUTH_LIMIT = 20
export const PASSKEY_AUTH_WINDOW_SECONDS = 60
export const SIGNING_KEY_ROTATION_SECONDS = 30 * 24 * 60 * 60
export const RETIRED_KEY_PUBLICATION_SECONDS = 24 * 60 * 60
export const MAX_FORM_BYTES = 16 * 1024

export const LEGACY_ISSUER_HOSTS: Readonly<Record<string, string>> = {}
export function legacyIssuerHost(_issuer: string): string | undefined { return undefined }

export const CLIENTS = {
  "cadcamfun-desktop": ["loopback"],
  "cadcamfun-mobile": ["cadcamfun://auth/callback"],
} as const
export type ClientID = keyof typeof CLIENTS
export function isClientID(value: string): value is ClientID {
  return Object.hasOwn(CLIENTS, value)
}
export function isAllowedRedirect(clientID: ClientID, value: string): boolean {
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.username || url.password || url.search || url.hash) return false
  if (clientID === "cadcamfun-desktop") {
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port !== "" && url.pathname === "/callback"
  }
  return value === "cadcamfun://auth/callback"
}
