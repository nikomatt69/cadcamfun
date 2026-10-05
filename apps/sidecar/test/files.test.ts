import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const upload = (json: unknown, auth = true) => app.call("/api/upload", { method: "POST", json, auth })
const body = { fileName: "part.dxf", fileType: "image/vnd.dxf", organizationId: "o", conversationId: "c", fileSize: 12 }

describe("/api/upload", () => {
  test("requires the launch token", async () => {
    expect((await upload(body, false)).status).toBe(401)
  })

  test("rejects missing fields with the legacy message", async () => {
    const r = await upload({ fileName: "a.txt" })
    expect(r.status).toBe(400)
    expect(r.body.message).toBe("Missing required fields")
  })

  test("rejects a non-member of the organisation", async () => {
    const r = await upload(body)
    expect(r.status).toBe(403)
    expect(r.body.message).toBe("Not a member of this organization")
  })

  test("rejects a non-participant of the conversation", async () => {
    const org = await app.call("/api/organizations", { method: "POST", json: { name: "Shop", slug: "shop" } })
    const organizationId = org.body.id ?? org.body.data?.id
    expect(organizationId).toBeDefined()
    const r = await upload({ ...body, organizationId })
    expect(r.status).toBe(403)
    expect(r.body.message).toBe("Not a participant in this conversation")
  })
})

describe("/api/download", () => {
  test("404s until the installer archive exists, then streams it", async () => {
    const missing = await app.call("/api/download")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("File not found")

    mkdirSync(join(app.dataDir, "downloads"), { recursive: true })
    writeFileSync(join(app.dataDir, "downloads", "cadcamfun-app.zip"), new Uint8Array([0x50, 0x4b, 3, 4]))
    const ok = await app.call("/api/download")
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toBe("application/zip")
    expect(ok.headers.get("content-disposition")).toBe("attachment; filename=CADCAMFUN.zip")
    expect(Array.from(ok.bytes)).toEqual([0x50, 0x4b, 3, 4])
  })
})
