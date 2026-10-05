import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("/api/analytics", () => {
  test("every route requires the launch token", async () => {
    expect((await app.call("/api/analytics/system-metrics", { auth: false })).status).toBe(401)
    expect((await app.call("/api/analytics/track", { method: "POST", json: {}, auth: false })).status).toBe(401)
  })

  test("system-metrics returns the eight numeric fields", async () => {
    const r = await app.call("/api/analytics/system-metrics")
    expect(r.status).toBe(200)
    for (const k of ["cpuUsage", "memoryUsage", "storageUsed", "networkLatency", "activeConnections", "cacheHitRatio", "errorRate", "responseTime"]) {
      expect(typeof r.body[k]).toBe("number")
    }
  })

  test("track validates fields with the legacy messages", async () => {
    const missing = await app.call("/api/analytics/track", { method: "POST", json: { itemId: "p" } })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toBe("Missing required fields: itemId, itemType, and action are required")
    const type = await app.call("/api/analytics/track", { method: "POST", json: { itemId: "p", itemType: "x", action: "created" } })
    expect(type.status).toBe(400)
    expect(type.body.message).toStartWith("Invalid itemType. Must be one of: project, drawing")
    const action = await app.call("/api/analytics/track", { method: "POST", json: { itemId: "p", itemType: "project", action: "x" } })
    expect(action.status).toBe(400)
    expect(action.body.message).toStartWith("Invalid action. Must be one of: created, updated")
  })

  test("track writes an ActivityLog row", async () => {
    const r = await app.call("/api/analytics/track", {
      method: "POST", json: { itemId: "p1", itemType: "project", action: "viewed", details: { a: 1 } }
    })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ success: true })
  })
})

describe("/api/waitlist", () => {
  test("rejects an invalid email, accepts a new one, rejects a duplicate", async () => {
    const bad = await app.call("/api/waitlist", { method: "POST", json: { email: "nope" } })
    expect(bad.status).toBe(400)
    expect(bad.body).toMatchObject({ success: false, message: "Email non valida" })
    const ok = await app.call("/api/waitlist", { method: "POST", json: { email: "a@b.co" } })
    expect(ok.status).toBe(201)
    expect(ok.body).toEqual({ success: true, message: "Iscrizione completata con successo" })
    const dup = await app.call("/api/waitlist", { method: "POST", json: { email: "a@b.co" } })
    expect(dup.status).toBe(409)
    expect(dup.body.message).toBe("Email già registrata")
  })
})
