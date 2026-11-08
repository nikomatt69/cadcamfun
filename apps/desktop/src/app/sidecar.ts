/**
 * Where the sidecar lives: from the Tauri shell in the desktop app, or Vite env vars
 * in plain-browser dev (spec 06-desktop-ui.md §1).
 *
 * This module only *resolves* the endpoint. Building the client, checking `/health`
 * and timing out is `state/client.ts`'s job, so the boot sequence stays testable.
 */
export interface Endpoint {
  readonly baseUrl: string
  readonly token: string
}

/** True inside the Tauri webview, where `invoke` is the only way to reach the sidecar. */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

let cached: Promise<Endpoint> | undefined
let liveBaseUrl: string | undefined

/** Longest a call waits for a restarting sidecar: the shell's own ready deadline. */
const RESTART_WAIT_MS = 60_000
/** Closed from `restarting` until the next `ready` (or `failed`): the old port is dead and the new one is not known yet. */
let restartGate: { readonly open: Promise<void>; readonly release: () => void } | undefined
const closeRestartGate = (): void => {
  if (restartGate !== undefined) return
  let release!: () => void
  const open = new Promise<void>((resolve) => { release = resolve })
  restartGate = { open, release }
}
const openRestartGate = (): void => {
  restartGate?.release()
  restartGate = undefined
}
/** The shell gave up restarting: there is no new port to wait for, so calls fail at once with their own error. */
let sidecarFailed = false

/** Resolves when the gate opens, the wait runs out, or the request is aborted; never rejects. */
const waitForRestart = async (signal?: AbortSignal | null): Promise<void> => {
  const gate = restartGate
  if (gate === undefined || signal?.aborted === true) return
  let timer: ReturnType<typeof setTimeout> | undefined
  let release!: () => void
  const bounds = new Promise<void>((resolve) => {
    release = resolve
    timer = setTimeout(resolve, RESTART_WAIT_MS)
  })
  const abort = (): void => release()
  signal?.addEventListener("abort", abort, { once: true })
  try { await Promise.race([gate.open, bounds]) }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort) }
}

let refreshing: Promise<void> | undefined
/**
 * Asks the shell where the sidecar is now. The shell answers only once a restarting sidecar is ready, so after a failed call
 * this is what turns "the old port refused" into "the new port". One lookup serves every call that failed at the same time.
 */
export const refreshEndpoint = (): Promise<void> => {
  if (!isTauri() || sidecarFailed) return Promise.resolve()
  refreshing ??= (async () => {
    cached = undefined
    const lookup = getEndpoint()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const found = await Promise.race([lookup, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("the sidecar did not report an address")), RESTART_WAIT_MS) })])
      liveBaseUrl = found.baseUrl
    } catch (error) {
      // A lookup that never answered must not stay as the cached endpoint for every later caller.
      if (cached === lookup) cached = undefined
      throw error
    } finally { clearTimeout(timer); refreshing = undefined }
  })()
  return refreshing
}

export function getEndpoint(): Promise<Endpoint> {
  cached ??= (async () => {
    if (isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core")
      return invoke<Endpoint>("get_sidecar_endpoint")
    }
    const baseUrl = import.meta.env.VITE_SIDECAR_URL as string | undefined
    const token = import.meta.env.VITE_SIDECAR_TOKEN as string | undefined
    if (!baseUrl || !token) throw new Error("Set VITE_SIDECAR_URL and VITE_SIDECAR_TOKEN to run outside Tauri")
    return { baseUrl, token }
  })()
  const pending = cached
  void pending.catch(() => { if (cached === pending) cached = undefined })
  return pending
}

/** Re-resolve the endpoint (the shell restarts the sidecar on a new port after a crash). */
export const resetEndpoint = (): void => {
  cached = undefined
  liveBaseUrl = undefined
  sidecarFailed = false
  openRestartGate()
}

/** Overrides the endpoint, for tests and for the browser fallback. */
export const setEndpoint = (endpoint: Endpoint): void => {
  liveBaseUrl = endpoint.baseUrl
  cached = Promise.resolve(endpoint)
}

