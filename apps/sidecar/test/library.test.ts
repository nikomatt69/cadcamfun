import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const gear = { name: "Spur gear", category: "component", type: "gear", data: { teeth: 20 } }

describe("/api/library", () => {
  test("auth + validation + foreign organisation", async () => {
    expect((await app.call("/api/library", { auth: false })).status).toBe(401)
    const bad = await app.call("/api/library", { method: "POST", json: { name: "x" } })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Missing required fields")
    const org = await app.call("/api/library", { method: "POST", json: { ...gear, organizationId: "org-x" } })
    expect(org.status).toBe(403)
    expect(org.body.message).toBe("User does not belong to the specified organization")
  })

  test("POST defaults properties/tags; GET filters by category/type/search, newest first", async () => {
    const r = await app.call("/api/library", { method: "POST", json: gear })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ ...gear, properties: {}, tags: [], isPublic: false, organizationId: null })
    await app.call("/api/library", { method: "POST", json: { name: "M6 tap", category: "tool", type: "tap", data: {}, description: "thread tool" } })
    expect((await app.call("/api/library")).body).toHaveLength(2)
    expect((await app.call("/api/library?category=tool")).body.map((i: { name: string }) => i.name)).toEqual(["M6 tap"])
    expect((await app.call("/api/library?type=gear")).body).toHaveLength(1)
    expect((await app.call("/api/library?search=thread")).body.map((i: { name: string }) => i.name)).toEqual(["M6 tap"])
  })

  test("GET/PUT/DELETE by id use `value || existing` merging", async () => {
    expect((await app.call("/api/library/nope")).body.message).toBe("Library item not found or access denied")
    const { body: item } = await app.call("/api/library", { method: "POST", json: { ...gear, properties: { module: 2 }, tags: ["a"] } })
    expect((await app.call(`/api/library/${item.id}`)).body.name).toBe("Spur gear")
    const upd = await app.call(`/api/library/${item.id}`, { method: "PUT", json: { name: "", description: "d", isPublic: true, tags: [] } })
    expect(upd.status).toBe(200)
    // empty name and empty-array tags are falsy/truthy exactly like the legacy `||` expressions.
    expect(upd.body).toMatchObject({ name: "Spur gear", description: "d", isPublic: true, properties: { module: 2 }, tags: [] })
    expect((await app.call(`/api/library/${item.id}`, { method: "DELETE" })).body).toEqual({ message: "Library item deleted successfully" })
    expect((await app.call(`/api/library/${item.id}`)).status).toBe(404)
  })
})

describe("/api/library/{components,materials,tools}", () => {
  test("return `{ data }` with the owner embedded", async () => {
    await app.call("/api/materials", { method: "POST", json: { name: "Oak", properties: { density: 0.7 } } })
    await app.call("/api/tools", { method: "POST", json: { name: "V-bit", type: "vbit", diameter: 12, material: "Carbide" } })
    const m = await app.call("/api/library/materials")
    expect(m.status).toBe(200)
    expect(m.body.data[0]).toMatchObject({ name: "Oak", owner: { name: "Local user" } })
    expect(Object.keys(m.body.data[0].owner).sort()).toEqual(["email", "id", "image", "name"])
    expect((await app.call("/api/library/tools")).body.data[0]).toMatchObject({ name: "V-bit", diameter: 12 })
    expect((await app.call("/api/library/components")).body.data.length).toBeGreaterThanOrEqual(1)
    expect((await app.call("/api/library/tools", { auth: false })).status).toBe(401)
  })
})
