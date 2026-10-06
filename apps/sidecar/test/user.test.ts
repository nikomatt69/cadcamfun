import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const json = (path: string, method: string, body?: unknown) => app.call(path, { method, ...(body === undefined ? {} : { json: body }) })

describe("/api/user", () => {
  test("requires the launch token", async () => {
    expect((await app.call("/api/user/profile", { auth: false })).status).toBe(401)
  })

  test("profile read and multipart update with legacy validation", async () => {
    const before = await app.call("/api/user/profile")
    expect(before.status).toBe(200)
    expect(before.body._count).toEqual({ projects: 0 })
    const put = (fields: Record<string, string>) => {
      const form = new FormData()
      for (const [k, v] of Object.entries(fields)) form.set(k, v)
      return app.call("/api/user/profile", { method: "PUT", body: form })
    }
    expect((await put({ bio: "x" })).body.message).toBe("Name is required")
    expect((await put({ name: "x".repeat(101) })).body.message).toBe("Name must be less than 100 characters")
    expect((await put({ name: "A", bio: "x".repeat(501) })).body.message).toBe("Bio must be less than 500 characters")
    expect((await put({ name: "A", website: "http://" })).body.message).toBe("Invalid website URL")
    const ok = await put({ name: " Ada ", bio: "hello", showEmail: "true" })
    expect(ok.status).toBe(200)
    expect(ok.body.message).toBe("Profile updated successfully")
    expect(ok.body.user).toMatchObject({ name: "Ada", bio: "hello", showEmail: true, publicProfile: true })
  })

  test("stats, lists and the public user", async () => {
    await json("/api/projects", "POST", { name: "P" })
    expect((await json("/api/user/stats", "GET")).body).toMatchObject({ projectsCount: 1, drawingsCount: 0, totalDesigns: 0 })
    expect((await json("/api/user/projects", "GET")).body).toHaveLength(1)
    expect((await json("/api/user/components", "GET")).body).toEqual([])
    expect((await json("/api/user/toolpaths", "GET")).body).toEqual([])
    await json("/api/organizations", "POST", { name: "Shop" })
    const orgs = await json("/api/user/organizations", "GET")
    expect(orgs.body[0]).toMatchObject({ name: "Shop", role: "ADMIN", userCount: 1, projectCount: 0 })
    const me = (await json("/api/user/profile", "GET")).body
    const byId = await json(`/api/user/${me.id}`, "GET")
    expect(byId.body.organizations[0]).toMatchObject({ name: "Shop", role: "ADMIN" })
    expect((await json("/api/user/nope", "GET")).status).toBe(404)
  })

  test("api keys: create once, list without the hash, revoke", async () => {
    expect((await json("/api/user/api-keys", "POST", {})).body.message).toBe("Key name is required")
    const created = await json("/api/user/api-keys", "POST", { name: " ci " })
    expect(created.status).toBe(201)
    expect(created.body.apiKey).toStartWith("cad_")
    expect(created.body.name).toBe("ci")
    const list = await json("/api/user/api-keys", "GET")
    expect(list.body).toHaveLength(1)
    expect(list.body[0].keyHash).toBeUndefined()
    expect((await json("/api/user/api-keys", "DELETE")).body.message).toBe("Key ID is required")
    expect((await json("/api/user/api-keys?keyId=nope", "DELETE")).status).toBe(404)
    expect((await json(`/api/user/api-keys?keyId=${list.body[0].id}`, "DELETE")).body.message).toBe("API Key revoked successfully")
  })

  test("tokens are the legacy demo list; creating validates input", async () => {
    expect((await json("/api/user/tokens", "GET")).body.tokens).toHaveLength(3)
    const bad = await json("/api/user/tokens", "POST", { name: "x" })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe("Name and permissions are required")
    const ok = await json("/api/user/tokens", "POST", { name: "My Token", permissions: ["read:projects"], expiresIn: 7 })
    expect(ok.status).toBe(201)
    expect(ok.body.token.prefix).toStartWith("cad_my_token_")
    expect(ok.body.fullToken).toStartWith(ok.body.token.prefix)
  })

  test("password change requires a credential account", async () => {
    expect((await json("/api/user/password", "PUT", {})).body.message).toBe("Current password and new password are required")
    expect((await json("/api/user/password", "PUT", { currentPassword: "a", newPassword: "short" })).body.message).toBe("New password must be at least 8 characters long")
    const none = await json("/api/user/password", "PUT", { currentPassword: "a", newPassword: "longenough" })
    expect(none.status).toBe(404)
    expect(none.body.message).toBe("No password set for this account")
  })

  test("verify-change validates its query", async () => {
    expect((await json("/api/user/verify-change", "GET")).body.message).toBe("Token and verification type are required")
    expect((await json("/api/user/verify-change?token=x&type=email", "GET")).status).toBe(404)
  })

  test("delete-account removes the profile", async () => {
    const r = await json("/api/user/delete-account", "DELETE")
    expect(r.status).toBe(200)
    expect(r.body.message).toBe("Account deleted successfully")
    expect((await json("/api/user/profile", "GET")).status).toBe(404)
  })
})
