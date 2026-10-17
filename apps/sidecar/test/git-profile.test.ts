import { expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

test("Git identity is authenticated, persisted per user and used by new project history", async () => {
  const app = await makeApp()
  try {
    expect((await app.call("/api/user/git-profile", { auth: false })).status).toBe(401)
    expect((await app.call("/api/user/git-profile", { method: "PUT", auth: false, json: { name: "X", email: "x@test.local" } })).status).toBe(401)
    const account = (await app.call("/api/user/profile")).body
    const first = await app.call("/api/user/git-profile")
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ name: expect.any(String), email: expect.any(String) })
    const identity = { name: "Ada Git", email: "ada-git@test.local" }
    const updated = await app.call("/api/user/git-profile", { method: "PUT", json: { name: " Ada Git ", email: " ada-git@test.local ", userId: "another-user" } })
    expect(updated.status).toBe(200)
    expect(updated.body).toEqual(identity)
    expect((await app.call("/api/user/git-profile")).body).toEqual(identity)

    for (const invalid of [{ name: " ", email: identity.email }, { name: "Ada <Git>", email: identity.email }, { name: identity.name, email: "invalid" }]) {
      expect((await app.call("/api/user/git-profile", { method: "PUT", json: invalid })).status).toBe(400)
    }
    expect((await app.call("/api/user/git-profile")).body).toEqual(identity)
    expect((await app.call("/api/user/profile")).body.name).toBe(account.name)

    const created = await app.call("/api/projects", { method: "POST", json: { name: "Fresh repository" } })
    expect(created.status).toBe(201)
    const status = await app.call(`/api/projects/${created.body.id}/vcs/status`)
    expect(status.body).toMatchObject({ branch: "main", head: expect.any(String), dirty: [] })
    const history = await app.call(`/api/projects/${created.body.id}/vcs/log`)
    expect(history.body).toHaveLength(1)
    expect(history.body[0].message.trim()).toBe("Initial commit")
    expect(history.body[0].author).toMatchObject(identity)

  } finally {
    await app.dispose()
  }
})
