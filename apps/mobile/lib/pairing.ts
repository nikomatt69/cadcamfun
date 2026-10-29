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
  /** Omitted for legacy local pairings; cloud connections use system HTTPS trust. */
  readonly mode?: "cloud"
  /** Persistent hosted workspace identity, independent of its rotating HTTPS certificate. */
  readonly workspaceId?: string
}

export class PairingError extends Error {}

/** Legacy local queues keep their fingerprint identity; hosted queues never follow certificate rotation. */
export const pairingIdentity = (pairing: Pairing): string => pairing.mode === "cloud"
  ? `cloud:${pairing.baseUrl}:${pairing.workspaceId}`
  : pairing.fingerprint

/** Hosted assistant state and queued mutations also belong to the signed-in account. */
export const pairingScope = (pairing: Pairing, accountSubject?: string): string => pairing.mode === "cloud"
  ? `${pairingIdentity(pairing)}|account:${accountSubject ?? "signed-out"}`
  : pairing.fingerprint

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
  const mode = url.searchParams.get("mode")
  const workspaceId = url.searchParams.get("workspace")
  if (token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(token)) throw new PairingError("Invalid token")
  if (mode !== null && mode !== "local" && mode !== "cloud") throw new PairingError("Invalid connection mode")
  if (mode === "cloud") {
    if (!workspaceId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(workspaceId)) throw new PairingError("Invalid cloud workspace identity")
    if (fingerprint) throw new PairingError("Cloud pairing uses verified HTTPS instead of a certificate fingerprint")
  } else if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new PairingError("Invalid certificate fingerprint")
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
  if (mode === "cloud" && hosts.length !== 1) throw new PairingError("Cloud pairing must name one HTTPS origin")
  return { baseUrl, token, fingerprint, name: url.searchParams.get("name") || new URL(baseUrl).hostname, hosts, ...(mode === "cloud" && workspaceId ? { mode, workspaceId } : {}) }
}

/** Validate persisted credentials with the same contract as newly scanned links. */
export const validatePairing = (value: unknown): Pairing => {
  if (!value || typeof value !== "object") throw new PairingError("Invalid saved pairing")
  const p = value as Record<string, unknown>
  if (["baseUrl", "token", "fingerprint", "name"].some((key) => typeof p[key] !== "string")) throw new PairingError("Invalid saved pairing")
  const extra = Array.isArray(p.hosts) ? p.hosts.filter((h): h is string => typeof h === "string") : []
  const params = new URLSearchParams({ host: p.baseUrl as string, token: p.token as string, fp: p.fingerprint as string, name: p.name as string })
  if (extra.length > 0) params.set("hosts", extra.join(","))
  if (p.mode !== undefined && p.mode !== "cloud") throw new PairingError("Invalid saved connection mode")
  if (p.mode === "cloud") {
    params.set("mode", "cloud")
    if (typeof p.workspaceId === "string") params.set("workspace", p.workspaceId)
  } else if (p.workspaceId !== undefined) throw new PairingError("Invalid saved connection mode")
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

export const desktopLabel = (pairing: Pairing): string => {
  try {
    return new URL(pairing.baseUrl).host
  } catch {
    return pairing.name
  }
}
