import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const call = (path: string, method = "GET", json?: unknown) => app.call(path, { method, ...(json === undefined ? {} : { json }) })

describe("/api/kv", () => {
  test("requires the launch token", async () => {
    expect((await app.call("/api/kv", { auth: false })).status).toBe(401)
  })

  test("set, get, list by prefix and delete through the SQLite-backed repository", async () => {
    expect((await call("/api/kv/ai.settings.model")).status).toBe(404)
    const set = await call("/api/kv/ai.settings.model", "PUT", { value: { provider: "anthropic", tier: "best" } })
    expect(set.status).toBe(200)
    expect(set.body).toMatchObject({ key: "ai.settings.model", value: { provider: "anthropic", tier: "best" } })
    await call("/api/kv/ai.memory.units", "PUT", { value: "Always millimetres" })
    await call("/api/kv/ui.theme", "PUT", { value: "dark" })
    expect((await call("/api/kv/ai.settings.model")).body.value).toEqual({ provider: "anthropic", tier: "best" })
    const ai = await call("/api/kv?prefix=ai.")
    expect(ai.body.entries.map((e: { key: string }) => e.key)).toEqual(["ai.memory.units", "ai.settings.model"])
    expect((await call("/api/kv")).body.entries).toHaveLength(3)
    expect((await call("/api/kv/ui.theme", "DELETE")).body.message).toBe("Deleted")
    expect((await call("/api/kv/ui.theme", "DELETE")).status).toBe(404)
  })

  test("a key that is not a dotted identifier is rejected", async () => {
    const r = await call("/api/kv/" + encodeURIComponent("../etc/passwd"), "PUT", { value: 1 })
    expect(r.status).toBe(400)
    expect(r.body.message).toBe("Invalid key")
  })
})
