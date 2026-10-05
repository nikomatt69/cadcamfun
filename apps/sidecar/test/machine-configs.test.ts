import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const mill = {
  name: "Haas VF-2", type: "mill", description: "shop mill",
  config: { workVolume: { x: 762, y: 406, z: 508 }, maxSpindleSpeed: 8100, maxFeedRate: 16500, controller: "fanuc" }
}

describe("/api/machine-configs (legacy parity)", () => {
  test("auth + create validation", async () => {
    expect((await app.call("/api/machine-configs", { auth: false })).status).toBe(401)
    const bad = await app.call("/api/machine-configs", { method: "POST", json: { name: "x", type: "robot" } })
    expect(bad.status).toBe(400)
    expect(bad.body).toMatchObject({ success: false })
    expect(bad.body.message).toStartWith("Invalid request data: ")
  })

  test("POST -> envelope with isOwner/usageCount and owner embed (no password leak)", async () => {
    const r = await app.call("/api/machine-configs", { method: "POST", json: mill })
    expect(r.status).toBe(200) // legacy sendSuccessResponse always answers 200
    expect(r.body).toMatchObject({ success: true, message: "Machine configuration created successfully" })
    expect(r.body.data).toMatchObject({ name: "Haas VF-2", isOwner: true, usageCount: 0, isPublic: false })
    expect(Object.keys(r.body.data.owner).sort()).toEqual(["email", "id", "image", "name"])
  })

  test("GET list paginates, filters and orders by updatedAt desc", async () => {
    for (let i = 0; i < 3; i++) await app.call("/api/machine-configs", { method: "POST", json: { ...mill, name: `Mill ${i}`, type: i === 2 ? "lathe" : "mill" } })
    const page = await app.call("/api/machine-configs?limit=2&page=1")
    expect(page.body.data.pagination).toMatchObject({ page: 1, limit: 2, totalPages: expect.any(Number) })
    expect(page.body.data.data).toHaveLength(2)
    expect(page.body.data.data[0]).toMatchObject({ isOwner: true, usageCount: 0 })
    expect("_count" in page.body.data.data[0]).toBe(false)
    const lathes = await app.call("/api/machine-configs?type=lathe")
    expect(lathes.body.data.data.map((m: { name: string }) => m.name)).toEqual(["Mill 2"])
    expect((await app.call("/api/machine-configs?search=Haas")).body.data.pagination.total).toBe(1)
    expect((await app.call("/api/machine-configs?limit=9999")).body.data.pagination.limit).toBe(100)
  })

  test("GET/PUT/DELETE/clone by id", async () => {
    const missing = await app.call("/api/machine-configs/nope")
    expect(missing.status).toBe(404)
    expect(missing.body).toMatchObject({ success: false, message: "Machine configuration not found" })

    const { body: created } = await app.call("/api/machine-configs", { method: "POST", json: mill })
    const id = created.data.id
    expect((await app.call(`/api/machine-configs/${id}`)).body.data).toMatchObject({ id, isOwner: true, usageCount: 0 })

    expect((await app.call(`/api/machine-configs/${id}`, { method: "PUT", json: {} })).body.message).toBe("Machine configuration name is required")
    expect((await app.call(`/api/machine-configs/${id}`, { method: "PUT", json: { name: "n", type: "robot" } })).body.message)
      .toBe("Valid machine type is required (mill, lathe, printer, or laser)")
    expect((await app.call(`/api/machine-configs/${id}`, { method: "PUT", json: { name: "n", config: { maxSpindleSpeed: 0 } } })).body.message)
      .toBe("Maximum spindle speed is required in the configuration")

    const upd = await app.call(`/api/machine-configs/${id}`, { method: "PUT", json: { name: "Haas VF-2SS", config: { maxSpindleSpeed: 12000, workVolume: { x: 800 } }, isPublic: true } })
    expect(upd.body.message).toBe("Machine configuration updated successfully")
    expect(upd.body.data).toMatchObject({ name: "Haas VF-2SS", isPublic: true, isOwner: true, description: "shop mill" })
    // Legacy: the persisted config is a *shallow* merge, so workVolume is replaced by the body's value.
    expect(upd.body.data.config).toMatchObject({ maxSpindleSpeed: 12000, maxFeedRate: 16500, workVolume: { x: 800 } })

    const clone = await app.call(`/api/machine-configs/${id}/clone`, { method: "POST", json: {} })
    expect(clone.body.message).toBe("Machine configuration cloned successfully")
    expect(clone.body.data).toMatchObject({ name: "Haas VF-2SS (Copy)", isPublic: false, isOwner: true, usageCount: 0 })
    expect(clone.body.data.id).not.toBe(id)
    expect((await app.call(`/api/machine-configs/${id}/clone`, { method: "POST", json: { name: "Mine" } })).body.data.name).toBe("Mine")
    expect((await app.call("/api/machine-configs/nope/clone", { method: "POST", json: {} })).body.message).toBe("Source machine configuration not found")

    const del = await app.call(`/api/machine-configs/${id}`, { method: "DELETE" })
    expect(del.body).toEqual({ success: true, data: null, message: "Machine configuration deleted successfully" })
    expect((await app.call(`/api/machine-configs/${id}`)).status).toBe(404)
  })
})
