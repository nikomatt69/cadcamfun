import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let id: string
beforeAll(async () => {
  app = await makeApp()
  id = (await app.call("/api/tools", { method: "POST", json: { name: "Ball nose 4", type: "endmill", diameter: 4, material: "Carbide" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("/api/tools/:id/storage (legacy-compatible)", () => {
  test("404 unknown tool (envelope)", async () => {
    const r = await app.call("/api/tools/nope/storage")
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ success: false, message: "Tool not found" })
  })
  test("POST returns the path and leaves the row; GET ?path reads it back; signedUrl; DELETE needs ?path", async () => {
    const saved = await app.call(`/api/tools/${id}/storage`, { method: "POST", json: { feeds: [1, 2] } })
    expect(saved.body).toMatchObject({ success: true, message: "Tool saved to storage successfully" })
    const path = saved.body.data.storagePath as string
    expect(path).toMatch(new RegExp(`^tools/${id}-\\d+\\.json$`))

    const read = await app.call(`/api/tools/${id}/storage?path=${encodeURIComponent(path)}`)
    expect(read.body.data).toEqual({ feeds: [1, 2] })
    expect((await app.call(`/api/tools/${id}/storage?signedUrl=true&path=${encodeURIComponent(path)}`)).body.data.signedUrl).toStartWith("file://")

    // Legacy quirk: no stored path list, so a bare DELETE is a 404 and a bare GET reads key=<tool id> (absent -> data null).
    expect((await app.call(`/api/tools/${id}/storage`)).body).toMatchObject({ success: true, data: null })
    const bare = await app.call(`/api/tools/${id}/storage`, { method: "DELETE" })
    expect(bare.status).toBe(404)
    expect(bare.body.message).toBe("This tool does not have storage data")

    const del = await app.call(`/api/tools/${id}/storage?path=${encodeURIComponent(path)}`, { method: "DELETE" })
    expect(del.body).toMatchObject({ success: true, message: "Tool storage data deleted successfully", data: null })
  })
})

describe("/api/tools/export-import and /api/tools/:id/export-import", () => {
  test("export json/zip/bucket, 404 before format check, unsupported format", async () => {
    const json = await app.call(`/api/tools/export-import?ids=${id}`)
    expect(json.headers.get("content-disposition")).toMatch(/^attachment; filename="tools-export-\d+\.json"$/)
    expect(json.body[0]).toMatchObject({ id, name: "Ball nose 4", diameter: 4, metadata: { version: "1.0" } })

    const viaId = await app.call(`/api/tools/${id}/export-import?ids=${id}&format=zip`)
    const zip = await JSZip.loadAsync(viaId.bytes)
    expect(Object.keys(zip.files).sort()).toEqual(["Ball_nose_4.json", "index.json"])
    expect(JSON.parse(await zip.files["index.json"]!.async("string")).tools[0]).toMatchObject({ id, filename: "Ball_nose_4.json" })

    expect((await app.call(`/api/tools/export-import?ids=${id}&format=bucket`)).body.message).toBe("Tools exported to bucket successfully")
    expect((await app.call(`/api/tools/export-import?ids=nope&format=xml`)).status).toBe(404)
    const bad = await app.call(`/api/tools/export-import?ids=${id}&format=xml`)
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Unsupported export format")
  })

  test("import validates, converts numbers, and honours modes", async () => {
    const r = await app.call("/api/tools/export-import", {
      method: "POST",
      json: { data: [{ name: "Drill 5", type: "drillbit", diameter: "5.0", material: "HSS", maxRPM: "8000" }, { name: "bad" }] }
    })
    expect(r.body.message).toBe("Tools imported successfully")
    expect(r.body.data.created).toHaveLength(1)
    expect(r.body.data.errors).toEqual([{ id: "unknown", error: "Type is required, Diameter is required, Material is required" }])
    const newId = r.body.data.created[0]
    const row = (await app.call(`/api/tools/${newId}`)).body
    expect(row).toMatchObject({ diameter: 5, maxRPM: 8000, coolantType: null })

    const skip = await app.call(`/api/tools/${id}/export-import`, { method: "POST", json: { data: { id: newId, name: "x", type: "t", diameter: 1, material: "m" }, importMode: "skip" } })
    expect(skip.body.data.skipped).toEqual([newId])
    const upd = await app.call("/api/tools/export-import", { method: "POST", json: { data: { id: newId, name: "Drill 5.1", type: "drillbit", diameter: 5.1, material: "HSS" }, importMode: "update" } })
    expect(upd.body.data.updated).toEqual([newId])
    expect((await app.call(`/api/tools/${newId}`)).body).toMatchObject({ name: "Drill 5.1", diameter: 5.1 })
    expect((await app.call("/api/tools/export-import", { method: "POST", json: { data: { name: "n", type: "t", diameter: 1, material: "m" }, organizationId: "org-x" } })).status).toBe(403)
  })
})
