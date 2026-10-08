import { describe, expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { ProjectVcsRepo } from "../src/repos/project-vcs-repo.ts"
import { ProjectVcs, VcsFailure, type Actor } from "../src/services/project-vcs.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const Live = ProjectVcs.layer.pipe(Layer.provideMerge(ProjectVcsRepo.layer), Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder })))

/** The expected VcsFailure of an effect (a DatabaseError would fail the test). */
const failure = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.flip(effect).pipe(Effect.map((e) => {
    if (!(e instanceof VcsFailure)) throw e
    return e
  }))

/** Runs `body` with a project that has one drawing and one toolpath, plus a human and an AI-companion actor. */
const withProject = <A, E>(body: (ctx: { projectId: string; owner: Actor; companion: Actor; reviewer: Actor; sql: Database["Service"]["db"]; vcs: ProjectVcs["Service"] }) => Effect.Effect<A, E, never>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const { db } = yield* Database
      const vcs = yield* ProjectVcs
      const [u1, u2] = db.insert(schema.userTable).values([{ email: "ada@x.io", name: "Ada" }, { email: "rev@x.io", name: "Rev" }]).returning().all()
      const project = db.insert(schema.projectTable).values({ name: "Bracket", ownerId: u1!.id }).returning().get()
      db.insert(schema.drawingTable).values({ id: "d1", name: "Plate", data: { w: 100, h: 50 }, projectId: project.id }).run()
      db.insert(schema.toolpathTable).values({ id: "t1", name: "Pocket", data: { depth: 3 }, gcode: "G0 X0", projectId: project.id, createdBy: u1!.id }).run()
      const owner: Actor = { userId: u1!.id, name: "Ada", email: "ada@x.io" }
      return yield* body({ projectId: project.id, owner, companion: { ...owner, kind: "ai" }, reviewer: { userId: u2!.id, name: "Rev", email: "rev@x.io" }, sql: db, vcs })
    }).pipe(Effect.provide(Live), Effect.scoped),
  )

