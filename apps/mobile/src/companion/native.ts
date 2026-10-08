import { parsePairingLink, type Pairing } from "./pairing.ts"
import type { SecretStore } from "./store.ts"

/**
 * The iOS shell's side of the companion (`src-tauri/src/lib.rs`). A webview `fetch` cannot pin the desktop's self-signed
 * certificate, so on iOS every request is executed by Rust with the pinned fingerprint; the same `CompanionClient` code
 * runs unchanged, it just receives this `fetch`.
 */
export interface NativeBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  /** A Tauri `Channel`: `onMessage` receives the Rust-side events of a streamed response. */
  channel<T>(onMessage: (message: T) => void): unknown
}

interface Head { status: number; headers: Array<[string, string]> }
type StreamMessage = { event: "head"; data: Head } | { event: "chunk"; data: number[] } | { event: "end" }

/** The real bridge inside the Tauri webview, `undefined` in a plain browser (development). */
export const tauriBridge = async (): Promise<NativeBridge | undefined> => {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return undefined
  const { invoke, Channel } = await import("@tauri-apps/api/core")
  return {
    invoke: (command, args) => invoke(command, args),
    channel: <T,>(onMessage: (message: T) => void) => {
      const channel = new Channel<T>()
      channel.onmessage = onMessage
      return channel
    },
  }
}

const NO_BODY = new Set([101, 204, 205, 304])
const isStream = (url: string): boolean => new URL(url).pathname === "/api/ai/chat/stream"

const toRequest = async (url: string, init: RequestInit) => {
  const headers: Array<[string, string]> = []
  new Headers(init.headers).forEach((value, name) => headers.push([name, value]))
  const body = init.body === undefined || init.body === null ? null : Array.from(new TextEncoder().encode(String(init.body)))
  return { method: init.method ?? "GET", url, headers, body }
}

/** `fetch` that goes through Rust with certificate pinning. Supports string bodies, which is all the companion API uses. */
export const pinnedFetch = (bridge: NativeBridge, fingerprint: string): typeof fetch =>
  (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const request = await toRequest(url, init)

    if (!isStream(url)) {
      const res = await bridge.invoke<{ status: number; headers: Array<[string, string]>; body: number[] }>("companion_request", { fingerprint, request })
      return new Response(NO_BODY.has(res.status) ? null : new Uint8Array(res.body), { status: res.status, headers: res.headers })
    }

    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
      init.signal?.addEventListener("abort", () => controller?.error(new DOMException("Aborted", "AbortError")), { once: true })
      let settled = false
      const onEvent = bridge.channel<StreamMessage>((message) => {
        if (message.event === "head") {
          settled = true
          resolve(new Response(body, { status: message.data.status, headers: message.data.headers }))
        } else if (message.event === "chunk") controller?.enqueue(new Uint8Array(message.data))
        else controller?.close()
      })
      bridge.invoke<void>("companion_stream", { fingerprint, request, onEvent }).catch((error: unknown) => {
        if (settled) controller?.error(error)
        else reject(error instanceof Error ? error : new Error(typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error)))
      })
    })
  }) as typeof fetch

const KEY = "pairing"

/** Keychain-backed store: the token never touches web storage. */
export const keychainStore = (bridge: NativeBridge): SecretStore => ({
  load: async () => {
    const raw = await bridge.invoke<string | null>("secret_get", { key: KEY })
    if (!raw) return undefined
    try {
      const p = JSON.parse(raw) as Pairing
      return parsePairingLink(`cadcamfun://pair?${new URLSearchParams({ host: p.baseUrl, token: p.token, fp: p.fingerprint, name: p.name })}`)
    } catch {
      return undefined
    }
  },
  save: (pairing) => bridge.invoke<void>("secret_set", { key: KEY, value: JSON.stringify(pairing) }),
  clear: () => bridge.invoke<void>("secret_delete", { key: KEY }),
})

/** Scans the pairing QR code with the camera; resolves to the link text. */
export const scanPairingCode = async (): Promise<string> => {
  const { scan, Format, requestPermissions } = await import("@tauri-apps/plugin-barcode-scanner")
  if ((await requestPermissions()) !== "granted") throw new Error("Camera access is needed to scan the pairing code")
  return (await scan({ windowed: false, formats: [Format.QRCode] })).content
}

/** A pairing link given to the app at launch (`--pair-link`), if any; `undefined` in a plain browser or when none was passed. */
export const launchPairLink = async (bridge: NativeBridge | undefined): Promise<string | undefined> =>
  bridge ? ((await bridge.invoke<string | null>("launch_pair_link")) ?? undefined) : undefined
