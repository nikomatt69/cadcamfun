import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeApp } from "./helpers.ts"

/** The operator's nikcli resource policy lives in `<data dir>/ai/policy.json`; the whole sidecar honours it. */
const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-policy-"))
mkdirSync(join(dataDir, "ai"), { recursive: true })
writeFileSync(join(dataDir, "ai", "policy.json"), JSON.stringify([
  { effect: "deny", action: "provider.use", resource: "*" },
  { effect: "allow", action: "provider.use", resource: "anthropic" }
]))

const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } }
const model = () => new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Hello" }, { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }
      ]
    })
  })
})

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp({ dataDir, aiModelFactory: () => model() }) })
afterAll(async () => { await app.dispose(); rmSync(dataDir, { recursive: true, force: true }) })

describe("AI policy file", () => {
  test("the model picker lists only the providers the policy allows", async () => {
    const models = await app.call("/api/ai/models")
    expect(models.status).toBe(200)
    expect([...new Set((models.body as Array<{ provider: string }>).map((m) => m.provider))]).toEqual(["anthropic"])
    const providers = await app.call("/api/ai/providers")
    expect((providers.body as Array<{ id: string }>).map((p) => p.id)).toEqual(["anthropic"])
  })

  test("a chat that names a denied provider is refused before any model call, an allowed one streams", async () => {
    await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "openai", key: "sk-test-policy-1234" } })
    await app.call("/api/ai/credentials", { method: "PUT", json: { provider: "anthropic", key: "sk-ant-policy-123456" } })
    try {
      const events = async (provider: string) => {
        const r = await app.call("/api/ai/chat/stream", { method: "POST", json: { message: "hi", model: { provider } } })
        return String(r.body).split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))) as Array<{ type: string; message?: string; text?: string }>
      }
      const denied = await events("openai")
      expect(denied.some((e) => e.type === "error" && /policy/i.test(e.message ?? ""))).toBe(true)
      expect(denied.some((e) => e.type === "delta")).toBe(false)
      expect((await events("anthropic")).at(-1)).toMatchObject({ type: "done" })
    } finally {
      await app.call("/api/ai/credentials/openai", { method: "DELETE" })
      await app.call("/api/ai/credentials/anthropic", { method: "DELETE" })
    }
  })
})
