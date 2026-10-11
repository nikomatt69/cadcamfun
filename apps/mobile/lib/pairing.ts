/**
 * Pairing with a desktop. The desktop shows a QR code containing a `cadcamfun://pair` link; the
 * phone parses it, pins the certificate fingerprint and keeps the scoped token in the iOS Keychain
 * (never in plain storage).
 *
 *   cadcamfun://pair?host=<https url>&token=<scoped token>&fp=<sha-256 hex of the desktop certificate>&name=<label>
 */
export interface Pairing {
  readonly baseUrl: string
  readonly token: string
  /** SHA-256 fingerprint of the desktop's TLS certificate, hex, lowercase; the native layer refuses any other. */
  readonly fingerprint: string
  readonly name: string
}

export class PairingError extends Error {}

export const parsePairingLink = (link: string): Pairing => {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    throw new PairingError("Not a pairing link")
  }
  if (url.protocol !== "cadcamfun:" || url.hostname !== "pair") throw new PairingError("Not a CADCAMFUN pairing link")
  const host = url.searchParams.get("host") ?? ""
  const token = url.searchParams.get("token") ?? ""
  const fingerprint = (url.searchParams.get("fp") ?? "").toLowerCase()
  let base: URL
  try {
    base = new URL(host)
  } catch {
    throw new PairingError("Invalid desktop address")
  }
  if (base.protocol !== "https:") throw new PairingError("The desktop address must be https")
  if (base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) throw new PairingError("The desktop address must be an HTTPS origin")
  if (token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) throw new PairingError("Invalid token")
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new PairingError("Invalid certificate fingerprint")
  return { baseUrl: base.origin, token, fingerprint, name: url.searchParams.get("name") || base.hostname }
}

/** Validate persisted credentials with the same contract as newly scanned links. */
export const validatePairing = (value: unknown): Pairing => {
  if (!value || typeof value !== "object") throw new PairingError("Invalid saved pairing")
  const p = value as Record<string, unknown>
  if (["baseUrl", "token", "fingerprint", "name"].some((key) => typeof p[key] !== "string")) throw new PairingError("Invalid saved pairing")
  return parsePairingLink(`cadcamfun://pair?${new URLSearchParams({ host: p.baseUrl as string, token: p.token as string, fp: p.fingerprint as string, name: p.name as string })}`)
}
