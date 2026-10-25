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
  if (status.state !== "ready" || typeof status.port !== "number" || !Number.isInteger(status.port) || status.port < 1 || status.port > 65535) return
  liveBaseUrl = `http://127.0.0.1:${status.port}`
  // The next direct apiFetch resolves the current shell endpoint too.
  cached = undefined
}

/** Register before boot resolves the endpoint, so a ready event cannot fall between boot and listener setup. */
export const trackSidecarStatus = async (): Promise<() => void> => {
  if (!isTauri()) return () => {}
  const { listen } = await import("@tauri-apps/api/event")
  return listen("sidecar-status", (event) => acceptSidecarStatus(event.payload))
}

/** Rewrite only this client's sidecar origin. Request bodies, authorization and abort signals survive the move. No writes are retried. */
export const followingFetch = (endpoint: Endpoint, base: typeof fetch = globalThis.fetch): typeof fetch => {
  const origin = new URL(endpoint.baseUrl).origin
  const transport = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (liveBaseUrl !== undefined && url.origin === origin) {
      const target = new URL(liveBaseUrl)
      url.host = target.host
      input = input instanceof Request ? new Request(url, input) : url
    }
    return base(input, init)
  }
  return Object.assign(transport, { preconnect: base.preconnect })
}
