import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let id: string
const cfg = { workVolume: { x: 300, y: 200, z: 100 }, maxSpindleSpeed: 10000, maxFeedRate: 5000 }
beforeAll(async () => {
  app = await makeApp()
  id = (await app.call("/api/machine-configs", { method: "POST", json: { name: "Router", type: "mill", config: cfg } })).body.data.id
})
afterAll(async () => { await app.dispose() })

describe("/api/machine-configs/:id/storage", () => {
  test("404 then save -> read -> signedUrl -> delete (path kept inside config, removed on delete)", async () => {
    expect((await app.call("/api/machine-configs/nope/storage")).body).toMatchObject({ success: false, message: "Machine configuration not found" })
    expect((await app.call(`/api/machine-configs/${id}/storage`)).body.message).toBe("This machine configuration does not have storage data")

    const saved = await app.call(`/api/machine-configs/${id}/storage`, { method: "POST", json: { macros: ["M6"] } })
    expect(saved.body).toMatchObject({ success: true, message: "Machine configuration saved to storage successfully" })
    const path = saved.body.data.storagePath as string
    expect(path).toMatch(new RegExp(`^machine-configs/${id}-\\d+\\.json$`))
    expect((await app.call(`/api/machine-configs/${id}`)).body.data.config).toMatchObject({ ...cfg, storagePath: path })

    expect((await app.call(`/api/machine-configs/${id}/storage`)).body.data).toEqual({ macros: ["M6"] })
    expect((await app.call(`/api/machine-configs/${id}/storage?signedUrl=true`)).body.data.signedUrl).toStartWith("file://")

    const del = await app.call(`/api/machine-configs/${id}/storage`, { method: "DELETE" })
    expect(del.body.message).toBe("Machine configuration storage data deleted successfully")
    expect("storagePath" in (await app.call(`/api/machine-configs/${id}`)).body.data.config).toBe(false)
  })
})

describe("/api/machine-configs/export-import", () => {
  test("export json / zip / bucket / bad format / none found", async () => {
    const json = await app.call(`/api/machine-configs/export-import?ids=${id}`)
    expect(json.headers.get("content-disposition")).toMatch(/^attachment; filename="machine-configs-export-\d+\.json"$/)
    expect(json.body[0]).toMatchObject({ id, name: "Router", type: "mill", config: cfg, metadata: { version: "1.0" } })

    const zip = await JSZip.loadAsync((await app.call(`/api/machine-configs/export-import?ids=${id}&format=zip`)).bytes)
    expect(Object.keys(zip.files).sort()).toEqual(["Router.json", "index.json"])
    expect(JSON.parse(await zip.files["index.json"]!.async("string"))["machine-configs"][0]).toMatchObject({ id, filename: "Router.json" })

    expect((await app.call(`/api/machine-configs/export-import?ids=${id}&format=bucket`)).body.message)
      .toBe("Machine configurations exported to bucket successfully")
    expect((await app.call(`/api/machine-configs/export-import?ids=${id}&format=xml`)).body.message).toBe("Unsupported export format")
    expect((await app.call("/api/machine-configs/export-import?ids=nope")).body.message).toBe("No accessible machine configurations found")
  })

  test("import: validation, create (private), update only own, skip existing", async () => {
    const r = await app.call("/api/machine-configs/export-import", {
      method: "POST", json: { data: [{ name: "Lathe", type: "lathe", config: cfg, description: "d" }, { name: "no type" }] }
    })
    expect(r.body.message).toBe("Machine configurations imported successfully")
    expect(r.body.data.errors).toEqual([{ id: "unknown", error: "Missing required fields (name, type, config)" }])
    const newId = r.body.data.created[0]
    expect((await app.call(`/api/machine-configs/${newId}`)).body.data).toMatchObject({ name: "Lathe", isPublic: false, description: "d" })

    const upd = await app.call("/api/machine-configs/export-import", { method: "POST", json: { data: { id: newId, name: "Lathe 2", type: "lathe", config: cfg }, importMode: "update" } })
    expect(upd.body.data.updated).toEqual([newId])
    const skip = await app.call("/api/machine-configs/export-import", { method: "POST", json: { data: { id: newId, name: "x", type: "lathe", config: cfg }, importMode: "skip" } })
    expect(skip.body.data.skipped).toEqual([newId])
    expect((await app.call("/api/machine-configs/export-import", { method: "POST", json: {} })).body.message).toBe("No import data provided")
  })
})