/**
 * `fetch` for `/api/*` paths, as the legacy UI called them (`fetch("/api/projects")`), with the base URL and
 * Bearer token added. Same method/body/JSON conventions as the legacy Next.js API.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, token } = await getEndpoint()
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json")
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** JSON helper that throws `ApiError` carrying the legacy `{ message }` body on non-2xx. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new ApiError(res.status, body?.message ?? res.statusText)
  return body as T
}

/** Accept only a ready message with a valid loopback port; the launch token remains owned by each client. */
export const acceptSidecarStatus = (payload: unknown): void => {
  if (payload === null || typeof payload !== "object") return
  const status = payload as { state?: unknown; port?: unknown }
  // Calls made while the sidecar restarts wait for its new port instead of failing against the old one.
  if (status.state === "restarting") { sidecarFailed = false; closeRestartGate(); return }
  if (status.state === "failed") { sidecarFailed = true; openRestartGate(); return }
  if (status.state !== "ready" || typeof status.port !== "number" || !Number.isInteger(status.port) || status.port < 1 || status.port > 65535) return
  liveBaseUrl = `http://127.0.0.1:${status.port}`
  // The next direct apiFetch resolves the current shell endpoint too.
  cached = undefined
  sidecarFailed = false
  openRestartGate()
}

/** Register before boot resolves the endpoint, so a ready event cannot fall between boot and listener setup. */
export const trackSidecarStatus = async (): Promise<() => void> => {
  if (!isTauri()) return () => {}
  const { listen } = await import("@tauri-apps/api/event")
  return listen("sidecar-status", (event) => acceptSidecarStatus(event.payload))
}

export type SidecarNotice = "restarting" | "recovered" | "failed"

/**
 * What a `sidecar-status` payload means for the person using the app. The shell restarts a sidecar that crashed or stopped answering
 * its health probe; requests that were in flight then failed and are **not** repeated, so the person has to know. `restarting` carries
 * the state between two payloads: the first `ready` after a restart is a recovery, the first `ready` of a launch is not.
 */
export const sidecarNotice = (payload: unknown, restarting: boolean): { readonly notice?: SidecarNotice; readonly restarting: boolean } => {
  const state = payload !== null && typeof payload === "object" ? (payload as { state?: unknown }).state : undefined
  if (state === "restarting") return { notice: restarting ? undefined : "restarting", restarting: true }
  if (state === "ready") return { notice: restarting ? "recovered" : undefined, restarting: false }
  if (state === "failed") return { notice: "failed", restarting: false }
  return { restarting }
}

/** Reports restart, recovery and permanent failure of the sidecar. Outside the desktop shell there is nothing to hear. */
export const listenForSidecarNotices = async (onNotice: (notice: SidecarNotice) => void): Promise<() => void> => {
  if (!isTauri()) return () => {}
  const { listen } = await import("@tauri-apps/api/event")
  let restarting = false
  return listen("sidecar-status", (event) => {
    const next = sidecarNotice(event.payload, restarting)
    restarting = next.restarting
    if (next.notice !== undefined) onNotice(next.notice)
  })
}

/**
 * Rewrite only this client's sidecar origin. Request bodies, authorization and abort signals survive the move. A call made while the
 * sidecar restarts waits for the new port; a call that still fails to connect looks the port up again before the error goes on, so
 * the caller's retry reaches the new sidecar. No writes are retried here (see `retryingWrites`).
 */
export const followingFetch = (endpoint: Endpoint, base: typeof fetch = globalThis.fetch): typeof fetch => {
  const origin = new URL(endpoint.baseUrl).origin
  const transport = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const ours = url.origin === origin
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (ours) await waitForRestart(signal)
    if (ours && liveBaseUrl !== undefined) {
      const target = new URL(liveBaseUrl)
      url.host = target.host
      input = input instanceof Request ? new Request(url, input) : url
    }
    try {
      return await base(input, init)
    } catch (error) {
      if (ours && signal?.aborted !== true) await refreshEndpoint().catch(() => undefined)
      throw error
    }
  }
  return Object.assign(transport, { preconnect: base.preconnect })
}