describe("ProjectVcs", () => {
  test("commit tracks the database, status reports dirty files", () =>
    withProject(({ projectId, owner, sql, vcs }) =>
      Effect.gen(function*() {
        expect((yield* vcs.status(projectId)).length).toBe(3) // everything is new
        const first = yield* vcs.commit(projectId, { message: "Initial import" }, owner)
        expect(yield* vcs.status(projectId)).toEqual([])
        sql.update(schema.drawingTable).set({ data: { w: 120, h: 50 } }).where(eq(schema.drawingTable.id, "d1")).run()
        expect(yield* vcs.status(projectId)).toEqual(["drawings/d1.json"])
        const second = yield* vcs.commit(projectId, { message: "Widen plate" }, owner)
        expect((yield* vcs.log(projectId)).map((c) => c.oid)).toEqual([second, first])
        const changes = yield* vcs.diff(projectId, first, second)
        expect(changes[0]).toMatchObject({ kind: "drawings", id: "d1", name: "Plate" })
        expect(changes[0]!.changes).toContainEqual({ pointer: "/data/w", before: 100, after: 120 })
        expect((yield* failure(vcs.commit(projectId, { message: "noop" }, owner))).code).toBe("nothing-to-commit")
      })))

  test("AI companion branch -> pull request -> review -> merge updates the database", () =>
    withProject(({ projectId, owner, companion, reviewer, sql, vcs }) =>
      Effect.gen(function*() {
        yield* vcs.commit(projectId, { message: "Initial import" }, owner)
        yield* vcs.createBranch(projectId, "ai/deeper-pocket")
        yield* vcs.checkout(projectId, "ai/deeper-pocket", companion)
        sql.update(schema.toolpathTable).set({ data: { depth: 5 }, gcode: "G0 X0 Z-5" }).where(eq(schema.toolpathTable.id, "t1")).run()
        yield* vcs.commit(projectId, { message: "Deepen pocket to 5 mm" }, companion)
        expect((yield* vcs.log(projectId))[0]!.author.name).toBe("Ada (AI)")
        const pr = yield* vcs.openPullRequest(projectId, { title: "Deeper pocket", head: "ai/deeper-pocket" }, companion)
        expect(pr).toMatchObject({ number: 1, state: "open", authorKind: "ai", base: "main" })

        yield* vcs.checkout(projectId, "main", owner)
        expect(sql.select().from(schema.toolpathTable).get()!.data).toEqual({ depth: 3 })

        yield* vcs.review(projectId, 1, { verdict: "request-changes", body: "Too deep for 6 mm stock", path: "toolpaths/t1.json", pointer: "/data/depth" }, reviewer)
        expect((yield* failure(vcs.mergePullRequest(projectId, 1, owner))).code).toBe("blocked")
        yield* vcs.review(projectId, 1, { verdict: "approve" }, reviewer)

        const view = yield* vcs.pullRequest(projectId, 1)
        expect(view.changes.map((c) => c.path)).toEqual(["toolpaths/t1.json"])
        const merged = yield* vcs.mergePullRequest(projectId, 1, owner)
        expect(merged.state).toBe("merged")
        expect(sql.select().from(schema.toolpathTable).get()).toMatchObject({ data: { depth: 5 }, gcode: "G0 X0 Z-5" })
        expect((yield* vcs.pullRequest(projectId, 1)).changes.map((c) => c.path)).toEqual(["toolpaths/t1.json"])
      })))

  test("checkout refuses a dirty working copy; conflicting PR is rejected; restore adds a commit", () =>
    withProject(({ projectId, owner, sql, vcs }) =>
      Effect.gen(function*() {
        const first = yield* vcs.commit(projectId, { message: "one" }, owner)
        yield* vcs.createBranch(projectId, "other")
        sql.update(schema.drawingTable).set({ data: { w: 1, h: 50 } }).where(eq(schema.drawingTable.id, "d1")).run()
        expect((yield* failure(vcs.checkout(projectId, "other", owner))).code).toBe("dirty")
        yield* vcs.commit(projectId, { message: "main w=1" }, owner)

        yield* vcs.checkout(projectId, "other", owner)
        sql.update(schema.drawingTable).set({ data: { w: 2, h: 50 } }).where(eq(schema.drawingTable.id, "d1")).run()
        yield* vcs.commit(projectId, { message: "other w=2" }, owner)
        yield* vcs.checkout(projectId, "main", owner)
        yield* vcs.openPullRequest(projectId, { title: "Other", head: "other" }, owner)
        const conflict = yield* failure(vcs.mergePullRequest(projectId, 1, owner))
        expect(conflict.code).toBe("conflict")
        expect(conflict.conflicts).toEqual([{ path: "drawings/d1.json", pointers: expect.arrayContaining(["/data/w"]) }])

        yield* vcs.restore(projectId, first, owner)
        expect(sql.select().from(schema.drawingTable).get()!.data).toEqual({ w: 100, h: 50 })
        expect((yield* vcs.log(projectId)).length).toBe(3)
      })))
})

import { WorkflowRunner } from "../src/services/workflow-runner.ts"

const CI = `name: Validate
on:
  push:
    branches: [main, "ai/**"]
jobs:
  check:
    steps:
      - uses: project/validate
      - uses: project/require-gcode
`

describe("AI actor guard", () => {
  test("the companion cannot write to main, only propose via ai/* branches", () =>
    withProject(({ projectId, owner, companion, vcs }) =>
      Effect.gen(function*() {
        yield* vcs.commit(projectId, { message: "init" }, owner)
        expect((yield* failure(vcs.commit(projectId, { message: "sneaky" }, companion, {}))).code).toBe("blocked")
        yield* vcs.createBranch(projectId, "ai/x")
        yield* vcs.checkout(projectId, "ai/x", companion)
        yield* vcs.openPullRequest(projectId, { title: "t", head: "ai/x" }, companion).pipe(Effect.flip) // nothing to merge yet
        yield* vcs.checkout(projectId, "main", owner)
        expect((yield* failure(vcs.restore(projectId, "ai/x", companion))).code).toBe("blocked")
      })))
})

