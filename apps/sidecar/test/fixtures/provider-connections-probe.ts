import { expect } from "bun:test"
import { Context, Effect, Option } from "effect"
import { AiCredentials, AiHost, AiService, jsonFileCredentials } from "@cadcamfun/ai"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { makeApp } from "../helpers.ts"

// All external authentication and inference is simulated; callbacks bind only to loopback.
const originalFetch = globalThis.fetch
const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = []
let exchanges = 0
let refreshes = 0
const access = `fixture-access.${Buffer.from(JSON.stringify({ chatgpt_account_id: "fixture-account" })).toString("base64url")}.signature`
globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return originalFetch(input, init)
  if (url.pathname.includes(".well-known/openid-configuration")) return Response.json({ authorization_endpoint: "https://auth.x.ai/authorize", token_endpoint: "https://auth.x.ai/token" })
  if (url.hostname.startsWith("auth.")) {
    exchanges++
    if (new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token") refreshes++
    return Response.json({ access_token: access, refresh_token: "fixture-refresh", expires_in: 3600 })
  }
  if (url.hostname === "chatgpt.com" || url.hostname === "api.x.ai") {
    const request = new Request(input, init)
    requests.push({ url: url.toString(), headers: request.headers, body: await request.json() as Record<string, unknown> })
    const message = { id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Subscription reply.", annotations: [] }] }
    const response = { id: "resp_fixture", object: "response", created_at: 1, model: url.hostname === "chatgpt.com" ? "gpt-5.4" : "grok-4", status: "completed", output: [message], usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }
    const events = [
      { type: "response.created", response: { ...response, output: [], status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
      { type: "response.content_part.added", item_id: message.id, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
      { type: "response.output_text.delta", item_id: message.id, output_index: 0, content_index: 0, delta: "Subscription reply." },
      { type: "response.output_text.done", item_id: message.id, output_index: 0, content_index: 0, text: "Subscription reply." },
      { type: "response.output_item.done", output_index: 0, item: message },
      { type: "response.completed", response }
    ]
    return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } })
  }
  if (url.hostname === "opencode.ai") {
    const request = new Request(input, init)
    requests.push({ url: url.toString(), headers: request.headers, body: await request.json() as Record<string, unknown> })
    const chunk = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "minimax-m3", choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } } : {}) })}\n\n`
    return new Response(chunk({ role: "assistant", content: "Connected model reply." }) + chunk({}, "stop") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } })
  }
  throw new Error(`Unexpected external request to ${url.hostname}`)
}, { preconnect: originalFetch.preconnect })

const dataDir = mkdtempSync(join(tmpdir(), "cadcam-provider-persistence-"))
const app = await makeApp({ dataDir, aiHost: "nikcli", aiOffline: true })
let completed = false
try {
  const services = await app.services()
  const host = Context.getOption(services, AiHost)
  if (Option.isNone(host)) throw new Error("Native host is missing")
  const runtime = host.value.runtime
  // The test is offline. Supply a supported Codex model that the native OAuth filter retains.
  mkdirSync(runtime.paths.cache, { recursive: true })
  writeFileSync(join(runtime.paths.cache, "models.json"), JSON.stringify({
    openai: { id: "openai", name: "OpenAI", env: [], npm: "@ai-sdk/openai", api: "https://api.openai.com/v1", models: {
      "gpt-5.4": { id: "gpt-5.4", name: "GPT 5.4", tool_call: true, attachment: true, reasoning: true, limit: { context: 200000, output: 4096 }, cost: { input: 1, output: 1 }, modalities: { input: ["text"], output: ["text"] } }
    } },
    xai: { id: "xai", name: "xAI", env: [], npm: "@ai-sdk/openai", api: "https://api.x.ai/v1", models: {
      "grok-4": { id: "grok-4", name: "Grok 4", tool_call: true, reasoning: true, limit: { context: 200000, output: 4096 }, cost: { input: 1, output: 1 }, modalities: { input: ["text"], output: ["text"] } }
    } }
  }))
  const post = (path: string, json: unknown) => app.call(path, { method: "POST", json })
  const providers = await app.call("/api/ai/providers")
  expect(providers.status).toBe(200)
  expect(providers.body.map((provider: { id: string }) => provider.id)).toEqual(expect.arrayContaining(["openai", "xai", "opencode", "opencode-go"]))
  expect((await post("/api/ai/oauth/authorize", { provider: "opencode" })).status).toBe(400)
  expect((await app.call("/api/ai/oauth/authorize", { method: "POST", json: { provider: "openai" }, auth: false })).status).toBe(401)
  expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "openai", key: "fixture-replaced-key" } })).status).toBe(200)
  for (const provider of ["openai", "xai"]) {
    const start = await post("/api/ai/oauth/authorize", { provider })
    expect(start.status, JSON.stringify(start.body)).toBe(200)
    expect(JSON.stringify(start.body)).not.toContain("fixture-access")
    expect((await post("/api/ai/oauth/authorize", { provider })).status).toBe(400)
    expect((await post("/api/ai/oauth/complete", { provider, attemptId: "wrong-attempt" })).status).toBe(400)
    const url = new URL(start.body.url)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    const callback = new URL(url.searchParams.get("redirect_uri")!)
    callback.searchParams.set("code", "fixture-code")
    callback.searchParams.set("state", url.searchParams.get("state")!)
    // OpenAI uses its loopback callback; xAI exercises the manual-code fallback.
    if (provider === "openai") expect((await originalFetch(callback)).status).toBe(200)
    const complete = await post("/api/ai/oauth/complete", { provider, attemptId: start.body.attemptId, ...(provider === "xai" ? { code: "fixture-code" } : {}) })
    expect(complete.status).toBe(200)
    expect(complete.body.providers[provider]).toBe("configured")
    expect((await post("/api/ai/oauth/complete", { provider, attemptId: start.body.attemptId })).status).toBe(400)
  }
  expect(exchanges).toBe(2)
  expect(JSON.parse(readFileSync(join(dataDir, "ai", "credentials.json"), "utf8")).providers.openai).toBeUndefined()
  const authFile = join(runtime.paths.data, "auth.json")
  expect(statSync(authFile).mode & 0o077).toBe(0)
  expect(JSON.parse(readFileSync(authFile, "utf8")).openai.type).toBe("oauth")
  for (const provider of ["openai", "xai"]) {
    const saved = JSON.parse(readFileSync(authFile, "utf8"))
    saved[provider].expires = 1
    writeFileSync(authFile, JSON.stringify(saved), { mode: 0o600 })
    const result = await Effect.runPromise(Context.get(services, AiService).complete({ prompt: "Reply briefly.", model: { provider, model: provider === "openai" ? "gpt-5.4" : "grok-4" } }))
    expect(result.text).toBe("Subscription reply.")
    expect(requests.at(-1)!.headers.get("authorization")).toBe(`Bearer ${access}`)
    if (provider === "openai") expect(requests.at(-1)!.url).toBe("https://chatgpt.com/backend-api/codex/responses")
  }
  expect(refreshes).toBe(2)
  for (const provider of ["opencode", "opencode-go"]) {
    expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider, key: "fixture-opencode-key" } })).status).toBe(200)
    const result = await Effect.runPromise(Context.get(services, AiService).complete({ prompt: "Reply briefly.", model: { provider, model: "minimax-m3" } }))
    expect(result.text).toBe("Connected model reply.")
    const request = requests.at(-1)!
    expect(request.url).toBe(`https://opencode.ai/inference/${provider === "opencode-go" ? "go/" : ""}openai/v1/chat/completions`)
    expect(request.headers.get("authorization")).toBe("Bearer fixture-opencode-key")
    expect(request.headers.get("user-agent")).toBe("CADCAMFUN/6")
    expect(request.headers.get("x-opencode-session")).toMatch(/^ses_/)
    expect(request.body.tools ?? []).toEqual([])
    expect((await app.call(`/api/ai/credentials/${provider}`, { method: "DELETE" })).status).toBe(200)
  }
  expect((await app.call("/api/ai/credentials/openai", { method: "DELETE" })).status).toBe(200)
  expect(JSON.parse(readFileSync(authFile, "utf8")).openai).toBeUndefined()
  expect((await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "gateway", key: "fixture-transient-key" } })).status).toBe(200)
  completed = true
} finally {
  await app.dispose()
  globalThis.fetch = originalFetch
  try {
    if (completed) {
      const file = join(dataDir, "ai", "nikcli", "data", "auth.json")
      const persisted = JSON.parse(readFileSync(file, "utf8"))
      expect(Object.keys(persisted)).toEqual(["xai"])
      expect(statSync(file).mode & 0o077).toBe(0)
      const restored = await Effect.runPromise(AiCredentials.use((credentials) => credentials.status).pipe(Effect.provide(AiCredentials.layerPersisted(jsonFileCredentials(join(dataDir, "ai", "credentials.json"))))))
      expect(restored.xai).toBe("configured")
      expect(restored.openai).toBe("missing")
      console.log("PROVIDER_CONNECTIONS_PASS")
    }
  } finally { rmSync(dataDir, { recursive: true, force: true }) }
}
