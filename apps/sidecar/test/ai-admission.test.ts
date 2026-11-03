import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Context } from "effect"
import { ActingUser } from "../src/services/acting-user.ts"
import { LocalProfile } from "../src/services/local-profile.ts"
import { makeApp } from "./helpers.ts"

/**
 * RM-01 "required integration checks": admission of a tool call through the sidecar handlers. The model supplies a project id;
 * the actor, the project and the drawing come from the admitted turn, so a forged or foreign id fails before any write.
 */
let app: Awaited<ReturnType<typeof makeApp>>
let mineId: string
let theirsId: string
let acting: ActingUser["Service"]
let user: Parameters<ActingUser["Service"]["bind"]>[2]

beforeAll(async () => {
  app = await makeApp()
  const services = await app.services()
  acting = Context.get(services, ActingUser)
  user = Context.get(services, LocalProfile).user
  mineId = (await app.call("/api/projects", { method: "POST", json: { name: "Mine" } })).body.id
  const password = "test-password-long"
  await app.call("/api/auth/signup", { method: "POST", json: { email: "owner-b@example.com", name: "Owner B", password, confirmPassword: password } })
  const headers = { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "owner-b@example.com", password } })).body.token }
  theirsId = (await app.call("/api/projects", { method: "POST", json: { name: "Theirs" }, headers })).body.id
})
afterAll(async () => { await app.dispose() })

const drawingsOf = async (projectId: string, headers?: Record<string, string>) => (await app.call(`/api/projects/${projectId}/drawings`, headers ? { headers } : {})).body as Array<{ id: string }>
const plate = [{ type: "cube", width: 30, height: 20, depth: 5, name: "Plate" }]

describe("a tool call is admitted by the turn, not by what the model says", () => {
  test("a call outside any admitted turn is refused before the handler runs", async () => {
    const handlers = await app.toolHandlers()
    const ran = { count: 0 }
    await expect(acting.invoke(mineId, "never-bound", async () => { ran.count++; return handlers.addElements(mineId, plate) })).rejects.toThrow()
    expect(ran.count).toBe(0)
  })

  test("a session admitted for one project cannot run a call against another", async () => {
    expect(await acting.bind(mineId, "turn-a", user, "Add a plate")).toBe(true)
    const handlers = await app.toolHandlers()
    const ran = { count: 0 }
    await expect(acting.invoke(theirsId, "turn-a", async () => { ran.count++; return handlers.addElements(theirsId, plate) })).rejects.toThrow()
    expect(ran.count).toBe(0)
  })

  test("a forged project id inside an admitted turn is refused and writes nothing in the foreign project", async () => {
    expect(await acting.bind(mineId, "turn-b", user, "Add a plate")).toBe(true)
    const handlers = await app.toolHandlers()
    const before = (await drawingsOf(mineId)).length
    // The turn is admitted for `mine`; the model passes the other owner's id as the handler argument.
    await expect(acting.invoke(mineId, "turn-b", () => handlers.addElements(theirsId, plate))).rejects.toThrow("Project not found or not accessible; no other workspace was modified.")
    const headers = { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "owner-b@example.com", password: "test-password-long" } })).body.token }
    expect(await drawingsOf(theirsId, headers)).toEqual([])
    expect((await drawingsOf(mineId)).length).toBe(before)
  })

  test("a session cannot be taken over by another actor or project; the owner's own call runs", async () => {
    expect(await acting.bind(mineId, "turn-c", user, "Add a plate")).toBe(true)
    expect(await acting.bind(theirsId, "turn-c", user, "Redirect")).toBe(false)
    expect(await acting.bind(mineId, "turn-c", { ...user, id: "someone-else" }, "Take over")).toBe(false)
    const handlers = await app.toolHandlers()
    const ok = await acting.invoke(mineId, "turn-c", () => handlers.addElements(mineId, plate))
    expect(ok).toMatchObject({ ok: true })
  })
})

describe("a library row the assistant replaces keeps its previous values (RM-05)", () => {
  test("upsert_tool over an existing id leaves the old row in the tool's history", async () => {
    expect(await acting.bind(mineId, "turn-lib", user, "Replace the drill")).toBe(true)
    const handlers = await app.toolHandlers()
    const made = await acting.invoke(mineId, "turn-lib", () => handlers.upsertTool({ name: "5 mm drill", type: "drill", diameter: 5, material: "HSS" })) as { ok: true; id: string; created: boolean }
    expect(made).toMatchObject({ ok: true, created: true })
    const replaced = await acting.invoke(mineId, "turn-lib", () => handlers.upsertTool({ id: made.id, name: "6 mm drill", type: "drill", diameter: 6, material: "HSS" }))
    expect(replaced).toMatchObject({ ok: true, created: false })
    const history = (await app.call(`/api/tools/${made.id}/versions`)).body
    expect(history).toHaveLength(1)
    expect(history[0].data).toMatchObject({ name: "5 mm drill", diameter: 5, version: 1 })
    expect((await app.call(`/api/tools/${made.id}`)).body).toMatchObject({ name: "6 mm drill", diameter: 6, version: 2 })
  })
})