describe("WorkflowRunner", () => {
  test("a push runs the workflows stored in the commit, like GitHub Actions", () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const { db } = yield* Database
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        const [u] = db.insert(schema.userTable).values({ email: "a@x.io", name: "A" }).returning().all()
        const project = db.insert(schema.projectTable).values({ name: "P", ownerId: u!.id }).returning().get()
        db.insert(schema.drawingTable).values({ id: "d1", name: "Plate", data: {}, projectId: project.id }).run()
        db.insert(schema.toolpathTable).values({ id: "t1", name: "Pocket", gcode: null, projectId: project.id, createdBy: u!.id }).run()
        const actor: Actor = { userId: u!.id, name: "A", email: "a@x.io" }
        // The workflow is a file in the repository, committed together with the model.
        yield* vcs.commit(project.id, { message: "init" }, actor, { ".cadcamfun/workflows/ci.yml": CI })
        expect(yield* vcs.status(project.id)).toEqual([]) // workflow files do not make the working copy dirty
        const events: string[] = []
        const [run] = yield* runner.trigger(project.id, "main", { type: "push", branch: "main", changedPaths: [] }, (w, e) => events.push(`${w}:${e.type}`))
        expect(run).toMatchObject({ workflow: "ci.yml", status: "failure", event: "push" })
        expect(JSON.stringify(run!.events)).toContain("Toolpaths without G-code: t1")
        expect(events.length).toBeGreaterThan(0)
        expect(yield* runner.trigger(project.id, "main", { type: "push", branch: "dev", changedPaths: [] })).toEqual([])
        expect((yield* runner.runs(project.id)).length).toBe(1)
      }).pipe(Effect.provide(WorkflowRunner.layer().pipe(Layer.provideMerge(Live))), Effect.scoped),
    ))
})

import { ProjectRepo } from "../src/repos/project-repo.ts"
import { vcsToolSpecs } from "../src/services/ai-vcs-tools.ts"

describe("assistant VCS tools", () => {
  test("start_change -> edit -> commit -> open PR; main stays untouched and cannot be merged by the AI", () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const { db } = yield* Database
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        const projects = yield* ProjectRepo
        const [u] = db.insert(schema.userTable).values({ email: "a@x.io", name: "Ada" }).returning().all()
        const project = db.insert(schema.projectTable).values({ name: "P", ownerId: u!.id }).returning().get()
        db.insert(schema.drawingTable).values({ id: "d1", name: "Plate", data: { w: 1 }, projectId: project.id }).run()
        const actor: Actor = { userId: u!.id, name: "Ada", email: "a@x.io" }
        yield* vcs.commit(project.id, { message: "init" }, actor)
        const tools = Object.fromEntries(vcsToolSpecs({ vcs, runner, projects, actor }).map((t) => [t.id, t]))
        const call = (id: string, input: unknown) => Effect.promise(async () => JSON.parse(await tools[id]!.execute(input, { sessionId: "s", projectId: project.id, signal: new AbortController().signal })))

        expect((yield* call("vcs_commit", { message: "on main" })).ok).toBe(false) // nothing changed yet; and main is protected
        expect(yield* call("vcs_start_change", { topic: "Widen the plate!" })).toEqual({ ok: true, value: { branch: "ai/widen-the-plate" } })
        db.update(schema.drawingTable).set({ data: { w: 2 } }).where(eq(schema.drawingTable.id, "d1")).run() // what cad_modify_entities would do
        expect((yield* call("vcs_status", {})).value.dirty).toEqual(["drawings/d1.json"])
        expect((yield* call("vcs_commit", { message: "Widen plate to 2" })).ok).toBe(true)
        const diff = (yield* call("vcs_diff", {})).value
        expect(diff[0].changes).toContainEqual({ pointer: "/data/w", before: 1, after: 2 })
        expect((yield* call("vcs_open_pull_request", { title: "Widen plate", body: "w 1 -> 2" })).value).toEqual({ number: 1, head: "ai/widen-the-plate", base: "main" })

        // Working on a dirty tree is refused, and the AI cannot merge: that stays with a person.
        db.update(schema.drawingTable).set({ data: { w: 3 } }).where(eq(schema.drawingTable.id, "d1")).run()
        expect((yield* call("vcs_start_change", { topic: "other" })).error).toContain("Uncommitted")
        const list = (yield* call("vcs_list_pull_requests", {})).value
        expect(list).toEqual([{ number: 1, title: "Widen plate", head: "ai/widen-the-plate", authorKind: "ai", reviews: [] }])
        expect((yield* vcs.pullRequest(project.id, 1)).pullRequest.state).toBe("open")
      }).pipe(Effect.provide(WorkflowRunner.layer().pipe(Layer.provideMerge(ProjectRepo.layer), Layer.provideMerge(Live))), Effect.scoped),
    ))
})
