/**
 * Pairing with a desktop. The desktop shows a QR code containing a `cadcamfun://pair` link; the
 * phone parses it, pins the certificate fingerprint and keeps the scoped token in the iOS Keychain
 * (never in plain storage).
 *
 *   cadcamfun://pair?host=<https origin>&hosts=<comma-separated extra origins>&token=<scoped token>&fp=<sha-256 hex>&name=<label>
 *
 * `hosts` lists every private address the Mac currently has (Wi-Fi, iPhone Personal Hotspot,
 * Tailscale). The phone races them and keeps the one that answers.
 */
export interface Pairing {
  readonly baseUrl: string
  readonly token: string
  /** SHA-256 fingerprint of the desktop's TLS certificate, hex, lowercase; the native layer refuses any other. */
  readonly fingerprint: string
  readonly name: string
  /** HTTPS origins to try, `baseUrl` first. Omitted on pairings saved before extra hosts existed. */
  readonly hosts?: readonly string[]
}

export class PairingError extends Error {}

const originOf = (raw: string): string => {
  let base: URL
  try {
    base = new URL(raw)
  } catch {
    throw new PairingError("Invalid desktop address")
  }
  if (base.protocol !== "https:") throw new PairingError("The desktop address must be https")
  if (base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) throw new PairingError("The desktop address must be an HTTPS origin")
  if (!base.hostname) throw new PairingError("Invalid desktop address")
  return base.origin
}

/** Pull a `cadcamfun://pair` URL out of a scan, a paste, or surrounding text. */
export const extractPairingLink = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed) throw new PairingError("Not a pairing link")
  try {
    const url = new URL(trimmed)
    if (url.protocol === "cadcamfun:") return trimmed
  } catch {
    // Fall through to a search inside surrounding text.
  }
  const match = /cadcamfun:\/\/pair\?[^\s"'<>]+/i.exec(trimmed)
  if (!match) throw new PairingError("Not a pairing link")
  return match[0].replace(/[),.;]+$/u, "")
}

export const parsePairingLink = (link: string): Pairing => {
  let url: URL
  try {
    url = new URL(extractPairingLink(link))
  } catch (error) {
    if (error instanceof PairingError) throw error
    throw new PairingError("Not a pairing link")
  }
  if (url.protocol !== "cadcamfun:" || url.hostname !== "pair") throw new PairingError("Not a CADCAMFUN pairing link")
  const host = url.searchParams.get("host") ?? ""
  const token = url.searchParams.get("token") ?? ""
  const fingerprint = (url.searchParams.get("fp") ?? "").toLowerCase()
  if (token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(token)) throw new PairingError("Invalid token")
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new PairingError("Invalid certificate fingerprint")
  const extras = (url.searchParams.get("hosts") ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  const hosts: string[] = []
  const seen = new Set<string>()
  for (const raw of [host, ...extras]) {
    if (!raw) continue
    let origin: string
    try {
      origin = originOf(raw)
    } catch (error) {
      if (raw === host) throw error
      continue
    }
    if (seen.has(origin)) continue
    seen.add(origin)
    hosts.push(origin)
  }
  if (hosts.length === 0) throw new PairingError("Invalid desktop address")
  const baseUrl = hosts[0]!
  return { baseUrl, token, fingerprint, name: url.searchParams.get("name") || new URL(baseUrl).hostname, hosts }
}

/** Validate persisted credentials with the same contract as newly scanned links. */
export const validatePairing = (value: unknown): Pairing => {
  if (!value || typeof value !== "object") throw new PairingError("Invalid saved pairing")
  const p = value as Record<string, unknown>
  if (["baseUrl", "token", "fingerprint", "name"].some((key) => typeof p[key] !== "string")) throw new PairingError("Invalid saved pairing")
  const extra = Array.isArray(p.hosts) ? p.hosts.filter((h): h is string => typeof h === "string") : []
  const params = new URLSearchParams({ host: p.baseUrl as string, token: p.token as string, fp: p.fingerprint as string, name: p.name as string })
  if (extra.length > 0) params.set("hosts", extra.join(","))
  return parsePairingLink(`cadcamfun://pair?${params}`)
}

export const pairingCandidates = (pairing: Pairing): Pairing[] => {
  // Last-known-good first, then every other advertised origin (Wi-Fi, hotspot, Tailscale).
  const urls = [pairing.baseUrl, ...(pairing.hosts ?? [])]
  const unique: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    unique.push(url)
  }
  return unique.map((baseUrl) => ({ ...pairing, baseUrl, hosts: unique }))
}

/**
 * Race every advertised desktop origin; the first health that succeeds wins and the rest are aborted.
 * Used at pair-time so a QR that lists Wi-Fi + hotspot + Tailscale works on whichever path the phone has.
 */
