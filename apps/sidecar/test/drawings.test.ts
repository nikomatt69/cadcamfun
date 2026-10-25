import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Fixture" } })).body.id
})
afterAll(async () => { await app.dispose() })

const entities = { entities: [{ _tag: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }] }

describe("/api/projects/:id/drawings", () => {
  test("auth, unknown project -> 404, validation, 201 create, list newest first", async () => {
    expect((await app.call(`/api/projects/${projectId}/drawings`, { auth: false })).status).toBe(401)
    const missing = await app.call("/api/projects/nope/drawings")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Project not found or access denied")

    const noName = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: {} })
    expect(noName.status).toBe(400)
    expect(noName.body.message).toBe("Drawing name is required")

    const a = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "A", data: entities } })
    expect(a.status).toBe(201)
    expect(a.body).toMatchObject({ name: "A", description: null, thumbnail: null, projectId, data: entities })
    const b = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "B" } })
    expect(b.body.data).toEqual({}) // legacy default `data || {}`
    await Bun.sleep(5)
    await app.call(`/api/drawings/${a.body.id}`, { method: "PUT", json: { description: "touched" } })
    const list = await app.call(`/api/projects/${projectId}/drawings`)
    expect(list.body.map((d: { name: string }) => d.name)).toEqual(["A", "B"]) // updatedAt desc
    expect((await app.call(`/api/projects/${projectId}`)).body._count.drawings).toBe(2)
  })
})

describe("/api/drawings/:id", () => {
  test("GET embeds the project; unknown id -> 404 'Drawing not found'", async () => {
    const missing = await app.call("/api/drawings/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Drawing not found")
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "C", data: entities } })
    const got = await app.call(`/api/drawings/${d.id}`)
    expect(got.status).toBe(200)
    expect(got.body.project).toMatchObject({ id: projectId, name: "Fixture", organization: null })
    expect(got.body.project.ownerId).toBeTruthy()
  })

  test("PUT updates only provided fields (legacy truthiness rules); DELETE removes", async () => {
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "D", description: "keep", data: entities } })
    const upd = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { name: "", data: { entities: [] }, thumbnail: "data:image/png;base64,xx" } })
    expect(upd.status).toBe(200)
    expect(upd.body).toMatchObject({ name: "D", description: "keep", data: { entities: [] }, thumbnail: "data:image/png;base64,xx" }) // empty name ignored
    const clear = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { description: null } })
    expect(clear.body.description).toBeNull() // `description !== undefined` allows clearing

    const del = await app.call(`/api/drawings/${d.id}`, { method: "DELETE" })
    expect(del.body).toEqual({ message: "Drawing deleted successfully" })
    expect((await app.call(`/api/drawings/${d.id}`)).status).toBe(404)
  })
})

describe("optimistic saves and restore points", () => {
  const draw = (n: number) => ({ elements: Array.from({ length: n }, (_, i) => ({ id: `e${i}`, type: "cube" })), version: "1.0" })

  test("a save based on a stale copy is a 409 and writes nothing", async () => {
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "CAS", data: draw(1) } })
    const first = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(2), baseUpdatedAt: d.updatedAt } })
    expect(first.status).toBe(200)
    // Someone else (the assistant, the phone) saved in between: the first copy is stale now.
    await Bun.sleep(5)
    const stale = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(9), baseUpdatedAt: d.updatedAt } })
    expect(stale.status).toBe(409)
    expect(stale.body.message).toContain("Nothing was overwritten")
    expect((await app.call(`/api/drawings/${d.id}`)).body.data).toEqual(draw(2))
    const fresh = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(3), baseUpdatedAt: first.body.updatedAt } })
    expect(fresh.status).toBe(200)
    // Without a base the legacy blind write still works.
    expect((await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(4) } })).status).toBe(200)
  })

  test("a save keeps the replaced document as a restore point, at most one per interval, and a restore is itself undoable", async () => {
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Versions", data: draw(1) } })
    expect((await app.call(`/api/drawings/${d.id}/versions`)).body).toEqual([])
    await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(2) } })
    await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: draw(3) } })
    const versions = (await app.call(`/api/drawings/${d.id}/versions`)).body
    expect(versions).toHaveLength(1) // the second save is inside the interval
    expect(versions[0]).toMatchObject({ version: 1, elements: 1 })
    const restored = await app.call(`/api/drawings/${d.id}/versions/${versions[0].id}/restore`, { method: "POST" })
    expect(restored.status).toBe(200)
    expect(restored.body.data).toEqual(draw(1))
    const after = (await app.call(`/api/drawings/${d.id}/versions`)).body
    expect(after.map((v: { elements: number }) => v.elements)).toEqual([3, 1]) // the document the restore replaced is kept
    expect((await app.call(`/api/drawings/${d.id}/versions/nope/restore`, { method: "POST" })).status).toBe(404)
    expect((await app.call(`/api/drawings/nope/versions`)).status).toBe(404)
    expect((await app.call(`/api/drawings/${d.id}/versions`, { auth: false })).status).toBe(401)
  })
})

