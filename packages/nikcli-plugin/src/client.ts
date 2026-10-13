/**
 * The HTTP face of the application, as a standalone nikcli reaches it: `GET /api/ai/actions` for the catalogue and
 * `POST /api/ai/actions/invoke` for a call. The bearer token is the one the application's own windows use; it is sent on every
 * request and never logged or put in an error.
 */
export interface BridgeTool {
  readonly id: string
  readonly description: string
  readonly kind: "read" | "write" | "destructive"
  readonly actions: ReadonlyArray<{ readonly id: string; readonly name: string; readonly kind: "read" | "write" | "destructive" }>
  readonly parameters: Record<string, unknown>
}

export interface BridgeOptions {
  /** Base URL of the running sidecar, e.g. `http://127.0.0.1:43111`. */
  readonly url: string
  readonly token: string
  /** Defaults to the global `fetch`; tests and unusual transports inject their own. */
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>
}

export class BridgeError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const messageOf = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "")
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown }
    if (typeof body.message === "string") return body.message
    if (typeof body.error === "string") return body.error
  } catch { /* not JSON */ }
  return text.slice(0, 300) || `HTTP ${response.status}`
}

export class BridgeClient {
  readonly #base: string
  readonly #fetch: (input: string, init?: RequestInit) => Promise<Response>
  readonly #token: string
  constructor(options: BridgeOptions) {
    this.#base = options.url.replace(/\/+$/, "")
    this.#token = options.token
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init))
  }

  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.#fetch(`${this.#base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${this.#token}`, ...(init.body ? { "content-type": "application/json" } : {}) } })
    if (response.status === 401) throw new BridgeError("CADCAMFUN refused the token (401). Use the token the running application was launched with.", 401)
    return response
  }

  async tools(): Promise<ReadonlyArray<BridgeTool>> {
    const response = await this.#request("/api/ai/actions")
    if (!response.ok) throw new BridgeError(`Could not read the CADCAMFUN catalogue: ${await messageOf(response)}`, response.status)
    return ((await response.json()) as { tools: ReadonlyArray<BridgeTool> }).tools
  }

  /** Runs one action. A refusal by the application (400) is returned as `{ ok: false, error }`, so the agent can read it and recover. */
  async invoke(projectId: string, tool: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const response = await this.#request("/api/ai/actions/invoke", { method: "POST", body: JSON.stringify({ projectId, tool, input }), ...(signal ? { signal } : {}) })
    if (response.status === 400) return { ok: false, error: await messageOf(response) }
    if (!response.ok) throw new BridgeError(`CADCAMFUN could not run ${tool}: ${await messageOf(response)}`, response.status)
    return ((await response.json()) as { result: unknown }).result
  }
}
