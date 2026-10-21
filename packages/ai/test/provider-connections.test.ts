import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Option, Redacted } from "effect"
import { AiCredentials, jsonFileCredentials } from "../src/credentials.ts"
import { hostAuthFile, readOAuthGrants, retainOAuthGrants } from "../src/nikcli/oauth-store.ts"
import { openCodeProviderSpecs } from "../src/nikcli/opencode.ts"
import { buildHostConfig } from "../src/nikcli/config.ts"

const root = mkdtempSync(join(tmpdir(), "cadcam-connections-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const grant = { type: "oauth", access: "fixture-access", refresh: "fixture-refresh", expires: Date.now() + 3600000, accountId: "fixture-account" }

test("only app-supported renewable OAuth grants survive startup; the file is private", () => {
  const file = hostAuthFile(root)
  mkdirSync(join(root, "ai", "nikcli", "data"), { recursive: true })
  writeFileSync(file, JSON.stringify({ openai: grant, xai: { ...grant, accountId: undefined }, anthropic: grant, gateway: { type: "api", key: "fixture-key" } }), { mode: 0o644 })
  retainOAuthGrants(file)
  expect(Object.keys(readOAuthGrants(file)).sort()).toEqual(["openai", "xai"])
  expect(readFileSync(file, "utf8")).not.toContain("fixture-key")
  expect(statSync(file).mode & 0o077).toBe(0)
})

test("subscription connections restore as configured without handing a token to an API-key client", async () => {
  const file = join(root, "ai", "credentials.json")
  await Effect.runPromise(Effect.gen(function*() {
    const credentials = yield* AiCredentials
    expect((yield* credentials.status).openai).toBe("configured")
    expect(Option.isNone(yield* credentials.get("openai"))).toBe(true)
    yield* credentials.set("openai", Redacted.make("fixture-api-key"))
    const previous = yield* credentials.revision
    yield* credentials.useOAuth("openai")
    expect(yield* credentials.revision).toBeGreaterThan(previous)
    expect(Option.isNone(yield* credentials.get("openai"))).toBe(true)
    expect(JSON.parse(readFileSync(file, "utf8")).providers.openai).toBeUndefined()
    yield* credentials.clear("openai")
    expect((yield* credentials.status).openai).toBe("missing")
  }).pipe(Effect.provide(AiCredentials.layerPersisted(jsonFileCredentials(file)))))
})

test("OpenCode Zen and Go fallback models use separate documented endpoints without overriding catalogue routing", () => {
  const config = buildHostConfig({ providers: openCodeProviderSpecs(), toolIds: [], systemPrompt: "test" }) as { provider: Record<string, { npm?: string; options?: unknown; models: Record<string, { provider: { npm: string; api: string } }> }> }
  for (const id of ["opencode", "opencode-go"]) {
    const provider = config.provider[id]!
    expect(provider.npm).toBeUndefined()
    expect(provider.options).toEqual({ headerTimeout: 120_000, chunkTimeout: 120_000 })
    expect(provider.models["minimax-m3"]!.provider).toEqual({ npm: "@ai-sdk/openai-compatible", api: `https://opencode.ai/inference/${id === "opencode-go" ? "go/" : ""}openai/v1` })
  }
})
