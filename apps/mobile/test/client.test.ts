import { describe, expect, test } from "bun:test"
import { CompanionClient, CompanionError, type Transport } from "../lib/client"

/** An in-memory transport that records calls and replays canned responses. */
class FakeTransport implements Transport {
  calls: Array<{ path: string; method: string; body?: unknown }> = []
  handler: (path: string, method: string, body?: unknown) => { status: number; body: string } = () => ({ status: 200, body: "{}" })
  streams: Array<string[]> = []

  request(path: string, method: string, body?: unknown) {
    this.calls.push({ path, method, body })
    const res = this.handler(path, method, body)
    return Promise.resolve(res)
  }

  async *stream(path: string, method: string, body?: unknown): AsyncGenerator<string> {
    this.calls.push({ path, method, body })
    for (const chunk of this.streams.shift() ?? []) yield chunk
  }
}

const client = (transport: Transport) => new CompanionClient(transport)

describe("CompanionClient", () => {
  test("health hits /api/health", async () => {
    const t = new FakeTransport()
    await client(t).health()
    expect(t.calls[0]).toEqual({ path: "/api/health", method: "GET" })
  })

  test("agent roster uses the read-only companion route", async () => {
    const t = new FakeTransport()
    t.handler = () => ({ status: 200, body: JSON.stringify([{ id: "machinist", title: "CAM programmer", description: "Programs and verifies machining", tools: ["cam_verify_toolpath"], edits: true }]) })
    const agents = await client(t).agents()
    expect(agents).toHaveLength(1)
    expect(t.calls[0]).toEqual({ path: "/api/ai/agents", method: "GET" })
  })

  test("workspace preview routes are GET and encode ids", async () => {
    const t = new FakeTransport()
    t.handler = () => ({ status: 200, body: JSON.stringify([]) })
    const api = client(t)
    await api.workspaceDrawings("p 1")
    await api.drawingPreview("p 1", "d/1")
    await api.toolpathReview("p 1", "t 1")
    await api.workspaceLibrary("p 1")
    expect(t.calls.map((call) => [call.method, call.path])).toEqual([
      ["GET", "/api/projects/p%201/workspace/drawings"],
      ["GET", "/api/projects/p%201/workspace/drawings/d%2F1/preview"],
      ["GET", "/api/projects/p%201/workspace/toolpaths/t%201"],
      ["GET", "/api/projects/p%201/workspace/library"],
    ])
  })

  test("project paths are URL-encoded", async () => {
    const t = new FakeTransport()
    await client(t).status("a b/c")
    expect(t.calls[0]?.path).toBe("/api/projects/a%20b%2Fc/vcs/status")
  })

  test("a 4xx with a message becomes a CompanionError", async () => {
    const t = new FakeTransport()
    t.handler = () => ({ status: 403, body: JSON.stringify({ message: "Not available to a companion device" }) })
    await expect(client(t).projects()).rejects.toMatchObject({ status: 403, message: "Not available to a companion device" })
  })

  test("a non-JSON error body falls back to the status", async () => {
    const t = new FakeTransport()
    t.handler = () => ({ status: 500, body: "<html>oops</html>" })
    await expect(client(t).projects()).rejects.toBeInstanceOf(CompanionError)
  })

  test("diff builds the to/from query", async () => {
    const t = new FakeTransport()
    await client(t).diff("p1", "abc", "def")
    expect(t.calls[0]?.path).toBe("/api/projects/p1/vcs/diff?to=abc&from=def")
  })

  test("chat decodes SSE frames into events", async () => {
    const t = new FakeTransport()
    t.streams.push(['data: {"type":"delta","sessionId":"s1","text":"hi"}\n\n', 'data: {"type":"done","sessionId":"s1","text":"hi"}\n\n'])
    const events: string[] = []
    for await (const event of client(t).chat({ projectId: "p1", message: "hello" })) {
      if ("type" in event && typeof event.type === "string") events.push(event.type)
    }
    expect(events).toEqual(["delta", "done"])
    expect(t.calls[0]).toEqual({ path: "/api/ai/chat/stream", method: "POST", body: { projectId: "p1", message: "hello" } })
  })

  test("a frame split across chunks still parses", async () => {
    const t = new FakeTransport()
    t.streams.push(['data: {"type":"delta","sessionId":"s1","te', 'xt":"half"}\n\n', 'data: {"type":"done","sessionId":"s1","text":"half"}\n\n'])
    const texts: string[] = []
    for await (const event of client(t).chat({ projectId: "p1", message: "x" })) {
      if (event.type === "delta") texts.push((event as Extract<typeof event, { type: "delta" }>).text)
    }
    expect(texts).toEqual(["half"])
  })

  test("dispatch sends the optional ref", async () => {
    const t = new FakeTransport()
    await client(t).dispatch("p1", "main")
    expect(t.calls[0]?.body).toEqual({ ref: "main" })
  })

  test("notifications encodes the query", async () => {
    const t = new FakeTransport()
    await client(t).notifications({ limit: 10, onlyUnread: true })
    expect(t.calls[0]?.path).toBe("/api/notifications?limit=10&onlyUnread=true")
  })
})

