/**
 * The manual pairing form: address(es), scoped token and certificate fingerprint typed by hand.
 * Everything here is pure so the rules the fields enforce are tested without a screen; the final
 * authority stays `parsePairingLink`, which the built link goes through.
 */

export interface ManualFields {
  readonly address: string
  readonly token: string
  readonly fingerprint: string
}

export type ManualErrors = Partial<Record<keyof ManualFields, string>>

/** A pasted `cadcamfun://pair?…` link needs no typing: the form hands it straight to pairing. */
export const looksLikePairingLink = (text: string): boolean => /cadcamfun:\/\/pair\?/i.test(text)

/** Several addresses may be typed, one per line or separated by commas or spaces. */
export const splitOrigins = (address: string): string[] => address.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean)

/** `192.168.1.10:8443` → `https://192.168.1.10:8443`; the pairing contract is HTTPS only. */
export const withScheme = (origin: string): string => /^[a-z][a-z0-9+.-]*:\/\//i.test(origin) ? origin : `https://${origin}`

/** The desktop shows its fingerprint as colon-separated byte pairs; the link wants plain lowercase hex. */
export const normalizeFingerprint = (raw: string): string => raw.toLowerCase().replace(/[\s:-]/g, "")

const originError = (raw: string): string | undefined => {
  let url: URL
  try {
    url = new URL(withScheme(raw))
  } catch {
    return `“${raw}” is not an address. Use the form https://192.168.1.10:8443.`
  }
  if (url.protocol !== "https:") return "The address must be https. The desktop only answers over its pinned certificate."
  if (!url.hostname) return `“${raw}” has no host name.`
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return "Enter only the address, with no path or credentials."
  return undefined
}

export const validateManualFields = (fields: ManualFields): ManualErrors => {
  const errors: ManualErrors = {}

  const origins = splitOrigins(fields.address)
  if (origins.length === 0) errors.address = "Enter the address shown on your Mac."
  else {
    const bad = origins.map(originError).find((message) => message !== undefined)
    if (bad) errors.address = bad
  }

  const token = fields.token.trim()
  if (!token) errors.token = "Enter the pairing token shown on your Mac."
  else if (token.length < 16 || /[\s\u0000-\u001f\u007f]/u.test(token)) errors.token = "That token looks incomplete. Copy it again from your Mac."

  const fingerprint = normalizeFingerprint(fields.fingerprint)
  if (!fingerprint) errors.fingerprint = "Enter the certificate fingerprint shown on your Mac."
  else if (!/^[0-9a-f]{64}$/u.test(fingerprint)) {
    const hex = fingerprint.replace(/[^0-9a-f]/g, "").length
    errors.fingerprint = /[^0-9a-f]/.test(fingerprint) ? "A fingerprint has only the digits 0–9 and the letters A–F." : `A fingerprint has 64 hexadecimal characters; this one has ${hex}.`
  }
  return errors
}

export const hasErrors = (errors: ManualErrors): boolean => Object.keys(errors).length > 0

/** The link the form pairs with: the first address is the primary one, the rest are raced alongside it. */
export const manualPairingLink = (fields: ManualFields): string => {
  const [first, ...rest] = splitOrigins(fields.address).map(withScheme)
  const params = new URLSearchParams({ host: first ?? "", token: fields.token.trim(), fp: normalizeFingerprint(fields.fingerprint), name: "Desktop" })
  if (rest.length > 0) params.set("hosts", rest.join(","))
  return `cadcamfun://pair?${params}`
}