export const firstReachable = async <T>(
  pairing: Pairing,
  probe: (candidate: Pairing, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<{ pairing: Pairing; result: T }> => {
  const list = pairingCandidates(pairing)
  if (list.length === 1) {
    const candidate = list[0]!
    return { pairing: candidate, result: await probe(candidate, signal ?? new AbortController().signal) }
  }
  const shared = new AbortController()
  const abortShared = () => shared.abort()
  signal?.addEventListener("abort", abortShared, { once: true })
  if (signal?.aborted) {
    signal.removeEventListener("abort", abortShared)
    throw new Error("Request cancelled")
  }
  const errors: unknown[] = []
  try {
    return await new Promise<{ pairing: Pairing; result: T }>((resolve, reject) => {
      let pending = list.length
      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        errors.push(error)
        pending -= 1
        if (pending === 0) {
          settled = true
          reject(errors[0])
        }
      }
      const onAbort = () => {
        if (settled) return
        settled = true
        reject(new Error("Request cancelled"))
      }
      shared.signal.addEventListener("abort", onAbort, { once: true })
      for (const candidate of list) {
        void probe(candidate, shared.signal).then(
          (result) => {
            if (settled) return
            settled = true
            shared.signal.removeEventListener("abort", onAbort)
            shared.abort()
            resolve({ pairing: candidate, result })
          },
          (error: unknown) => fail(error),
        )
      }
    })
  } finally {
    signal?.removeEventListener("abort", abortShared)
  }
}

/**
 * A QR that has not been redeemed yet. It carries a one-time code, not the device bearer.
 * `cadcamfun://pair?host=...&code=...&fp=...&name=...&exp=...`
 */
export interface PairingGrant {
  readonly baseUrl: string
  readonly code: string
  readonly fingerprint: string
  readonly name: string
  readonly hosts: readonly string[]
  readonly expiresAt: number | null
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u

export const parsePairingGrant = (link: string): PairingGrant => {
  let url: URL
  try {
    url = new URL(extractPairingLink(link))
  } catch (error) {
    if (error instanceof PairingError) throw error
    throw new PairingError("Not a pairing link")
  }
  if (url.protocol !== "cadcamfun:" || url.hostname !== "pair") throw new PairingError("Not a CADCAMFUN pairing link")
  const code = url.searchParams.get("code") ?? ""
  if (!CODE_PATTERN.test(code)) throw new PairingError("Invalid pairing code")
  const fingerprint = (url.searchParams.get("fp") ?? "").toLowerCase()
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new PairingError("Invalid certificate fingerprint")
  const host = url.searchParams.get("host") ?? ""
  const extras = (url.searchParams.get("hosts") ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  const hosts: string[] = []
  const seen = new Set<string>()
  for (const raw of [host, ...extras]) {
    if (!raw) continue
    let origin: string
    try { origin = originOf(raw) } catch (error) {
      if (raw === host) throw error
      continue
    }
    if (seen.has(origin)) continue
    seen.add(origin)
    hosts.push(origin)
  }
  if (hosts.length === 0) throw new PairingError("Invalid desktop address")
  const exp = Number(url.searchParams.get("exp"))
  return {
    baseUrl: hosts[0]!,
    code,
    fingerprint,
    name: url.searchParams.get("name") || new URL(hosts[0]!).hostname,
    hosts,
    expiresAt: Number.isFinite(exp) && exp > 0 ? exp : null,
  }
}

/** Builds the saved device pairing from a redeemed token and the QR the phone already trusts. */
export const pairingFromRedeem = (grant: PairingGrant, token: string, name?: string): Pairing => {
  const params = new URLSearchParams({ host: grant.baseUrl, token, fp: grant.fingerprint, name: name || grant.name })
  const extras = grant.hosts.filter((host) => host !== grant.baseUrl)
  if (extras.length > 0) params.set("hosts", extras.join(","))
  return parsePairingLink(`cadcamfun://pair?${params}`)
}

const failureMessage = (status: number, body: string): string => {
  try {
    const parsed = JSON.parse(body) as { message?: unknown }
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message
  } catch { /* the gateway sometimes answers with an empty body */ }
  if (status === 400) return "This pairing code has expired or was already used. Show a new QR code on the desktop."
  return "The desktop refused the pairing code."
}

/**
 * Redeems a one-time QR against every address it lists. The device bearer comes back on the
 * pinned connection and is not part of the QR.
 */
export type RedeemFetcher = (input: string, init?: RequestInit) => Promise<Response>

export const redeemPairingLink = async (link: string, fetcher: RedeemFetcher): Promise<Pairing> => {
  const grant = parsePairingGrant(link)
  let last = "The desktop did not answer"
  for (const baseUrl of grant.hosts) {
    try {
      const response = await fetcher(`${baseUrl}/api/companion/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ code: grant.code }),
      })
      const text = await response.text()
      if (!response.ok) { last = failureMessage(response.status, text); continue }
      const body = JSON.parse(text) as { token?: unknown; name?: unknown }
      if (typeof body.token !== "string") throw new PairingError("The desktop did not return a device credential")
      return pairingFromRedeem(grant, body.token, typeof body.name === "string" ? body.name : undefined)
    } catch (error) {
      if (error instanceof PairingError) throw error
      last = error instanceof Error ? error.message : last
    }
  }
  throw new PairingError(last)
}

/** A scanned link is either a one-time code (new QR) or a device token (a link saved from an older desktop). */
export const materializePairing = async (link: string, redeem: (link: string) => Promise<Pairing> = (value) => redeemPairingLink(value, fetch)): Promise<Pairing> => {
  const extracted = extractPairingLink(link)
  const url = new URL(extracted)
  if (url.searchParams.get("code") && !url.searchParams.get("token")) return redeem(extracted)
  return parsePairingLink(extracted)
}

export const desktopLabel = (pairing: Pairing): string => {
  try {
    return new URL(pairing.baseUrl).host
  } catch {
    return pairing.name
  }
}
