import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools } from "@cadcamfun/ai"
import { plateTemplate } from "@cadcamfun/core"
import { Context, Effect } from "effect"
import { DrawingRepo, drawingContentHash } from "../src/repos/drawing-repo.ts"
import { ActingUser } from "../src/services/acting-user.ts"
import { KvStore } from "../src/services/kv.ts"
import { LocalProfile } from "../src/services/local-profile.ts"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const elementsOf = async (drawingId: string): Promise<ReadonlyArray<{ id: string }>> =>
  ((await app.call(`/api/drawings/${drawingId}`)).body.data?.elements ?? []) as ReadonlyArray<{ id: string }>

describe("a turn is bound to the drawing it was admitted for", () => {
  test("two drawings of one project: the tools act on the bound one, whatever another window's editor snapshot says", async () => {
    const services = await app.services()
    const acting = Context.get(services, ActingUser)
    const kv = Context.get(services, KvStore)
    const user = Context.get(services, LocalProfile).user
    const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Two drawings" } })).body.id
    const first = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "First", data: { elements: [] } } })).body.id
    const second = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Second", data: { elements: [] } } })).body.id
    // A second window opened the other drawing: the editor snapshot now names it.
    await Effect.runPromise(kv.set(`ai.context.${projectId}`, { projectId, drawingId: second }))

    expect(await acting.bind(projectId, "turn-first", user, "Build a plate", first)).toBe(true)
    const tools = buildTools(await app.toolHandlers(), projectId)
    const edit = tools.find((tool) => tool.id === "cad_edit")!
    const context = { sessionId: "turn-first", projectId, signal: new AbortController().signal }
    const created = JSON.parse(await acting.invoke(projectId, "turn-first", () => edit.execute({ action: "parametric_create", name: "Plate", history: plateTemplate() }, context)))
    expect(created.ok).toBe(true)
    expect(created.drawingId).toBe(first)
    expect((await elementsOf(first)).map((e) => e.id)).toEqual(created.ids)
    expect(await elementsOf(second)).toEqual([])

    // A bound drawing that is gone is refused; the snapshot's drawing is never used in its place.
    expect(await acting.bind(projectId, "turn-missing", user, "Build", "deleted-drawing")).toBe(true)
    const refused = JSON.parse(await acting.invoke(projectId, "turn-missing", () => edit.execute({ action: "parametric_create", name: "Plate", history: plateTemplate() }, { ...context, sessionId: "turn-missing" })))
    expect(refused.ok).toBe(false)
    expect(await elementsOf(second)).toEqual([])
  }, 60000)

  test("a concurrent save is a conflict and is not overwritten; a fresh read writes and answers a receipt", async () => {
    const drawings = Context.get(await app.services(), DrawingRepo)
    const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Concurrent" } })).body.id
    const drawingId = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Shared", data: { elements: [] } } })).body.id
    const read = (await app.call(`/api/drawings/${drawingId}`)).body.data
    const seen = drawingContentHash(read)
    // Another window saves first.
    await app.call(`/api/drawings/${drawingId}`, { method: "PUT", json: { data: { elements: [{ id: "theirs", type: "line" }] } } })
    const conflict = await Effect.runPromise(drawings.writeIfUnchanged(drawingId, seen, { elements: [{ id: "mine", type: "line" }] }))
    expect(conflict).toMatchObject({ ok: false, reason: "conflict", expectedHash: seen })
    expect((await elementsOf(drawingId)).map((e) => e.id)).toEqual(["theirs"])
    // The stock write checks the same way.
    await expect(Effect.runPromise(drawings.configureStock(drawingId, { width: 1 }, seen))).rejects.toBeDefined()
    expect((await app.call(`/api/drawings/${drawingId}`)).body.data.stock).toBeUndefined()

    const current = drawingContentHash((await app.call(`/api/drawings/${drawingId}`)).body.data)
    const next = { elements: [{ id: "theirs", type: "line" }, { id: "mine", type: "line" }] }
    const receipt = await Effect.runPromise(drawings.writeIfUnchanged(drawingId, current, next))
    expect(receipt).toMatchObject({ ok: true, drawingId, previousHash: current, contentHash: drawingContentHash(next) })
    expect((await elementsOf(drawingId)).map((e) => e.id)).toEqual(["theirs", "mine"])
    expect(drawingContentHash({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(drawingContentHash({ a: [1, { c: 3, d: 2 }], b: 1 }))
  })
})
