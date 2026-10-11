import type { Pairing } from "../../lib/pairing"
import { CompanionError, type Transport } from "../../lib/client"

export interface StreamHandle {
  readNext(): Promise<{ done: boolean; data?: string; status?: number; error?: string }>
  cancel(): void
}
export interface PinnedModule {
  request(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<{ status: number; body: string }>
  streamStart(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<StreamHandle>
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

const headers = (pairing: Pairing, body: unknown) => ({ authorization: `Bearer ${pairing.token}`, accept: "application/json, text/event-stream", ...(body !== undefined ? { "content-type": "application/json" } : {}) })

export const createPinnedTransport = (pairing: Pairing, module: PinnedModule): Transport => ({
  async request(path, method, body, signal) {
    if (signal?.aborted) throw new Error("Request cancelled")
    return abortable(signal, module.request(pairing.baseUrl, path, method, headers(pairing, body), body === undefined ? null : JSON.stringify(body), pairing.fingerprint))
  },
  async *stream(path, method, body, signal) {
    if (signal?.aborted) return
    // Await the native AsyncFunction; cancellation while it starts must still release its handle.
    const handle = await module.streamStart(pairing.baseUrl, path, method, headers(pairing, body), body === undefined ? null : JSON.stringify(body), pairing.fingerprint)
    const cancel = () => handle.cancel()
    signal?.addEventListener("abort", cancel, { once: true })
    try {
      while (!signal?.aborted) {
        const chunk = await abortable(signal, handle.readNext())
        if (chunk.error) throw new Error(chunk.error)
        if (chunk.status !== undefined && (chunk.status < 200 || chunk.status >= 300)) throw new CompanionError(chunk.status, `HTTP ${chunk.status}`)
        if (chunk.data) yield chunk.data
        if (chunk.done) return
      }
    } finally {
      signal?.removeEventListener("abort", cancel)
      handle.cancel()
    }
  },
})

/** Browser/test transport. Native callers must explicitly select certificate pinning instead. */
export const createFetchTransport = (pairing: Pairing, fetcher: typeof fetch = fetch): Transport => ({
  async request(path, method, body, signal) {
    const response = await fetcher(`${pairing.baseUrl}${path}`, { method, headers: headers(pairing, body), body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: "error" })
    return { status: response.status, body: await response.text() }
  },
  async *stream(path, method, body, signal) {
    const response = await fetcher(`${pairing.baseUrl}${path}`, { method, headers: headers(pairing, body), body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: "error" })
    if (!response.ok) throw new CompanionError(response.status, `HTTP ${response.status}`)
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
