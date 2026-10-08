import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { makeApp } from "./helpers.ts"

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined }
}
const reply = "Reply from the scripted model."
const streams: MockLanguageModelV4[] = []
const model = () => {
  const mock = new MockLanguageModelV4({
  doGenerate: async () => ({ content: [{ type: "text", text: reply }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] }, { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Hel" }, { type: "text-delta", id: "t", delta: "lo" }, { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }
      ]
    })
  })
  })
  streams.push(mock)
  return mock
}

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp({ aiModelFactory: () => model() }) })
afterAll(async () => { await app.dispose() })
const post = (path: string, json: unknown) => app.call(path, { method: "POST", json })
const configure = () => app.call("/api/ai/credentials", { method: "PUT", json: { provider: "anthropic", key: "sk-ant-sentinel-123456" } })

describe("/api/ai credentials, status and models", () => {
  test("requires the launch token", async () => {
    expect((await app.call("/api/ai/status", { auth: false })).status).toBe(401)
  })

  test("nothing is configured at first and every model is listed", async () => {
    const s = await app.call("/api/ai/status")
    expect(s.body).toMatchObject({ configured: false, host: "direct" })
    expect(s.body.providers.anthropic).toBe("missing")
    const models = await app.call("/api/ai/models")
    expect(models.body.length).toBeGreaterThan(4)
    expect(models.body.every((m: { configured: boolean }) => !m.configured)).toBe(true)
  })

  test("a saved key is kept in <data dir>/ai/credentials.json (owner-only) and removed again when cleared", async () => {
    const { existsSync, readFileSync, statSync } = await import("node:fs")
    const file = `${app.dataDir}/ai/credentials.json`
    expect((await configure()).status).toBe(200)
    expect(JSON.parse(readFileSync(file, "utf8")).providers.anthropic.key).toBe("sk-ant-sentinel-123456")
    expect(statSync(file).mode & 0o077).toBe(0)
    expect((await app.call("/api/ai/credentials/anthropic", { method: "DELETE" })).status).toBe(200)
    expect(existsSync(file) && "anthropic" in JSON.parse(readFileSync(file, "utf8")).providers).toBe(false)
  })

  test("credentials are validated, stored in memory, never echoed, and can be cleared", async () => {
    expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "nope", key: "k" } })).body.message).toBe("Unknown provider")
    expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "openai" } })).body.message).toBe("API key is required")
    expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "openai", key: "k", baseUrl: "ftp://x" } })).status).toBe(400)
    const ok = await configure()
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).not.toContain("sentinel")
    expect(ok.body).toMatchObject({ configured: true })
    const models = await app.call("/api/ai/models")
    expect(models.body.some((m: { configured: boolean; provider: string }) => m.configured && m.provider === "anthropic")).toBe(true)
    const cleared = await app.call("/api/ai/credentials/anthropic", { method: "DELETE" })
    expect(cleared.body.providers.anthropic).toBe("missing")
  })
})

describe("/api/ai legacy generation routes", () => {
  test("validation messages", async () => {
    expect((await post("/api/ai/chat", {})).body.error).toBe("Messages are required and must be an array")
    expect((await post("/api/ai/completion", {})).body.message).toBe("Prompt is required")
    expect((await post("/api/ai/analyze-gcode", {})).body.message).toBe("G-code is required")
    expect((await post("/api/ai/toolpath-analysis", {})).body.message).toBe("G-code is required")
    expect((await post("/api/ai/feedback", { messageId: "m" })).body.error).toBe("Missing required fields: messageId and rating")
    const bad = await post("/api/ai/gcode", { action: "explode" })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toStartWith("Unknown action: explode")
    expect((await post("/api/ai/gcode", { action: "complete" })).body.error).toBe("Partial code is required for completion")
  })

  test("without a key a model call is a 500 with the legacy message", async () => {
    const r = await post("/api/ai/completion", { prompt: "hi" })
    expect(r.status).toBe(500)
    expect(r.body.message).toBe("Error generating completion")
  })

  test("with a key the routes answer from the model", async () => {
    await configure()
    expect((await post("/api/ai/completion", { prompt: "hi" })).body).toMatchObject({ text: reply })
    expect((await post("/api/ai/chat", { messages: [{ role: "user", content: "hi" }] })).body).toEqual({ reply, hasMcpData: false })
    expect((await post("/api/ai/toolpath-analysis", { gcode: "G1 X1" })).body).toEqual({ insights: reply })
    const proxy = await post("/api/ai/proxy", { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }], system: "be brief" })
    expect(proxy.body).toMatchObject({ type: "message", role: "assistant", content: [{ type: "text", text: reply }] })
    const generate = await post("/api/ai/gcode", { action: "generate", description: "square" })
    expect(generate.body).toMatchObject({ success: true, action: "generate", data: { gcode: reply } })
    expect((await post("/api/ai/feedback", { messageId: "m", rating: "good" })).body).toEqual({ success: true, message: "Feedback received" })
  })

  test("analyze-gcode and the analyze action are deterministic", async () => {
    const r = await post("/api/ai/analyze-gcode", { gcode: "G1 X10 F100\nM30" })
    expect(r.body.issues.map((i: { code: string }) => i.code)).toContain("CUT_WITHOUT_SPINDLE")
    const action = await post("/api/ai/gcode", { gcode: "G21\nM3 S1000\nG1 X5 F100\nM30" })
    expect(action.body).toMatchObject({ success: true, action: "analyze", data: { issues: [] } })
  })
})

describe("/api/ai/chat/stream", () => {
  test("streams typed events over SSE ending with done", async () => {
    await configure()
    const r = await app.call("/api/ai/chat/stream", { method: "POST", json: { message: "hi", context: "Drawing: empty" } })
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toContain("text/event-stream")
    const events = String(r.body).split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)))
    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Hello")
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Hello" })
  })

  test("the assistant starts with the stored project context and its saved notes", async () => {
    await configure()
    await app.call("/api/kv/ai.context.proj-1", { method: "PUT", json: { value: "Part: 80x40 aluminium bracket" } })
    await app.call("/api/kv/ai.memory.units", { method: "PUT", json: { value: "Always millimetres" } })
    streams.length = 0
    await app.call("/api/ai/chat/stream", { method: "POST", json: { message: "hi", projectId: "proj-1", context: "Selected: 2 holes" } })
    const call = streams.at(-1)!.doStreamCalls[0]!
    const system = JSON.stringify(call.prompt)
    expect(system).toContain("Selected: 2 holes")
    expect(system).toContain("Part: 80x40 aluminium bracket")
    expect(system).toContain("units: Always millimetres")
  })

  test("a missing message is rejected", async () => {
    expect((await post("/api/ai/chat/stream", {})).body.message).toBe("Message is required")
    expect((await post("/api/ai/chat/abort", {})).body.message).toBe("sessionId is required")
    expect((await post("/api/ai/chat/abort", { sessionId: "s" })).body.message).toBe("Aborted")
  })
})
