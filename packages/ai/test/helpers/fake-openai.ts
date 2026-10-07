/**
 * A fake OpenAI-compatible `/v1/chat/completions` server that replays scripted
 * completions as SSE. No network, no keys.
 */
export interface ChatRequestBody {
  readonly model: string
  readonly messages: ReadonlyArray<{ role: string; content?: unknown; tool_call_id?: string; tool_calls?: unknown }>
  readonly tools?: ReadonlyArray<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>
  readonly stream?: boolean
}

export type Completion =
  | { readonly text: string; readonly chunks?: ReadonlyArray<string>; readonly usage?: { readonly prompt_tokens: number; readonly completion_tokens: number; readonly total_tokens: number } }
  | { readonly toolCalls: ReadonlyArray<{ readonly name: string; readonly args: unknown }> }
  | { readonly status: number; readonly body: string }

export interface FakeOpenAi {
  readonly baseUrl: string
  readonly requests: ChatRequestBody[]
  /** Auth headers seen, in order. */
  readonly authHeaders: string[]
  stop(): void
}

const chunk = (delta: unknown, finish: string | null = null, usage?: unknown) =>
  `data: ${JSON.stringify({
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    created: 1,
    model: "fake-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {})
  })}\n\n`

const sse = (parts: string[]) =>
  new Response(parts.join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })

export const startFakeOpenAi = (script: (request: ChatRequestBody, index: number) => Completion): FakeOpenAi => {
  const requests: ChatRequestBody[] = []
  const authHeaders: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      if (!url.pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 })
      const body = (await req.json()) as ChatRequestBody
      authHeaders.push(req.headers.get("authorization") ?? "")
      requests.push(body)
      const completion = script(body, requests.length - 1)
      if ("status" in completion) return new Response(completion.body, { status: completion.status })
      if ("toolCalls" in completion) {
        const calls = completion.toolCalls.map((call, index) => ({
          index,
          id: `call_${requests.length}_${index}`,
          type: "function",
          function: { name: call.name, arguments: "" }
        }))
        const parts = [chunk({ role: "assistant", content: "" })]
        for (const call of calls) parts.push(chunk({ tool_calls: [call] }))
        completion.toolCalls.forEach((call, index) => {
          const json = JSON.stringify(call.args)
          const mid = Math.ceil(json.length / 2)
          for (const piece of [json.slice(0, mid), json.slice(mid)]) {
            parts.push(chunk({ tool_calls: [{ index, function: { arguments: piece } }] }))
          }
        })
        parts.push(chunk({}, "tool_calls", { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }))
        return sse(parts)
      }
      const pieces = completion.chunks ?? [completion.text]
      const parts = [chunk({ role: "assistant", content: "" })]
      for (const piece of pieces) parts.push(chunk({ content: piece }))
      parts.push(chunk({}, "stop", completion.usage ?? { prompt_tokens: 21, completion_tokens: 9, total_tokens: 30 }))
      return sse(parts)
    }
  })
  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    requests,
    authHeaders,
    stop: () => void server.stop(true)
  }
}

export const toolNames = (request: ChatRequestBody): string[] => (request.tools ?? []).map((t) => t.function.name)

/** Requests that carry tools are the chat turns (helper agents send none). */
export const chatTurns = (requests: ReadonlyArray<ChatRequestBody>): ChatRequestBody[] =>
  requests.filter((r) => (r.tools ?? []).length > 0)
