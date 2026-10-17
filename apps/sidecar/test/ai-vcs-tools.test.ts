import { expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { Effect, Layer } from "effect"
import { ProjectRepo } from "../src/repos/project-repo.ts"
import { ProjectVcsRepo } from "../src/repos/project-vcs-repo.ts"
import { GitHubTransports, ProjectVcs, type Actor } from "../src/services/project-vcs.ts"
import { Repository, memoryBackend, repositoryTransport } from "@cadcamfun/vcs"
import { WorkflowRunner } from "../src/services/workflow-runner.ts"
import { vcsContributions } from "../src/services/ai-vcs-tools.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const transport = Layer.succeed(GitHubTransports, GitHubTransports.of({ make: () => repositoryTransport(new Repository(memoryBackend())) }))
const Live = Layer.mergeAll(ProjectRepo.layer, ProjectVcs.layer.pipe(Layer.provide(ProjectVcsRepo.layer), Layer.provide(transport))).pipe(
  Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder }))
)

test("AI VCS tools deny visible read-only members before workflow or branch mutations", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const { db } = yield* Database
    const projects = yield* ProjectRepo
    const vcs = yield* ProjectVcs
    const owner = db.insert(schema.userTable).values({ email: "owner@test.local" }).returning().get()
    const member = db.insert(schema.userTable).values({ email: "member@test.local" }).returning().get()
    const org = db.insert(schema.organizationTable).values({ name: "Shop" }).returning().get()
    db.insert(schema.userOrganizationTable).values({ userId: member.id, organizationId: org.id, role: "MEMBER" }).run()
    const project = db.insert(schema.projectTable).values({ name: "Plate", ownerId: owner.id, organizationId: org.id }).returning().get()
    const actor: Actor = { userId: member.id, name: "Member", email: "member@test.local" }
    let triggers = 0
    const runner = { trigger: () => Effect.sync(() => { triggers++; return [] }) } as unknown as WorkflowRunner["Service"]
    const contributions = vcsContributions({ vcs, projects, runner, actor })
    const ctx = { projectId: project.id, sessionId: "s", signal: new AbortController().signal, handlers: {} as never }
    expect(yield* projects.find(member.id, project.id)).toBeDefined()
    for (const [id, input] of [
      ["vcs_edit.start_change", { topic: "plate" }], ["vcs_edit.commit", { message: "Save" }],
      ["vcs_edit.restore", { paths: ["drawings/d.json"], from: "main" }],
      ["vcs_edit.open_pull_request", { title: "Plate", body: "" }], ["vcs_edit.run_workflows", { trigger: "manual" }]
    ] as const) {
      const refused = yield* Effect.promise(() => contributions[id]!(input as never, ctx).then(() => "ran", (error: Error) => error.message))
      expect(refused, id).toBe("You do not have permission to write this project")
    }
    expect(triggers).toBe(0)
    expect(db.select().from(schema.gitRefTable).all()).toEqual([])
    // Reading a legacy project must not silently create history with the reader as its author.
    yield* Effect.promise(() => contributions["vcs.status"]!({} as never, ctx))
    expect(db.select().from(schema.gitRefTable).all()).toEqual([])
    expect(db.select().from(schema.gitObjectTable).all()).toEqual([])
  }).pipe(Effect.provide(Live), Effect.scoped))
})

test("AI's first commit on a legacy project succeeds on main without a branch", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const { db } = yield* Database
    const projects = yield* ProjectRepo
    const vcs = yield* ProjectVcs
    const owner = db.insert(schema.userTable).values({ name: "Owner", email: "owner@test.local" }).returning().get()
    const project = db.insert(schema.projectTable).values({ name: "Legacy", ownerId: owner.id }).returning().get()
    const actor: Actor = { userId: owner.id, name: "Owner", email: "owner@test.local" }
    const tools = vcsContributions({ vcs, projects, runner: {} as WorkflowRunner["Service"], actor })
    const ctx = { projectId: project.id, sessionId: "s", signal: new AbortController().signal, handlers: {} as never }
    const result = yield* Effect.promise(() => tools["vcs_edit.commit"]!({ message: "Record current model" } as never, ctx))
    const history = yield* vcs.log(project.id)
    expect(history).toHaveLength(1)
    expect(result).toEqual({ commit: history[0]?.oid })
    expect(history[0]?.message.trim()).toBe("Record current model")
    expect(history[0]?.author.name).toBe("Owner (AI)")
    expect((yield* vcs.branches(project.id)).current).toBe("main")
    expect(yield* vcs.status(project.id)).toEqual([])
  }).pipe(Effect.provide(Live), Effect.scoped))
})

test("VCS tool actor is captured at invocation, not at cached tool registration", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const { db } = yield* Database
    const projects = yield* ProjectRepo
    const vcs = yield* ProjectVcs
    const first = db.insert(schema.userTable).values({ email: "first@test.local" }).returning().get()
    const second = db.insert(schema.userTable).values({ email: "second@test.local" }).returning().get()
    const project = db.insert(schema.projectTable).values({ name: "Part", ownerId: second.id }).returning().get()
    let current = first.id
    const actor: Actor = { get userId() { return current }, name: "User", email: "user@test.local" }
    const runner = {} as WorkflowRunner["Service"]
    const status = vcsContributions({ vcs, projects, runner, actor })["vcs.status"]!
    const ctx = { projectId: project.id, sessionId: "s", signal: new AbortController().signal, handlers: {} as never }
    current = second.id
    expect(yield* Effect.promise(() => status({} as never, ctx))).toMatchObject({ dirty: expect.anything() })
    current = first.id
    const denied = yield* Effect.promise(() => status({} as never, ctx).then(() => "ran", (error: Error) => error.message))
    expect(denied).toMatch(/No such project|permission/)
  }).pipe(Effect.provide(Live), Effect.scoped))
})
