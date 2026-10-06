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

describe("/api/analytics leftovers", () => {
  const get = (path: string) => app.call(path)
  const track = (itemType: string, action: string, itemId = "i") =>
    app.call("/api/analytics/track", { method: "POST", json: { itemId, itemType, action } })

  test("index counts activity by type and action and reports admin status", async () => {
    await track("project", "created"); await track("project", "viewed"); await track("drawing", "created")
    const r = await get("/api/analytics")
    expect(r.status).toBe(200)
    expect(r.body.success).toBe(true)
    expect(r.body.isAdmin).toBe(true)
    const n = (rows: Array<Record<string, unknown>>, key: string, value: string) => Number(rows.find((x) => x[key] === value)?._count ?? 0)
    expect(n(r.body.data.countByType, "itemType", "project")).toBeGreaterThanOrEqual(2)
    expect(n(r.body.data.countByAction, "action", "created")).toBeGreaterThanOrEqual(2)
    const filtered = await get("/api/analytics?itemType=drawing")
    expect(filtered.body.data.countByType.map((x: { itemType: string }) => x.itemType)).toEqual(["drawing"])
  })

  test("log-view records a page view and user-history pages the log", async () => {
    expect((await app.call("/api/analytics/log-view", { method: "POST", json: { path: "/cad", query: { a: "1" } } })).body).toEqual({ success: true })
    const history = await get("/api/analytics/user-history?limit=2&offset=0&itemType=page_view")
    expect(history.body.total).toBe(1)
    expect(history.body.logs[0]).toMatchObject({ itemType: "page_view", itemId: "/cad", user: { email: "local@cadcamfun.local" } })
    expect((await get("/api/analytics/user-history?limit=1")).body.logs).toHaveLength(1)
  })

  test("dashboard-data and recent-activity summarise the owner's work", async () => {
    const project = (await app.call("/api/projects", { method: "POST", json: { name: "Dash" } })).body
    await app.call(`/api/projects/${project.id}/drawings`, { method: "POST", json: { name: "D1" } })
    const dash = (await get("/api/analytics/dashboard-data")).body
    expect(dash.projects.total).toBeGreaterThanOrEqual(1)
    expect(dash.projects.activeProjects).toBeGreaterThanOrEqual(1)
    expect(dash.tools.mostUsed).toBe("No tools used yet")
    expect(dash.materials.lowStock).toBe(0)
    const recent = await get("/api/analytics/recent-activity?limit=8")
    expect(recent.body.length).toBeGreaterThan(0)
    expect(recent.body[0]).toMatchObject({ userName: "Local user" })
    expect(recent.body.map((a: { type: string }) => a.type)).toContain("project")
  })

  test("user-metrics validates its query and returns a dense chart series", async () => {
    expect((await get("/api/analytics/user-metrics?groupBy=year")).body.error).toBe("Invalid groupBy parameter. Use day, week, or month.")
    expect((await get("/api/analytics/user-metrics?metric=bogus")).body.error).toStartWith("Invalid metric parameter. Use one of:")
    expect((await get("/api/analytics/user-metrics?startDate=2026-02-01&endDate=2026-01-01")).body.error).toBe("startDate cannot be after endDate.")
    const day = new Date().toISOString().slice(0, 10)
    const next = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const r = await get(`/api/analytics/user-metrics?metric=projects&startDate=${day}&endDate=${next}`)
    expect(r.status).toBe(200)
    expect(r.body.summary.totalProjects).toBeGreaterThanOrEqual(1)
    expect(r.body.chartData).toHaveLength(2)
    expect(r.body.chartData[0]).toMatchObject({ date: day })
    expect(r.body.chartData[0].projects).toBeGreaterThanOrEqual(1)
    expect(r.body.chartData[0].toolpaths).toBe(0)
    const activity = await get(`/api/analytics/user-metrics?startDate=${day}&endDate=${next}`)
    expect(activity.body.chartData[0].activityCount).toBeGreaterThanOrEqual(1)
  })

  test("user-usage answers with the legacy empty structures", async () => {
    expect((await get("/api/analytics/user-usage?userId=someone")).body).toEqual({ summary: null, breakdown: null })
    expect((await get("/api/analytics/user-usage")).body.systemStats.totalUsers).toBe(0)
    expect((await app.call("/api/analytics/user-usage", { method: "DELETE" })).body.message).toBe("Data cleared successfully")
  })
})
