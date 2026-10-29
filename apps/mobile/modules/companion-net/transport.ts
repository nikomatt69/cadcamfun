import type { Pairing } from "../../lib/pairing"
import { CompanionError, retryAfterMs, type Transport } from "../../lib/client"

export interface StreamHandle {
  readNext(): Promise<{ done: boolean; data?: string; status?: number; error?: string; headers?: Record<string, string> }>
  cancel(): void
}
export interface PinnedModule {
  request(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<{ status: number; body: string; headers?: Record<string, string> }>
  streamStart(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<StreamHandle>
  cloudRequest?(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null): Promise<{ status: number; body: string; headers?: Record<string, string> }>
  cloudStreamStart?(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null): Promise<StreamHandle>
}

export const abortable = <T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> => {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error("Request cancelled")) }
    const cleanup = () => signal.removeEventListener("abort", abort)
    // Always observe the promise, including when the signal was already aborted.
    promise.then((value) => { cleanup(); resolve(value) }, (error: unknown) => { cleanup(); reject(error) })
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
}

/**
 * Response headers the client reads (conditional previews, gateway back-off). Only these cross the bridge, lowercased:
 * nothing else of the response reaches JavaScript.
 */
export const EXPOSED_HEADERS = ["etag", "retry-after"] as const

/** Lowercases names and keeps only the exposed headers. */
export const exposedHeaders = (raw: Readonly<Record<string, string>> | Headers | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!raw) return out
  const entries: Iterable<[string, string]> = raw instanceof Headers ? raw.entries() : Object.entries(raw)
  for (const [name, value] of entries) {
    const key = name.toLowerCase()
    if ((EXPOSED_HEADERS as readonly string[]).includes(key) && typeof value === "string") out[key] = value
  }
  return out
}

/** Caller headers are conditional-request headers only: they can never replace the pairing's credentials or framing. */
const CALLER_HEADERS = new Set(["if-none-match"])

/** Supplies the CADCAMFUN account's access JWT; undefined means the phone acts as the desktop's local profile. */
export type IdentityToken = () => Promise<string | undefined>

/** A cloud request never silently changes into the local-profile access allowed by LAN pairing. */
export const transportIdentity = async (pairing: Pairing, identity?: IdentityToken): Promise<string | undefined> => {
  let token: string | undefined
  try {
    token = identity ? await identity() : undefined
  } catch (error) {
    if (pairing.mode === "cloud") throw new CompanionError(401, "Your cloud sign-in expired. Sign in again to reconnect.")
    throw error
  }
  if (pairing.mode === "cloud" && !token) throw new CompanionError(401, "Sign in to your CADCAMFUN account to connect to the cloud workspace.")
  return token
}

const headers = (pairing: Pairing, body: unknown, extra?: Readonly<Record<string, string>>, identity?: string) => {
  const allowed = Object.fromEntries(Object.entries(extra ?? {}).filter(([name]) => CALLER_HEADERS.has(name.toLowerCase())).map(([name, value]) => [name.toLowerCase(), value]))
  return { ...allowed, ...(identity ? { "x-identity-token": identity } : {}), authorization: `Bearer ${pairing.token}`, accept: "application/json, text/event-stream", ...(body !== undefined ? { "content-type": "application/json" } : {}) }
}

/** A refused stream carries the gateway's back-off (`retry-after`, seconds) so reconnecting waits for it. */
const streamRefusal = (status: number, retryAfter: string | undefined) => new CompanionError(status, `HTTP ${status}`, retryAfterMs(retryAfter))

