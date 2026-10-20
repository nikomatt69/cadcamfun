import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let other: Record<string, string>
beforeAll(async () => {
  app = await makeApp()
  const password = "test-password-long"
  const created = await app.call("/api/auth/signup", { method: "POST", json: { email: "other@example.com", name: "Other", password, confirmPassword: password } })
  expect(created.status).toBe(201)
  const signin = await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "other@example.com", password } })
  expect(signin.status).toBe(200)
  other = { "x-session-token": signin.body.token }
})
afterAll(async () => { await app.dispose() })

describe("a user only sees their own data, public or private", () => {
  test("another user's public project, material and tool never show up", async () => {
    const project = await app.call("/api/projects", { method: "POST", json: { name: "Mine", isPublic: true } })
    const material = await app.call("/api/materials", { method: "POST", json: { name: "Steel", properties: { density: 7.8 }, isPublic: true } })
    const tool = await app.call("/api/tools", { method: "POST", json: { name: "End mill", type: "endmill", diameter: 6, material: "Carbide", numberOfFlutes: 3, maxRPM: 24000, isPublic: true } })
    expect([project.status, material.status, tool.status]).toEqual([201, 201, 201])

    const theirs = { headers: other }
    expect((await app.call("/api/projects", theirs)).body.map((p: { id: string }) => p.id)).not.toContain(project.body.id)
    expect((await app.call("/api/materials", theirs)).body.map((m: { id: string }) => m.id)).not.toContain(material.body.id)
    expect((await app.call("/api/tools", theirs)).body.map((t: { id: string }) => t.id)).not.toContain(tool.body.id)
    expect((await app.call(`/api/materials/${material.body.id}`, theirs)).status).toBe(404)
    expect((await app.call(`/api/materials/${material.body.id}`, { method: "DELETE", ...theirs })).status).toBe(404)
    expect((await app.call(`/api/tools/${tool.body.id}`, theirs)).status).toBe(404)
    // The owner still sees all of them.
    expect((await app.call("/api/materials")).body.map((m: { id: string }) => m.id)).toContain(material.body.id)
  })
})
