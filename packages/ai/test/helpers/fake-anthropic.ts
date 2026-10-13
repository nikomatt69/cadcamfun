/**
 * A fake Anthropic Messages server (`POST .../messages`, streamed). No network, no keys. It records every request body so a test can
 * read what the host actually sent: tool results, user messages, image blocks.
 */
export type AnthropicCompletion =
  | { readonly text: string }
  | { readonly toolUse: { readonly name: string; readonly input: unknown } }

export interface FakeAnthropic {
  readonly baseUrl: string
  readonly requests: Array<{ readonly messages: ReadonlyArray<{ role: string; content: unknown }>; readonly tools?: unknown; readonly [key: string]: unknown }>
  stop(): void
}

const sse = (events: ReadonlyArray<{ readonly type: string; readonly [key: string]: unknown }>) =>
  new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } })

const start = (id: string) => ({ type: "message_start", message: { id, type: "message", role: "assistant", model: "fake-claude", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })

export const startFakeAnthropic = (script: (request: FakeAnthropic["requests"][number], index: number) => AnthropicCompletion): FakeAnthropic => {
  const requests: FakeAnthropic["requests"] = []
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/messages")) return new Response("not found", { status: 404 })
      const body = await request.json() as FakeAnthropic["requests"][number]
      const index = requests.push(body) - 1
      const completion = script(body, index)
      if ("toolUse" in completion) {
        const json = JSON.stringify(completion.toolUse.input)
        return sse([
          start(`msg_${index}`),
          { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: `toolu_${index}`, name: completion.toolUse.name, input: {} } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: json } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 8 } },
          { type: "message_stop" }
        ])
      }
      return sse([
        start(`msg_${index}`),
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: completion.text } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6 } },
        { type: "message_stop" }
      ])
    }
  })
  return { baseUrl: `http://127.0.0.1:${server.port}/v1`, requests, stop: () => void server.stop(true) }
}