test("successful invalid JSON and redirects are errors rather than undefined data", async () => {
  const t = new FakeTransport()
  t.handler = () => ({ status: 200, body: "<html>not JSON</html>" })
  await expect(client(t).projects()).rejects.toThrow("invalid JSON")
  t.handler = () => ({ status: 302, body: "" })
  await expect(client(t).projects()).rejects.toMatchObject({ status: 302 })
})

test("questions and session recovery use the shared desktop API", async () => {
  const t = new FakeTransport()
  t.handler = () => ({ status: 200, body: JSON.stringify({ busy: false, text: "Recovered" }) })
  await client(t).questionReply("s", "q", [["Aluminum"]])
  await client(t).questionReject("s", "q")
  await client(t).sessionState("s")
  expect(t.calls).toEqual([
    { path: "/api/ai/sessions/control", method: "POST", body: { sessionId: "s", action: "answer_question", requestId: "q", answers: [["Aluminum"]] } },
    { path: "/api/ai/sessions/control", method: "POST", body: { sessionId: "s", action: "reject_question", requestId: "q" } },
    { path: "/api/ai/sessions/state", method: "POST", body: { sessionId: "s" } },
  ])
})

test("an incomplete assistant stream recovers the stored answer without resending", async () => {
  const t = new FakeTransport()
  t.streams.push(['data: {"type":"delta","sessionId":"s1","text":"partial"}\n\n'])
  t.handler = () => ({ status: 200, body: JSON.stringify({ busy: false, text: "Built and checked" }) })
  const events = []
  for await (const event of client(t).chat({ projectId: "p1", message: "Build" })) events.push(event)
  expect(events.at(-1)).toMatchObject({ type: "done", text: "Built and checked", recovered: true })
  expect(t.calls.map((call) => call.path)).toEqual(["/api/ai/chat/stream", "/api/ai/sessions/state"])
})

test("native network failures recover with the observed native session id", async () => {
  let posts = 0
  const transport: Transport = {
    request: async (_path, _method, body) => {
      expect(body).toEqual({ sessionId: "ses_native" })
      return { status: 200, body: JSON.stringify({ busy: false, text: "Finished" }) }
    },
    async *stream() {
      posts += 1
      yield 'data: {"type":"turn","phase":"start","sessionId":"ses_native"}\n\n'
      throw new Error("The network connection was lost")
    },
  }
  const events = []
  for await (const event of client(transport).chat({ projectId: "p", sessionId: "mobile-alias", message: "Build" })) events.push(event)
  expect(events.at(-1)).toMatchObject({ type: "done", text: "Finished" })
  expect(posts).toBe(1)
})

test("recovery restores pending approvals and questions and can be cancelled", async () => {
  const t = new FakeTransport()
  t.handler = (path) => ({ status: 200, body: JSON.stringify(path === "/api/ai/sessions/state"
    ? { busy: true, text: "", events: [{ type: "tool_call", sessionId: "s", callId: "c", tool: "cad_edit", input: {} }] }
    : { permissions: [{ sessionId: "s", requestId: "p", permission: "cad_edit", patterns: [] }], questions: [{ requestId: "q", questions: [] }] }) })
  const controller = new AbortController()
  const events = []
  for await (const event of client(t).resumeChat("s", controller.signal)) {
    events.push(event.type)
    if (event.type === "question_request") controller.abort()
  }
  expect(events).toEqual(["tool_call", "permission_request", "question_request"])
  expect(t.calls.every((call) => call.path !== "/api/ai/chat/stream")).toBe(true)
})

test("a terminal frame releases the transport without waiting for another chunk", async () => {
  let released = false
  const transport: Transport = {
    request: async () => { throw new Error("No recovery needed") },
    async *stream() {
      try {
        yield 'data: {"type":"done","sessionId":"s","text":"Done"}\n\n'
        throw new Error("Must not read past the terminal event")
      } finally { released = true }
    },
  }
  for await (const event of client(transport).chat({ projectId: "p", message: "Hi" })) expect(event.type).toBe("done")
  expect(released).toBe(true)
})

test("the mobile model picker reads the desktop catalogue and sends the exact model and thinking settings", async () => {
  const t = new FakeTransport()
  t.handler = () => ({ status: 200, body: "[]" })
  await client(t).aiProviders()
  t.streams.push(['data: {"type":"done","sessionId":"s","text":"Ready"}\n\n'])
  const body = { projectId: "p", message: "Hi", model: { provider: "openai", model: "family/model", variant: "high" }, permissionMode: "ask", includeContext: false } as const
  for await (const event of client(t).chat(body)) expect(event.type).toBe("done")
  expect(t.calls).toEqual([
    { method: "GET", path: "/api/ai/providers", body: undefined },
    { method: "POST", path: "/api/ai/chat/stream", body },
  ])
})