export const createPinnedTransport = (pairing: Pairing, module: PinnedModule, identity?: IdentityToken): Transport => ({
  async request(path, method, body, signal, extra) {
    if (pairing.mode === "cloud") throw new Error("Cloud connections require the HTTPS cloud transport")
    if (signal?.aborted) throw new Error("Request cancelled")
    const response = await abortable(signal, module.request(pairing.baseUrl, path, method, headers(pairing, body, extra, (identity ? await identity() : undefined)), body === undefined ? null : JSON.stringify(body), pairing.fingerprint))
    return { status: response.status, body: response.body, headers: exposedHeaders(response.headers) }
  },
  async *stream(path, method, body, signal) {
    if (pairing.mode === "cloud") throw new Error("Cloud connections require the HTTPS cloud transport")
    if (signal?.aborted) return
    // Await the native AsyncFunction; cancellation while it starts must still release its handle.
    const handle = await module.streamStart(pairing.baseUrl, path, method, headers(pairing, body, undefined, (identity ? await identity() : undefined)), body === undefined ? null : JSON.stringify(body), pairing.fingerprint)
    const cancel = () => handle.cancel()
    signal?.addEventListener("abort", cancel, { once: true })
    try {
      while (!signal?.aborted) {
        const chunk = await abortable(signal, handle.readNext())
        if (chunk.error) throw new Error(chunk.error)
        if (chunk.status !== undefined && (chunk.status < 200 || chunk.status >= 300)) throw streamRefusal(chunk.status, exposedHeaders(chunk.headers)["retry-after"])
        if (chunk.data) yield chunk.data
        if (chunk.done) return
      }
    } finally {
      signal?.removeEventListener("abort", cancel)
      handle.cancel()
    }
  },
})

/** Native hosted requests have their own ABI: an absent local pin can never select this mode. */
export const createCloudTransport = (pairing: Pairing, module: PinnedModule, identity?: IdentityToken): Transport => {
  if (pairing.mode !== "cloud" || !pairing.workspaceId || pairing.fingerprint) throw new Error("Invalid cloud connection")
  const requestCloud = module.cloudRequest?.bind(module)
  const streamCloud = module.cloudStreamStart?.bind(module)
  return {
    async request(path, method, body, signal, extra) {
      if (signal?.aborted) throw new Error("Request cancelled")
      if (!requestCloud) throw new Error("Cloud connections require an updated CADCAMFUN development build. Rebuild the iOS app.")
      const token = await abortable(signal, transportIdentity(pairing, identity))
      if (signal?.aborted) throw new Error("Request cancelled")
      const response = await abortable(signal, requestCloud(pairing.baseUrl, path, method, headers(pairing, body, extra, token), body === undefined ? null : JSON.stringify(body)))
      return { status: response.status, body: response.body, headers: exposedHeaders(response.headers) }
    },
    async *stream(path, method, body, signal) {
      if (signal?.aborted) return
      if (!streamCloud) throw new Error("Cloud connections require an updated CADCAMFUN development build. Rebuild the iOS app.")
      const token = await abortable(signal, transportIdentity(pairing, identity))
      if (signal?.aborted) return
      const handle = await streamCloud(pairing.baseUrl, path, method, headers(pairing, body, undefined, token), body === undefined ? null : JSON.stringify(body))
      const cancel = () => handle.cancel()
      signal?.addEventListener("abort", cancel, { once: true })
      try {
        while (!signal?.aborted) {
          const chunk = await abortable(signal, handle.readNext())
          if (chunk.error) throw new Error(chunk.error)
          if (chunk.status !== undefined && (chunk.status < 200 || chunk.status >= 300)) throw streamRefusal(chunk.status, exposedHeaders(chunk.headers)["retry-after"])
          if (chunk.data) yield chunk.data
          if (chunk.done) return
        }
      } finally {
        signal?.removeEventListener("abort", cancel)
        handle.cancel()
      }
    },
  }
}

/** Browser/test transport. Native callers must explicitly select certificate pinning instead. */
export const createFetchTransport = (pairing: Pairing, fetcher: typeof fetch = fetch, identity?: IdentityToken): Transport => ({
  async request(path, method, body, signal, extra) {
    const response = await fetcher(`${pairing.baseUrl}${path}`, { method, headers: headers(pairing, body, extra, await transportIdentity(pairing, identity)), body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: "error" })
    return { status: response.status, body: await response.text(), headers: exposedHeaders(response.headers) }
  },
  async *stream(path, method, body, signal) {
    const response = await fetcher(`${pairing.baseUrl}${path}`, { method, headers: headers(pairing, body, undefined, await transportIdentity(pairing, identity)), body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: "error" })
    if (!response.ok) throw streamRefusal(response.status, response.headers.get("retry-after") ?? undefined)
    if (!response.body) throw new Error("The desktop returned no stream")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    try {
      while (!signal?.aborted) {
        const { done, value } = await abortable(signal, reader.read())
        if (done) { const tail = decoder.decode(); if (tail) yield tail; return }
        yield decoder.decode(value, { stream: true })
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  },
})
