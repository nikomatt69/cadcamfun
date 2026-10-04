import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { Nikcli } from "../src"

const home = () => {
  const dir = mkdtempSync(join(tmpdir(), "nikcli-"))
  mkdirSync(join(dir, "data", "nikcli"), { recursive: true })
  mkdirSync(join(dir, "config", "nikcli"), { recursive: true })
  return {
    env: { XDG_DATA_HOME: join(dir, "data"), XDG_CONFIG_HOME: join(dir, "config") },
    auth: (v: unknown) => writeFileSync(join(dir, "data", "nikcli", "auth.json"), JSON.stringify(v)),
    config: (v: unknown) => writeFileSync(join(dir, "config", "nikcli", "nikcli.json"), JSON.stringify(v)),
  }
}

describe("nikcli credentials", () => {
  test("missing install yields nothing", async () => {
    const h = home()
    const n = await Effect.runPromise(Nikcli.load(h.env))
    expect(n.key("anthropic")).toBeUndefined()
    expect(n.model).toBeUndefined()
  })

  test("reads api keys, unexpired oauth and the default model", async () => {
    const h = home()
    const now = 1_000_000
    h.auth({
      anthropic: { type: "api", key: "sk-ant" },
      openrouter: { type: "oauth", access: "tok", refresh: "r", expires: now + 3_600_000 },
      openai: { type: "oauth", access: "old", refresh: "r", expires: now - 1 },
    })
    h.config({ model: "openrouter/anthropic/claude-sonnet-5-5" })
    const n = await Effect.runPromise(Nikcli.load(h.env, now))
    expect(n.key("anthropic")).toBe("sk-ant")
    expect(n.key("openrouter")).toBe("tok")
    expect(n.key("openai")).toBeUndefined()
    expect(n.model).toEqual({ provider: "openrouter", id: "anthropic/claude-sonnet-5-5" })
  })
})
