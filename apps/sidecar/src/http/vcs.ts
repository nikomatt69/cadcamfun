import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { DatabaseError } from "@cadcamfun/db"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ProjectVcs, VcsFailure, type Actor } from "../services/project-vcs.ts"
import { WorkflowRunner } from "../services/workflow-runner.ts"
import type { LogEntry } from "@cadcamfun/vcs"

const commitRow = (c: LogEntry) => ({ oid: c.oid, parents: c.parents, message: c.message, author: { name: c.author.name, email: c.author.email, time: c.author.time } })
const iso = (d: Date) => d.toISOString()
const prRow = <T extends { createdAt: Date; updatedAt: Date }>(r: T) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) })
const runRow = <T extends { events: unknown; startedAt: Date; finishedAt: Date | null }>(r: T) => ({ ...r, events: r.events as unknown[], startedAt: iso(r.startedAt), finishedAt: r.finishedAt ? iso(r.finishedAt) : null })

type WireError = BadRequest | Conflict | Forbidden | NotFound | InternalError

const toWire = (e: VcsFailure): BadRequest | Conflict | Forbidden | NotFound => {
  switch (e.code) {
    case "not-found": return new NotFound({ message: e.message })
    case "blocked": return new Forbidden({ message: e.message })
    case "dirty": return new Conflict({ message: e.message })
    case "conflict": return new Conflict({ message: `${e.message}: ${(e.conflicts ?? []).map((c) => `${c.path} ${c.pointers.join(",")}`).join("; ")}` })
    default: return new BadRequest({ message: e.message })
  }
}

/** Maps domain failures to the wire errors; storage failures are internal errors. */
const wire = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, Exclude<E, VcsFailure | DatabaseError> | WireError, R> =>
  Effect.mapError(self, (e): Exclude<E, VcsFailure | DatabaseError> | WireError =>
    e instanceof VcsFailure ? toWire(e)
    : e instanceof DatabaseError ? new InternalError({ message: "Version control storage failed" })
    : (e as Exclude<E, VcsFailure | DatabaseError>))

export const VcsHandlers = HttpApiBuilder.group(Api, "vcs", Effect.fn(function*(handlers) {
  const vcs = yield* ProjectVcs
  const runner = yield* WorkflowRunner
  const projects = yield* ProjectRepo

  /** Reading, committing, branching, opening PRs and reviewing need project access; moving shared branches needs maintainer rights. */
  const access = Effect.fn("vcs.access")(function*(projectId: string, level: "member" | "maintainer") {
    const user = yield* CurrentUser
    const found = yield* projects.find(user.id, projectId).pipe(Effect.catchTag("DatabaseError", () => Effect.fail(new InternalError({ message: "Failed to load project" }))))
    if (!found) return yield* new NotFound({ message: "Project not found or access denied" })
    if (level === "maintainer" && found.project.ownerId !== user.id && found.orgRole !== "ADMIN" && found.orgRole !== "MANAGER") {
      return yield* new Forbidden({ message: "Only the owner or an organisation admin/manager can do this" })
    }
    const actor: Actor = { userId: user.id, name: user.name ?? user.email ?? "User", email: user.email ?? "unknown@cadcamfun.local" }
    return actor
  })

  const statusOf = (projectId: string) =>
    Effect.gen(function*() {
      const { current } = yield* vcs.branches(projectId)
      const log = yield* vcs.log(projectId).pipe(Effect.orElseSucceed(() => []))
      return { branch: current, head: log[0]?.oid ?? null, dirty: yield* vcs.status(projectId) }
    })

  /** Like GitHub Actions on `push`: workflows stored in the pushed commit run right away. Failures never fail the push. */
  const onPush = (projectId: string, branch: string) =>
    runner.trigger(projectId, branch, { type: "push", branch, changedPaths: [] }).pipe(Effect.ignore)

  return handlers
    .handle("status", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(statusOf(params.id)))))
    .handle("log", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.log(params.id, query.rev, query.limit).pipe(Effect.map((l) => l.map(commitRow)))))))
    .handle("commit", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        if (!payload.message.trim()) return yield* new BadRequest({ message: "Commit message is required" })
        // Besides the model, only workflow files can be written through the API (an AI or phone can edit CI, never arbitrary paths).
        const files = payload.files ?? {}
        if (Object.keys(files).some((p) => !/^\.cadcamfun\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/.test(p))) return yield* new BadRequest({ message: "Only .cadcamfun/workflows/*.yml can be committed as files" })
        const oid = yield* wire(vcs.commit(params.id, { message: payload.message }, { ...actor, kind: payload.authorKind ?? "user" }, files))
        const { current } = yield* wire(vcs.branches(params.id))
        yield* onPush(params.id, current)
        const [entry] = yield* wire(vcs.log(params.id, oid, 1))
        return commitRow(entry!)
      }))
    .handle("branches", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.branches(params.id)))))
    .handle("createBranch", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* access(params.id, "member")
        yield* wire(vcs.createBranch(params.id, payload.name, payload.from))
        return yield* wire(vcs.branches(params.id))
      }))
    .handle("checkout", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        yield* wire(vcs.checkout(params.id, payload.branch, actor))
        return yield* wire(statusOf(params.id))
      }))
    .handle("restore", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        const oid = yield* wire(vcs.restore(params.id, payload.rev, actor))
        const [entry] = yield* wire(vcs.log(params.id, oid, 1))
        return commitRow(entry!)
      }))
    .handle("diff", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.diff(params.id, query.from, query.to).pipe(Effect.map((c) => c.map((x) => ({ ...x, changes: x.changes.map((p) => ({ ...p })) }))))))))
    .handle("listPullRequests", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.listPullRequests(params.id, query.state).pipe(Effect.map((l) => l.map(prRow)))))))
    .handle("openPullRequest", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        if (!payload.title.trim()) return yield* new BadRequest({ message: "Pull request title is required" })
        const row = yield* wire(vcs.openPullRequest(params.id, payload, { ...actor, kind: payload.authorKind ?? "user" }))
        yield* runner.trigger(params.id, row.head, { type: "pull-request", base: row.base }).pipe(Effect.ignore)
        return prRow(row)
      }))
    .handle("pullRequest", ({ params }) =>
      access(params.id, "member").pipe(Effect.andThen(wire(vcs.pullRequest(params.id, params.number).pipe(
        Effect.map((d) => ({ pullRequest: prRow(d.pullRequest), reviews: d.reviews.map((r) => ({ ...r, createdAt: iso(r.createdAt) })), changes: d.changes })),
      )))))
    .handle("review", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        const r = yield* wire(vcs.review(params.id, params.number, payload, actor))
        return { ...r, createdAt: iso(r.createdAt) }
      }))
    .handle("mergePullRequest", ({ params }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        const row = yield* wire(vcs.mergePullRequest(params.id, params.number, actor))
        yield* onPush(params.id, row.base)
        return prRow(row)
      }))
    .handle("closePullRequest", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.closePullRequest(params.id, params.number).pipe(Effect.map(prRow))))))
    .handle("runs", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(runner.runs(params.id).pipe(Effect.map((l) => l.map(runRow)))))))
    .handle("dispatch", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* access(params.id, "member")
        const ref = payload.ref ?? (yield* wire(vcs.branches(params.id))).current
        return (yield* wire(runner.trigger(params.id, ref, { type: "manual" }))).map(runRow)
      }))
}))
