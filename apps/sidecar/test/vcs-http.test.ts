import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let id: string
beforeAll(async () => {
  app = await makeApp()
  id = (await app.call("/api/projects", { method: "POST", json: { name: "Bracket" } })).body.id
  await app.call(`/api/projects/${id}/drawings`, { method: "POST", json: { name: "Plate", data: { w: 100 } } })
})
afterAll(async () => { await app.dispose() })

const v = (path: string) => `/api/projects/${id}${path}`
const CI = "name: Validate\non:\n  push:\n    branches: ['**']\njobs:\n  check:\n    steps:\n      - uses: project/validate\n"

describe("vcs HTTP", () => {
  test("auth, unknown project, empty commit message", async () => {
    expect((await app.call(v("/vcs/status"), { auth: false })).status).toBe(401)
    expect((await app.call("/api/projects/nope/vcs/status")).status).toBe(404)
    expect((await app.call(v("/vcs/commit"), { method: "POST", json: { message: " " } })).status).toBe(400)
  })

  test("commit -> branch -> PR -> review -> merge, with Actions on push", async () => {
    const first = await app.call(v("/vcs/commit"), { method: "POST", json: { message: "Initial import" } })
    expect(first.status).toBe(201)
    expect((await app.call(v("/vcs/status"))).body).toMatchObject({ branch: "main", head: first.body.oid, dirty: [] })
    expect((await app.call(v("/vcs/commit"), { method: "POST", json: { message: "again" } })).status).toBe(400) // nothing to commit

    expect((await app.call(v("/vcs/branches"), { method: "POST", json: { name: "ai/widen-plate" } })).status).toBe(201)
    expect((await app.call(v("/vcs/checkout"), { method: "POST", json: { branch: "ai/widen-plate" } })).body.branch).toBe("ai/widen-plate")
    const [drawing] = (await app.call(`/api/projects/${id}/drawings`)).body
    await app.call(`/api/drawings/${drawing.id}`, { method: "PUT", json: { data: { w: 140 } } })
    expect((await app.call(v("/vcs/status"))).body.dirty).toEqual([`drawings/${drawing.id}.json`])
    await app.call(v("/vcs/commit"), { method: "POST", json: { message: "Widen plate to 140 mm" } })

    const pr = await app.call(v("/pulls"), { method: "POST", json: { title: "Widen plate", head: "ai/widen-plate", authorKind: "ai" } })
    expect(pr.status).toBe(201)
    expect(pr.body).toMatchObject({ number: 1, state: "open", authorKind: "ai", base: "main" })

    const detail = await app.call(v("/pulls/1"))
    expect(detail.body.changes[0]).toMatchObject({ kind: "drawings", name: "Plate", status: "modified" })
    expect(detail.body.changes[0].changes).toContainEqual({ pointer: "/data/w", before: 100, after: 140 })

    expect((await app.call(v("/pulls/1/reviews"), { method: "POST", json: { verdict: "approve", body: "LGTM" } })).status).toBe(201)
    await app.call(v("/vcs/checkout"), { method: "POST", json: { branch: "main" } })
    const merged = await app.call(v("/pulls/1/merge"), { method: "POST" })
    expect(merged.body.state).toBe("merged")
    expect((await app.call(`/api/drawings/${drawing.id}`)).body.data).toEqual({ w: 140 })
    expect((await app.call(v("/pulls?state=open"))).body).toEqual([])
    // main had not moved, so the merge fast-forwarded: the PR records the new tip.
    expect(merged.body.mergeCommit).toBe((await app.call(v("/vcs/log"))).body[0].oid)
  })

  test("a workflow committed with the model runs on push and on dispatch", async () => {
    expect((await app.call(v("/vcs/commit"), { method: "POST", json: { message: "evil", files: { "../x": "y" } } })).status).toBe(400)
    const commit = await app.call(v("/vcs/commit"), { method: "POST", json: { message: "Add CI", files: { ".cadcamfun/workflows/ci.yml": CI } } })
    expect(commit.status).toBe(201)
    // Triggered by that very push:
    const runs = (await app.call(v("/actions/runs"))).body
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ workflow: "ci.yml", event: "push", status: "success", ref: "main" })
    const manual = await app.call(v("/actions/dispatch"), { method: "POST", json: {} })
    expect(manual.body).toEqual([]) // ci.yml has no `manual` trigger
  })
})
