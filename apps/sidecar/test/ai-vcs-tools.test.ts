import { expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { Effect, Layer } from "effect"
import { ProjectRepo } from "../src/repos/project-repo.ts"
import { ProjectVcsRepo } from "../src/repos/project-vcs-repo.ts"
import { GitHubTransports, ProjectVcs, type Actor } from "../src/services/project-vcs.ts"
import { Repository, memoryBackend, repositoryTransport } from "@cadcamfun/vcs"
import { WorkflowRunner } from "../src/services/workflow-runner.ts"
import { vcsToolSpecs } from "../src/services/ai-vcs-tools.ts"

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
    const tools = vcsToolSpecs({ vcs, projects, runner, actor })
    const ctx = { projectId: project.id, sessionId: "s", signal: new AbortController().signal }
    expect(yield* projects.find(member.id, project.id)).toBeDefined()
    for (const [id, input] of [
      ["vcs_start_change", { topic: "plate" }], ["vcs_commit", { message: "Save" }],
      ["vcs_restore_paths", { paths: ["drawings/d.json"], from: "main" }],
      ["vcs_open_pull_request", { title: "Plate" }], ["actions_run", { trigger: "manual" }]
    ] as const) {
      const result = yield* Effect.promise(() => tools.find((tool) => tool.id === id)!.execute(input, ctx))
      expect(JSON.parse(result)).toEqual({ ok: false, error: "You do not have permission to write this project" })
    }
    expect(triggers).toBe(0)
    expect(db.select().from(schema.gitRefTable).all()).toEqual([])
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
    const status = vcsToolSpecs({ vcs, projects, runner, actor }).find((tool) => tool.id === "vcs_status")!
    current = second.id
    const result = yield* Effect.promise(() => status.execute({}, { projectId: project.id, sessionId: "s", signal: new AbortController().signal }))
    expect(JSON.parse(result).ok).toBe(true)
    current = first.id
    const denied = yield* Effect.promise(() => status.execute({}, { projectId: project.id, sessionId: "s", signal: new AbortController().signal }))
    expect(JSON.parse(denied).ok).toBe(false)
  }).pipe(Effect.provide(Live), Effect.scoped))
})
