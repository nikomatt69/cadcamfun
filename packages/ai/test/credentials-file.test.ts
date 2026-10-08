import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Effect, Option, Redacted } from "effect"
import { AiCredentials, jsonFileCredentials } from "../src/index.ts"

const fresh = () => join(mkdtempSync(join(tmpdir(), "cadcamfun-cred-")), "ai", "credentials.json")
const run = <A,>(file: string, use: (c: typeof AiCredentials.Service) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(Effect.gen(function*() { return yield* use(yield* AiCredentials) }).pipe(Effect.provide(AiCredentials.layerPersisted(jsonFileCredentials(file)))))

describe("credentials kept in a local JSON file", () => {
  test("a key set once is there after a restart, and the file is private to its owner", async () => {
    const file = fresh()
    await run(file, (c) => c.set("anthropic", Redacted.make("sk-test-1"), { baseUrl: "https://proxy.example.com/" }))
    const saved = JSON.parse(readFileSync(file, "utf8")) as { version: number; providers: Record<string, { key: string; baseUrl?: string }> }
    expect(saved.version).toBe(1)
    expect(saved.providers["anthropic"]).toEqual({ key: "sk-test-1", baseUrl: "https://proxy.example.com" })
    expect(statSync(file).mode & 0o077).toBe(0)

    // A new service over the same file: nothing is asked for again.
    const after = await run(file, (c) => Effect.all({ status: c.status, got: c.get("anthropic") }))
    expect(after.status["anthropic"]).toBe("configured")
    expect(Option.isSome(after.got) && Redacted.value(after.got.value.key)).toBe("sk-test-1")
  })

  test("clearing a key removes it from the file", async () => {
    const file = fresh()
    await run(file, (c) => Effect.andThen(c.set("openai", Redacted.make("sk-x")), c.clear("openai")))
    expect(JSON.parse(readFileSync(file, "utf8")).providers).toEqual({})
    expect((await run(file, (c) => c.status))["openai"]).toBe("missing")
  })

  test("a missing or damaged file reads as empty and does not stop the service", async () => {
    const file = fresh()
    expect((await run(file, (c) => c.status))["anthropic"]).toBe("missing")
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "{ not json")
    expect((await run(file, (c) => c.status))["anthropic"]).toBe("missing")
    await run(file, (c) => c.set("anthropic", Redacted.make("sk-again")))
    expect((await run(file, (c) => c.status))["anthropic"]).toBe("configured")
  })
})
