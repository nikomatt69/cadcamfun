import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { createFakeApi } from "../src/testing/fake-api.ts"

describe("fake API KV group", () => {
  test("persists JSON settings and context across calls and overwrites with a fresh timestamp", async () => {
    let timestamp = "2026-10-06T10:00:00.000Z"
    const api = createFakeApi({ now: () => timestamp })
    const key = "ai.settings.model"
    const value = { provider: "anthropic", model: "sonnet", enabled: false, limits: [1, null] }
    const entry = await Effect.runPromise(api.kv.set({ params: { key }, payload: { value } }))
    expect(entry).toEqual({ key, value, updatedAt: timestamp })
    expect(await Effect.runPromise(api.kv.get({ params: { key } }))).toEqual(entry)

    timestamp = "2026-10-06T11:00:00.000Z"
    const context = { projectId: "project-1", entities: [{ type: "circle", radius: 5 }] }
    await Effect.runPromise(api.kv.set({ params: { key: "ai.context.project-1" }, payload: { value: context } }))
    const updated = await Effect.runPromise(api.kv.set({ params: { key }, payload: { value: null } }))
    expect(updated).toEqual({ key, value: null, updatedAt: timestamp })
    expect(await Effect.runPromise(api.kv.get({ params: { key } }))).toEqual(updated)
    expect((await Effect.runPromise(api.kv.get({ params: { key: "ai.context.project-1" } }))).value).toEqual(context)
    expect((await Effect.runPromise(api.kv.list({ query: {} }))).entries).toHaveLength(2)
  })

  test("lists sorted entries with optional literal prefix filtering", async () => {
    const api = createFakeApi()
    expect(await Effect.runPromise(api.kv.list({ query: {} }))).toEqual({ entries: [] })
    for (const key of ["ui.theme", "ai.settings.model", "ai.memory.units", "ai.context.project-1"]) {
      await Effect.runPromise(api.kv.set({ params: { key }, payload: { value: key } }))
    }
    const keys = async (prefix?: string) => (await Effect.runPromise(api.kv.list({ query: prefix === undefined ? {} : { prefix } }))).entries.map((entry) => entry.key)
    expect(await keys()).toEqual(["ai.context.project-1", "ai.memory.units", "ai.settings.model", "ui.theme"])
    expect(await keys("")).toEqual(await keys())
    expect(await keys("ai.")).toEqual(["ai.context.project-1", "ai.memory.units", "ai.settings.model"])
    expect(await keys("ai.settings.")).toEqual(["ai.settings.model"])
    expect(await keys("memory")).toEqual([])
    expect(await keys("AI.")).toEqual([])
  })

  test("get and remove fail with NotFound for absent or deleted keys", async () => {
    const api = createFakeApi()
    const params = { key: "ai.memory.units" }
    const error = { _tag: "NotFound", message: "Key not found" }
    expect(await Effect.runPromise(api.kv.get({ params }).pipe(Effect.flip))).toMatchObject(error)
    expect(await Effect.runPromise(api.kv.remove({ params }).pipe(Effect.flip))).toMatchObject(error)
    await Effect.runPromise(api.kv.set({ params, payload: { value: "millimetres" } }))
    expect(await Effect.runPromise(api.kv.remove({ params }))).toEqual({ message: "Deleted" })
    expect(await Effect.runPromise(api.kv.list({ query: {} }))).toEqual({ entries: [] })
    expect(await Effect.runPromise(api.kv.get({ params }).pipe(Effect.flip))).toMatchObject(error)
    expect(await Effect.runPromise(api.kv.remove({ params }).pipe(Effect.flip))).toMatchObject(error)
  })

  test("matches sidecar key validation and decodes encoded identifiers", async () => {
    const api = createFakeApi()
    for (const key of ["../etc/passwd", "has space", "a".repeat(201)]) {
      expect(await Effect.runPromise(api.kv.set({ params: { key }, payload: { value: 1 } }).pipe(Effect.flip)))
        .toMatchObject({ _tag: "BadRequest", message: "Invalid key" })
    }
    for (const key of ["ai.context:project-1", "a".repeat(200)]) {
      const entry = await Effect.runPromise(api.kv.set({ params: { key }, payload: { value: false } }))
      expect(entry.key).toBe(key)
      expect(await Effect.runPromise(api.kv.get({ params: { key } }))).toEqual(entry)
      expect(await Effect.runPromise(api.kv.remove({ params: { key } }))).toEqual({ message: "Deleted" })
    }
    expect(await Effect.runPromise(api.kv.list({ query: {} }))).toEqual({ entries: [] })
  })

  test("keeps state isolated per fake instance", async () => {
    const first = createFakeApi()
    const second = createFakeApi()
    const params = { key: "ai.settings.model" }
    await Effect.runPromise(first.kv.set({ params, payload: { value: "sonnet" } }))
    expect(await Effect.runPromise(second.kv.list({ query: {} }))).toEqual({ entries: [] })
    expect(await Effect.runPromise(second.kv.get({ params }).pipe(Effect.flip))).toMatchObject({ _tag: "NotFound" })
    expect((await Effect.runPromise(first.kv.get({ params }))).value).toBe("sonnet")
  })
})
