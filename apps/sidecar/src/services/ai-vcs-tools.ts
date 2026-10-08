import type { HostToolSpec } from "@cadcamfun/ai"
import { Effect } from "effect"
import { z } from "zod"
import type { ProjectRepo } from "../repos/project-repo.ts"
import type { Actor, ProjectVcs } from "./project-vcs.ts"
import type { WorkflowRunner } from "./workflow-runner.ts"

export interface VcsToolDeps {
  readonly vcs: ProjectVcs["Service"]
  readonly runner: WorkflowRunner["Service"]
  readonly projects: ProjectRepo["Service"]
  /** The human the assistant acts for; every write is attributed to them as an AI actor. */
  readonly actor: Actor
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "change"

/**
 * Git-style tools of the assistant, the other half of the mobile companion: the model edits the drawing with the
 * `cad_*` / `cam_*` tools, then records the work on its own `ai/*` branch and opens a pull request. It can never write
 * to `main` or merge (`ProjectVcs` refuses AI actors there), so a person always reviews on desktop or phone.
 */
export const vcsToolSpecs = (deps: VcsToolDeps): ReadonlyArray<HostToolSpec> => {
  const actor: Actor = { ...deps.actor, kind: "ai" }
  const run = <A>(self: Effect.Effect<A, unknown>): Promise<string> =>
    Effect.runPromise(
      self.pipe(
        Effect.map((value) => JSON.stringify({ ok: true, value })),
        Effect.catch((e) => Effect.succeed(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e) }))),
      ),
    )
  /** `projectId` is whatever the UI last opened; only a real, accessible project is accepted. */
  const project = (projectId: string) =>
    deps.projects.find(deps.actor.userId, projectId).pipe(
      Effect.flatMap((found) => (found ? Effect.succeed(found.project.id) : Effect.fail(new Error("No such project: open a project first")))),
    )
  const tool = <S extends z.ZodType>(id: string, description: string, parameters: S, execute: (projectId: string, input: z.infer<S>) => Effect.Effect<unknown, unknown>): HostToolSpec => ({
    id,
    description,
    parameters,
    execute: (input, ctx) => run(project(ctx.projectId).pipe(Effect.flatMap((id) => execute(id, parameters.parse(input) as z.infer<S>)))),
  })
  const { vcs, runner } = deps

  return [
    tool("vcs_status", "Version-control state of the project: checked-out branch, uncommitted files, branches and open pull requests. Call before changing anything.", z.object({}), (id) =>
      Effect.gen(function*() {
        const { current, branches } = yield* vcs.branches(id)
        return { branch: current, dirty: yield* vcs.status(id), branches: Object.keys(branches), openPullRequests: (yield* vcs.listPullRequests(id, "open")).map((p) => ({ number: p.number, title: p.title, head: p.head })) }
      })),
    tool("vcs_start_change", "Start a reviewable change: creates an `ai/<topic>` branch from main and checks it out. Do this BEFORE editing with cad_*/cam_* tools. Fails if the user has uncommitted changes.", z.object({ topic: z.string().min(1).max(80) }), (id, { topic }) =>
      Effect.gen(function*() {
        const name = `ai/${slug(topic)}`
        yield* vcs.createBranch(id, name, "main").pipe(Effect.catchIf((e) => e instanceof Error && /already exists/.test(e.message), () => Effect.void))
        yield* vcs.checkout(id, name, actor)
        return { branch: name }
      })),
    tool("vcs_commit", "Record the current edits as a commit on the checked-out ai/* branch. Use a short imperative message that says what changed and why. Cannot commit on main.", z.object({ message: z.string().min(1).max(200) }), (id, { message }) =>
      vcs.commit(id, { message }, actor).pipe(Effect.map((oid) => ({ commit: oid })))),
    tool("vcs_diff", "Entity-level changes between two revisions (branch, tag or commit id). `from` defaults to main.", z.object({ from: z.string().optional(), to: z.string().default("HEAD") }), (id, { from, to }) =>
      vcs.diff(id, from ?? "main", to).pipe(Effect.map((changes) => changes.map((c) => ({ path: c.path, name: c.name, status: c.status, changes: c.changes.slice(0, 20) }))))),
    tool("vcs_open_pull_request", "Open a pull request from the checked-out ai/* branch into main so a person can review and merge it. Describe the change and anything to double-check.", z.object({ title: z.string().min(1).max(120), body: z.string().max(4000).default("") }), (id, { title, body }) =>
      Effect.gen(function*() {
        const { current } = yield* vcs.branches(id)
        const pr = yield* vcs.openPullRequest(id, { title, body, head: current }, actor)
        yield* runner.trigger(id, current, { type: "pull-request", base: pr.base }).pipe(Effect.ignore)
        return { number: pr.number, head: pr.head, base: pr.base }
      })),
    tool("vcs_list_pull_requests", "Pull requests of the project (default: open ones), with review verdicts.", z.object({ state: z.enum(["open", "merged", "closed"]).default("open") }), (id, { state }) =>
      Effect.gen(function*() {
        const list = yield* vcs.listPullRequests(id, state)
        return yield* Effect.forEach(list, (p) => vcs.pullRequest(id, p.number).pipe(Effect.map((d) => ({ number: p.number, title: p.title, head: p.head, authorKind: p.authorKind, reviews: d.reviews.map((r) => ({ verdict: r.verdict, body: r.body })) }))))
      })),
    tool("actions_run", "Run the project's workflows (.cadcamfun/workflows/*.yml) that allow manual runs on the checked-out branch and report their status.", z.object({}), (id) =>
      Effect.gen(function*() {
        const { current } = yield* vcs.branches(id)
        return (yield* runner.trigger(id, current, { type: "manual" })).map((r) => ({ workflow: r.workflow, status: r.status }))
      })),
  ]
}
