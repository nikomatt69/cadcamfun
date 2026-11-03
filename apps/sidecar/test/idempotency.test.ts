import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let stranger: Record<string, string>
beforeAll(async () => {
  app = await makeApp()
  const password = "test-password-long"
  await app.call("/api/auth/signup", { method: "POST", json: { email: "idem@example.com", name: "Idem Person", password, confirmPassword: password } })
  stranger = { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "idem@example.com", password } })).body.token }
})
afterAll(async () => { await app.dispose() })

const send = (key: string | undefined, json: unknown, extra: Record<string, string> = {}, path = "/api/projects", method = "POST") =>
  app.call(path, { method, json, headers: { ...(key ? { "idempotency-key": key } : {}), ...extra } })
const count = async () => (await app.call("/api/projects")).body.length

describe("Idempotency-Key", () => {
  test("a retried POST gets the stored answer: one project, the same body, marked as a replay", async () => {
    const before = await count()
    const first = await send("create-1", { name: "Once" })
    expect(first.status).toBe(201)
    expect(first.headers.get("idempotent-replayed")).toBeNull()
    const again = await send("create-1", { name: "Once" })
    expect(again.status).toBe(201)
    expect(again.body).toEqual(first.body)
    expect(again.headers.get("idempotent-replayed")).toBe("true")
    expect(await count()).toBe(before + 1)
  })

  test("the same key with another body or path is refused, nothing is written", async () => {
    const before = await count()
    await send("create-2", { name: "A" })
    const other = await send("create-2", { name: "B" })
    expect(other.status).toBe(422)
    expect(other.body.message).toBe("Idempotency-Key was already used with a different request")
    expect((await send("create-2", { name: "A" }, {}, "/api/materials")).status).toBe(422)
    expect(await count()).toBe(before + 1)
  })

  test("without the header every request runs, and a key is scoped to its caller", async () => {
    const before = await count()
    await send(undefined, { name: "Twice" })
    await send(undefined, { name: "Twice" })
    expect(await count()).toBe(before + 2)

    const mine = await send("shared-key", { name: "Mine" })
    const theirs = await send("shared-key", { name: "Mine" }, stranger)
    expect(theirs.status).toBe(201)
    expect(theirs.body.id).not.toBe(mine.body.id)
    expect(theirs.headers.get("idempotent-replayed")).toBeNull()
  })

  test("a refusal is stored too (a retry of a bad request answers the same 400), a bad key is a 400, GET ignores the header", async () => {
    const bad = await send("bad-1", {})
    expect(bad.status).toBe(400)
    const again = await send("bad-1", {})
    expect(again.body).toEqual(bad.body)
    expect(again.headers.get("idempotent-replayed")).toBe("true")
    expect((await send("x".repeat(201), { name: "x" })).status).toBe(400)
    const get = await app.call("/api/projects", { headers: { "idempotency-key": "get-1" } })
    expect(get.headers.get("idempotent-replayed")).toBeNull()
  })

  test("two requests with the same key at the same time write once", async () => {
    const before = await count()
    const [a, b] = await Promise.all([send("race-1", { name: "Race" }), send("race-1", { name: "Race" })])
    expect([a.status, b.status]).toEqual([201, 201])
    expect(a.body.id).toBe(b.body.id)
    expect(await count()).toBe(before + 1)
  })

  test("PUT and DELETE replay as well: a repeated delete is not a 404", async () => {
    const id = (await send(undefined, { name: "To delete" })).body.id
    const first = await send("del-1", undefined, {}, `/api/projects/${id}`, "DELETE")
    expect(first.status).toBe(200)
    const again = await send("del-1", undefined, {}, `/api/projects/${id}`, "DELETE")
    expect(again.status).toBe(200)
    expect(again.headers.get("idempotent-replayed")).toBe("true")
    expect((await send(undefined, undefined, {}, `/api/projects/${id}`, "DELETE")).status).toBe(404)
  })
})
