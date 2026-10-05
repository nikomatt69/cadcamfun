import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let id: string
beforeAll(async () => {
  app = await makeApp()
  id = (await app.call("/api/materials", { method: "POST", json: { name: "Brass C360", properties: { density: 8.5 } } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("/api/materials/:id/storage", () => {
  test("unknown material -> envelope 404", async () => {
    const r = await app.call("/api/materials/nope/storage")
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ success: false, message: "Material not found" })
  })
  test("GET before any upload -> 404 with the legacy message", async () => {
    const r = await app.call(`/api/materials/${id}/storage`)
    expect(r.status).toBe(404)
    expect(r.body.message).toBe("This material does not have storage data")
  })
  test("POST stores data, records storagePath, GET returns it, signedUrl, DELETE clears the file", async () => {
    const saved = await app.call(`/api/materials/${id}/storage`, { method: "POST", json: { curve: [1, 2, 3] } })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ success: true, message: "Material saved to storage successfully" })
    expect(saved.body.data.storagePath).toMatch(new RegExp(`^materials/${id}-\\d+\\.json$`))

    const mat = await app.call(`/api/materials/${id}`)
    expect(mat.body.properties).toMatchObject({ density: 8.5, storagePath: saved.body.data.storagePath })

    const read = await app.call(`/api/materials/${id}/storage`)
    expect(read.body).toEqual({ success: true, message: "Success", data: { curve: [1, 2, 3] } })

    const signed = await app.call(`/api/materials/${id}/storage?signedUrl=true`)
    expect(signed.body.data.signedUrl).toStartWith("file://")

    const del = await app.call(`/api/materials/${id}/storage`, { method: "DELETE" })
    expect(del.body).toMatchObject({ success: true, message: "Material storage data deleted successfully", data: null })
  })
})

describe("/api/materials/export-import", () => {
  test("export json / zip / bucket and unsupported format", async () => {
    const json = await app.call(`/api/materials/export-import?ids=${id}&format=json`)
    expect(json.status).toBe(200)
    expect(json.headers.get("content-disposition")).toMatch(/^attachment; filename="materials-export-\d+\.json"$/)
    expect(json.body[0]).toMatchObject({ id, name: "Brass C360", metadata: { version: "1.0", schemaVersion: "1.0" } })

    const zipRes = await app.call(`/api/materials/export-import?ids=${id}&format=zip`)
    expect(zipRes.headers.get("content-type")).toContain("application/zip")
    const zip = await JSZip.loadAsync(zipRes.bytes)
    expect(Object.keys(zip.files).sort()).toEqual(["Brass_C360.json", "index.json"])

    const bucket = await app.call(`/api/materials/export-import?ids=${id}&format=bucket`)
    expect(bucket.body.message).toBe("Materials exported to bucket successfully")
    expect(bucket.body.data.path).toMatch(/^materials\//)

    const bad = await app.call(`/api/materials/export-import?ids=${id}&format=xml`)
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Unsupported export format")
    expect((await app.call("/api/materials/export-import?ids=nope")).status).toBe(404)
  })

  test("import: errors, create / update / skip modes", async () => {
    expect((await app.call("/api/materials/export-import", { method: "POST", json: {} })).body.message).toBe("No import data provided")

    const created = await app.call("/api/materials/export-import", {
      method: "POST", json: { data: [{ name: "Ti-6Al-4V", properties: { density: 4.43 } }, { description: "no name" }] }
    })
    expect(created.status).toBe(200)
    expect(created.body.data.created).toHaveLength(1)
    expect(created.body.data.errors).toEqual([{ id: "unknown", error: "Missing required field (name)" }])

    const newId = created.body.data.created[0]
    const skipped = await app.call("/api/materials/export-import", { method: "POST", json: { data: { id: newId, name: "x" }, importMode: "skip" } })
    expect(skipped.body.data.skipped).toEqual([newId])
    const updated = await app.call("/api/materials/export-import", { method: "POST", json: { data: { id: newId, name: "Ti Grade 5" }, importMode: "update" } })
    expect(updated.body.data.updated).toEqual([newId])
    expect((await app.call(`/api/materials/${newId}`)).body.name).toBe("Ti Grade 5")

    const mode = await app.call("/api/materials/export-import", { method: "POST", json: { data: { name: "y" }, importMode: "merge" } })
    expect(mode.body.data.errors[0].error).toBe("Unsupported import mode: merge")

    const org = await app.call("/api/materials/export-import", { method: "POST", json: { data: { name: "z" }, organizationId: "org-x" } })
    expect(org.status).toBe(403)
  })
})