describe("editor saves merge into the stored document", () => {
  test("mergeData keeps what the editor does not own (the configured stock); a plain PUT still replaces", async () => {
    const stock = { width: 100, height: 50, depth: 20 }
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Merge", data: { elements: [{ id: "a" }], stock, version: "1.0" } } })
    const merged = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: { elements: [{ id: "a" }, { id: "b" }], version: "1.0" }, mergeData: true } })
    expect(merged.body.data).toEqual({ elements: [{ id: "a" }, { id: "b" }], stock, version: "1.0" })
    const replaced = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: { elements: [] } } })
    expect(replaced.body.data).toEqual({ elements: [] })
  })
})

describe("the title block stored with a drawing", () => {
  test("a valid block is stored and merged like the rest of the document; an invalid one is a 400 that writes nothing", async () => {
    const titleBlock = { title: "Bracket", number: "BRK-001", revision: "B", status: "released", date: "2026-10-25", scale: "1:2", projection: "third", mass: 0.42 }
    const created = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Titled", data: { elements: [], titleBlock } } })
    expect(created.status).toBe(201)
    expect(created.body.data.titleBlock).toEqual(titleBlock)
    const edited = await app.call(`/api/drawings/${created.body.id}`, { method: "PUT", json: { data: { titleBlock: { ...titleBlock, revision: "C" } }, mergeData: true } })
    expect(edited.body.data).toEqual({ elements: [], titleBlock: { ...titleBlock, revision: "C" } })

    const bad = await app.call(`/api/drawings/${created.body.id}`, { method: "PUT", json: { data: { titleBlock: { date: "yesterday", status: "shipped", extra: 1 } }, mergeData: true } })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Invalid title block: 'extra' is not a title block field; 'status' is not valid (one of draft, in-review, released, obsolete); 'date' is not valid (YYYY-MM-DD)")
    expect((await app.call(`/api/drawings/${created.body.id}`)).body.data.titleBlock.revision).toBe("C")
    const badCreate = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Bad", data: { titleBlock: [] } } })
    expect(badCreate.status).toBe(400)
  })
})

describe("restore point retention", () => {
  test("the interval and the number kept follow the policy (CADCAMFUN_VERSION_*): every save is kept when the interval is 0, only the newest N survive", async () => {
    process.env["CADCAMFUN_VERSION_INTERVAL_MS"] = "0"
    process.env["CADCAMFUN_VERSION_LIMIT"] = "3"
    try {
      const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Retention", data: { elements: [{ id: "0" }] } } })
      for (let n = 1; n <= 6; n++) await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { data: { elements: Array.from({ length: n + 1 }, (_, i) => ({ id: String(i) })) } } })
      const versions = (await app.call(`/api/drawings/${d.id}/versions`)).body as Array<{ version: number; elements: number }>
      // Six saves replaced documents of 1..6 elements; the three newest restore points remain, newest first.
      expect(versions.map((v) => v.elements)).toEqual([6, 5, 4])
      expect(versions.map((v) => v.version)).toEqual([6, 5, 4])
    } finally {
      delete process.env["CADCAMFUN_VERSION_INTERVAL_MS"]
      delete process.env["CADCAMFUN_VERSION_LIMIT"]
    }
  })
})

describe("toolpath compare-and-swap", () => {
  test("a toolpath update based on a stale copy is a 409 and writes nothing; a fresh base succeeds", async () => {
    const { body: t } = await app.call("/api/toolpaths", { method: "POST", json: { name: "CAS", projectId, data: {}, gcode: "G0 X1" } })
    const first = await app.call(`/api/toolpaths/${t.id}`, { method: "PUT", json: { gcode: "G0 X2", baseUpdatedAt: t.updatedAt } })
    expect(first.status).toBe(200)
    await Bun.sleep(5)
    const stale = await app.call(`/api/toolpaths/${t.id}`, { method: "PUT", json: { gcode: "G0 X99", baseUpdatedAt: t.updatedAt } })
    expect(stale.status).toBe(409)
    expect((await app.call(`/api/toolpaths/${t.id}`)).body.gcode).toBe("G0 X2")
    expect((await app.call(`/api/toolpaths/${t.id}`, { method: "PUT", json: { gcode: "G0 X3", baseUpdatedAt: first.body.updatedAt } })).status).toBe(200)
  })
})
