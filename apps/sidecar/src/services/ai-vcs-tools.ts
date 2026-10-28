import type { ActionContribution, ToolContext } from "@cadcamfun/ai"
import { Effect } from "effect"
import type { ProjectRepo } from "../repos/project-repo.ts"
import type { Actor, ProjectVcs } from "./project-vcs.ts"
import type { WorkflowRunner } from "./workflow-runner.ts"
import type { makeEngineeringCheckpoints } from "./ai-checkpoints.ts"

export interface VcsToolDeps {
  readonly vcs: ProjectVcs["Service"]
  readonly runner: WorkflowRunner["Service"]
  readonly projects: ProjectRepo["Service"]
  /** The human the assistant acts for; every write is attributed to them as an AI actor. */
  readonly actor: Actor
  readonly checkpoints?: ReturnType<typeof makeEngineeringCheckpoints>
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "change"

const failureMessage = (e: unknown): string => e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e)

/**
 * The implementations of the version-control actions (`vcs.*` and `vcs_edit.*` in the catalogue). The catalogue owns their
 * ids, effects and validation; this module supplies only what needs the repositories. Every write is attributed to the
 * acting human as an AI actor. The assistant edits and commits on the checked-out branch, `main` included; an `ai/*`
 * branch and a pull request are there when the user wants a reviewable change, and only a person merges one.
 */
export const vcsContributions = (deps: VcsToolDeps): Readonly<Record<string, ActionContribution>> => {
  const { vcs, runner } = deps
  /** `projectId` is whatever the UI last opened; only a real, accessible project is accepted. */
  const project = (projectId: string, actor: Actor, write: boolean) =>
    deps.projects.find(actor.userId, projectId).pipe(
      Effect.flatMap((found) => {
        if (!found) return Effect.fail(new Error("No such project: open a project first"))
        if (write && found.project.ownerId !== actor.userId && found.orgRole !== "ADMIN" && found.orgRole !== "MANAGER") {
          return Effect.fail(new Error("You do not have permission to write this project"))
        }
        return Effect.succeed(found.project.id)
      })
    )
  /**
   * One Promise crossing: the Effect runs here, with the call's signal, and a failure carries its message to the model.
   */
  const contribute = <I, A>(write: boolean, body: (projectId: string, input: I, actor: Actor, context: ToolContext) => Effect.Effect<A, unknown>): ActionContribution =>
    (async (input: I, context: ToolContext) => {
      const actor: Actor = Object.freeze({ ...deps.actor, kind: "ai" })
      return Effect.runPromise(
        project(context.projectId, actor, write).pipe(
          Effect.flatMap((projectId) => body(projectId, input, actor, context)),
          Effect.catch((error) => Effect.fail(new Error(failureMessage(error))))
        ),
        context.signal ? { signal: context.signal } : undefined
      )
    }) as ActionContribution

  return {
    "vcs.checkpoints": contribute(false, (id) => deps.checkpoints ? deps.checkpoints.list(id) : Effect.fail(new Error("Engineering checkpoints are unavailable"))),
    "vcs_edit.checkpoint": contribute(true, (id, input: { label: string; taskId?: string }, actor, context) => deps.checkpoints
      ? deps.checkpoints.create(id, { ...input, ...(context.sessionId ? { sessionId: context.sessionId } : {}) }, actor)
      : Effect.fail(new Error("Engineering checkpoints are unavailable"))),
    "vcs_edit.restore_checkpoint": contribute(true, (id, input: { commit: string; expectedRevision: string; confirm: boolean }, actor) => input.confirm !== true
      ? Effect.fail(new Error("An explicit restore request and native approval are required"))
      : deps.checkpoints ? deps.checkpoints.restore(id, input, actor) : Effect.fail(new Error("Engineering checkpoints are unavailable"))),
    "vcs.status": contribute(false, (id) =>
      Effect.gen(function*() {
        const { current, branches } = yield* vcs.branches(id)
        return { branch: current, dirty: yield* vcs.status(id), branches: Object.keys(branches), openPullRequests: (yield* vcs.listPullRequests(id, "open")).map((p) => ({ number: p.number, title: p.title, head: p.head })) }
      })),
    "vcs.diff": contribute(false, (id, input: { from?: string; to: string }) =>
      vcs.diff(id, input.from ?? "main", input.to).pipe(Effect.map((changes) => changes.map((c) => ({ path: c.path, name: c.name, status: c.status, changes: c.changes.slice(0, 20) }))))),
    "vcs.list_pull_requests": contribute(false, (id, input: { state: "open" | "merged" | "closed" }) =>
      Effect.gen(function*() {
        const list = yield* vcs.listPullRequests(id, input.state)
        return yield* Effect.forEach(list, (p) => vcs.pullRequest(id, p.number).pipe(Effect.map((d) => ({ number: p.number, title: p.title, head: p.head, authorKind: p.authorKind, reviews: d.reviews.map((r) => ({ verdict: r.verdict, body: r.body })) }))))
      })),
    "vcs_edit.start_change": contribute(true, (id, input: { topic: string }, actor) =>
      Effect.gen(function*() {
        // Legacy projects without history need `main` before an optional branch can be created.
        yield* vcs.initialize(id, actor)
        const name = `ai/${slug(input.topic)}`
        yield* vcs.createBranch(id, name, "main").pipe(Effect.catchIf((e) => e instanceof Error && /already exists/.test(e.message), () => Effect.void))
        yield* vcs.checkout(id, name, actor)
        return { branch: name }
      })),
    "vcs_edit.commit": contribute(true, (id, input: { message: string }, actor) =>
      vcs.commit(id, { message: input.message }, actor).pipe(Effect.map((oid) => ({ commit: oid })))),
    "vcs_edit.restore": contribute(true, (id, input: { paths: string[]; from: string }, actor) =>
      Effect.gen(function*() {
        const oid = yield* vcs.restore(id, input.from, actor, input.paths)
        const { current } = yield* vcs.branches(id)
        return { commit: oid, branch: current, paths: input.paths }
      })),
    "vcs_edit.open_pull_request": contribute(true, (id, input: { title: string; body: string }, actor) =>
      Effect.gen(function*() {
        const { current } = yield* vcs.branches(id)
        const pr = yield* vcs.openPullRequest(id, { title: input.title, body: input.body, head: current }, actor)
        yield* runner.trigger(id, current, { type: "pull-request", base: pr.base }, { actor }).pipe(Effect.ignore)
        return { number: pr.number, head: pr.head, base: pr.base }
      })),
    "vcs_edit.run_workflows": contribute(true, (id, input: { trigger: "manual" | "pull-request" | "push" }, actor) =>
      Effect.gen(function*() {
        const { current } = yield* vcs.branches(id)
        const event = input.trigger === "manual" ? { type: "manual" as const } : input.trigger === "push" ? { type: "push" as const, branch: current, changedPaths: [] as string[] } : { type: "pull-request" as const, base: "main" }
        return (yield* runner.trigger(id, current, event, { actor })).map((r) => ({ workflow: r.workflow, status: r.status }))
      }))
  }
}
