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

const client = (transport: FakeTransport) => new CompanionClient(transport)

describe("CompanionClient", () => {
  test("health hits /api/health", async () => {
    const t = new FakeTransport()
    await client(t).health()
    expect(t.calls[0]).toEqual({ path: "/api/health", method: "GET" })
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
  await client(t).questionReply("s", "q", [["Aluminum"]])
  await client(t).questionReject("s", "q")
  await client(t).sessionState("s")
  expect(t.calls).toEqual([
    { path: "/api/ai/sessions/control", method: "POST", body: { sessionId: "s", action: "answer_question", requestId: "q", answers: [["Aluminum"]] } },
    { path: "/api/ai/sessions/control", method: "POST", body: { sessionId: "s", action: "reject_question", requestId: "q" } },
    { path: "/api/ai/sessions/state", method: "POST", body: { sessionId: "s" } },
  ])
})

test("an incomplete assistant stream is a recoverable connection failure", async () => {
  const t = new FakeTransport()
  t.streams.push(['data: {"type":"delta","sessionId":"s1","text":"partial"}\n\n'])
  const consume = async () => { for await (const event of client(t).chat({ projectId: "p1", message: "Build" })) void event }
  await expect(consume()).rejects.toMatchObject({ status: 0, message: "The assistant connection ended before the turn finished" })
})
