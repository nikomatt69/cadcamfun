import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const call = (path: string, method: string, body?: unknown) => app.call(path, { method, ...(body === undefined ? {} : { json: body }) })

describe("push subscriptions and notifications", () => {
  test("save, update in place and delete a push subscription", async () => {
    expect((await call("/api/push-subscription", "POST", { endpoint: "e" })).body.message).toBe("Dati di sottoscrizione non validi")
    const sub = { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } }
    const first = await call("/api/push-subscription", "POST", sub)
    expect(first.body.success).toBe(true)
    const second = await call("/api/push-subscription", "POST", { ...sub, keys: { p256dh: "k2", auth: "a2" } })
    expect(second.body.id).toBe(first.body.id)
    expect((await call("/api/push-subscription", "DELETE", {})).body.message).toBe("Endpoint richiesto")
    expect((await call("/api/push-subscription", "DELETE", { endpoint: sub.endpoint })).body).toEqual({ success: true })
  })

  test("app-control/notify validates and creates a notification", async () => {
    const bad = await call("/api/app-control/notify", "POST", {})
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe("Missing userId or message")
    const me = (await call("/api/user/profile", "GET")).body.id
    const ok = await call("/api/app-control/notify", "POST", { userId: me, message: { type: "NEW_MESSAGE", title: "Hi", content: "Body" } })
    expect(ok.body).toEqual({ success: true, message: "Notification triggered." })
    expect((await call("/api/notifications", "GET")).body.notifications[0]).toMatchObject({ title: "Hi" })
  })
})

describe("desktop client routes", () => {
  test("project list and create with the snake_case shape", async () => {
    expect((await call("/api/desktop/projects", "POST", {})).body.error).toBe("Project name is required")
    expect((await call("/api/desktop/projects", "POST", { name: "x".repeat(256) })).body.error).toBe("Project name must be less than 255 characters")
    expect((await call("/api/desktop/projects", "POST", { name: "P", organization_id: "nope" })).body.error).toBe("Invalid organization or user not a member")
    const created = await call("/api/desktop/projects", "POST", { name: " Bracket ", description: "d", is_public: true })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ name: "Bracket", description: "d", is_public: true })
    const list = await call("/api/desktop/projects", "GET")
    expect(list.body.message).toBe("Retrieved 1 projects")
    expect(list.body.data[0].owner_id).toBeDefined()
  })

  test("user lookup by e-mail", async () => {
    expect((await call("/api/desktop/user/by-email", "GET")).body.error).toBe("Email parameter is required")
    expect((await call("/api/desktop/user/by-email?email=ghost@example.com", "GET")).status).toBe(404)
    const found = await call("/api/desktop/user/by-email?email=local@cadcamfun.local", "GET")
    expect(found.body).toMatchObject({ success: true, message: "User found successfully", data: { email: "local@cadcamfun.local" } })
  })

  test("desktop sign-in checks credentials", async () => {
    expect((await call("/api/desktop/auth/signin", "POST", {})).body.error).toBe("Email and password are required")
    expect((await call("/api/desktop/auth/signin", "POST", { email: "ghost@example.com", password: "x" })).status).toBe(401)
    await call("/api/auth/signup", "POST", { email: "d@example.com", name: "Dee", password: "longpassword", confirmPassword: "longpassword" })
    const ok = await call("/api/desktop/auth/signin", "POST", { email: "d@example.com", password: "longpassword", deviceId: "dev1" })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ success: true, user: { email: "d@example.com" }, syncData: { version: "1.0.0" } })
    expect(ok.body.token.split(".")).toHaveLength(3)
  })
})

describe("tracked projects", () => {
  test("read, update and delete mirror /api/projects/:id", async () => {
    const created = (await call("/api/projects", "POST", { name: "Tracked" })).body
    expect((await call(`/api/projects/tracked/${created.id}`, "GET")).body.name).toBe("Tracked")
    expect((await call("/api/projects/tracked/nope", "GET")).status).toBe(404)
    expect((await call(`/api/projects/tracked/${created.id}`, "PUT", {})).body.message).toBe("Project name is required")
    expect((await call(`/api/projects/tracked/${created.id}`, "PUT", { name: "Renamed" })).body.name).toBe("Renamed")
    expect((await call(`/api/projects/tracked/${created.id}`, "DELETE")).body.message).toBe("Project deleted successfully")
  })
})
