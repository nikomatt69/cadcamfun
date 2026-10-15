/**
 * Optional nikcli backend for the docs assistant.
 *
 * CADCAMFUN's own AI runs on the nikcli host, so the docs assistant can too.
 * The default engine is Workers AI (free for every visitor, no login). When a
 * deployment also points at a nikcli server, the assistant runs as a real
 * nikcli session instead: same agent loop and session memory as the app, and
 * follow-up questions reuse the session.
 *
 * Talks to the server's mobile session routes over plain fetch (no SDK in the
 * Worker bundle): POST /mobile/session, GET /mobile/session/:id/stream (SSE),
 * POST /mobile/session/:id/message.
 *
 * Configure with CADCAMFUN_DOCS_SERVER + CADCAMFUN_DOCS_TOKEN (and optionally
 * CADCAMFUN_DOCS_AGENT / CADCAMFUN_DOCS_DIRECTORY).
 */

export type NikcliBackendConfig = {
  url: string
  token: string
  agent?: string
  directory?: string
}

export type NikcliTurn = {
  sessionID: string
  /** Full assistant text so far — replaces, it does not append. */
  stream: AsyncGenerator<string>
}

/** Stop waiting for a nikcli answer after this long. */
const TURN_TIMEOUT_MS = 90_000

export function nikcliBackendConfig(env: CloudflareEnv): NikcliBackendConfig | null {
  const url = env.CADCAMFUN_DOCS_SERVER?.trim()
  const token = env.CADCAMFUN_DOCS_TOKEN?.trim()
  if (!url || !token) return null
  return {
    url: url.replace(/\/$/, ""),
    token,
    agent: env.CADCAMFUN_DOCS_AGENT?.trim() || undefined,
    directory: env.CADCAMFUN_DOCS_DIRECTORY?.trim() || undefined,
  }
}

function route(config: NikcliBackendConfig, path: string) {
  const url = new URL(`${config.url}${path}`)
  if (config.directory) url.searchParams.set("directory", config.directory)
  return url.toString()
}

function headers(config: NikcliBackendConfig, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${config.token}`, ...extra }
}

type StreamEvent = {
  type?: string
  properties?: {
    info?: { id?: string; role?: string }
    part?: { id?: string; messageID?: string; type?: string; text?: string }
  }
}

/** Parses the session SSE stream into `{type, properties}` events. */
async function* sessionEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const parse = (frame: string): StreamEvent | null => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("")
    if (!data) return null
    try {
      const parsed = JSON.parse(data) as StreamEvent & { payload?: StreamEvent; data?: StreamEvent }
      // Servers send the event itself, or wrap it in `payload` / `data`.
      return parsed.type ? parsed : (parsed.payload ?? parsed.data ?? null)
    } catch {
      return null
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const event = parse(frame)
        if (event) yield event
      }
    }
    const tail = parse(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function assistantText(parts: Map<string, { role: string; text: string }>) {
  return [...parts.values()]
    .filter((part) => part.role === "assistant")
    .map((part) => part.text)
    .join("")
    .trim()
}

/**
 * Sends a prompt to a nikcli session and yields the assistant answer as it
 * grows. Creates the session when `sessionID` is missing.
 */
export async function runNikcliTurn(input: {
  config: NikcliBackendConfig
  prompt: string
  sessionID?: string
  signal?: AbortSignal
}): Promise<NikcliTurn> {
  const { config } = input

  let sessionID = input.sessionID
  if (!sessionID) {
    const created = await fetch(route(config, "/mobile/session"), {
      method: "POST",
      headers: headers(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "cadcamfun docs support" }),
      signal: input.signal,
    })
    if (!created.ok) throw new Error(`nikcli session create failed: ${created.status}`)
    const session = (await created.json()) as { id?: string; data?: { id?: string } }
    sessionID = session.id ?? session.data?.id
    if (!sessionID) throw new Error("nikcli did not return a session id")
  }
  const id = sessionID

  // Subscribe before sending, so no part update is missed.
  const subscription = await fetch(route(config, `/mobile/session/${encodeURIComponent(id)}/stream`), {
    headers: headers(config, { Accept: "text/event-stream" }),
    signal: input.signal,
  })
  if (!subscription.ok || !subscription.body) throw new Error(`nikcli stream failed: ${subscription.status}`)

  const sent = await fetch(route(config, `/mobile/session/${encodeURIComponent(id)}/message`), {
    method: "POST",
    headers: headers(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ agent: config.agent, parts: [{ type: "text", text: input.prompt }] }),
    signal: input.signal,
  })
  if (!sent.ok) {
    await subscription.body.cancel().catch(() => undefined)
    throw new Error(`nikcli message failed: ${sent.status}`)
  }

  const body = subscription.body
  const stream = (async function* () {
    const started = Date.now()
    const parts = new Map<string, { role: string; text: string }>()
    const roles = new Map<string, string>()
    let last = ""

    try {
      for await (const event of sessionEvents(body)) {
        if (input.signal?.aborted) break
        if (Date.now() - started > TURN_TIMEOUT_MS) break

        if (event.type === "message.updated" && event.properties?.info?.id) {
          roles.set(event.properties.info.id, event.properties.info.role ?? "assistant")
          continue
        }

        if (event.type === "message.part.updated") {
          const part = event.properties?.part
          if (!part?.id || part.type !== "text" || typeof part.text !== "string") continue
          parts.set(part.id, {
            role: roles.get(part.messageID ?? "") ?? "assistant",
            text: part.text,
          })

          const text = assistantText(parts)
          if (text && text !== last) {
            last = text
            yield text
          }
          continue
        }

        if (event.type === "session.idle" || event.type === "session.error") break
      }
    } finally {
      await body.cancel().catch(() => undefined)
    }
  })()

  return { sessionID: id, stream }
}
