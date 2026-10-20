import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { DatabaseError } from "@cadcamfun/db"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { COMPANION_DEVICE_HEADER } from "../services/companion-gateway.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ProjectVcs, VcsFailure, type Actor } from "../services/project-vcs.ts"
import { WorkflowRunner, type RunRow } from "../services/workflow-runner.ts"
import { LiveEvents, type LiveEvent } from "../services/live-events.ts"
import { NotificationService } from "../services/notifications.ts"
import type { NotificationType } from "@cadcamfun/db/schema"
import type { LogEntry } from "@cadcamfun/vcs"

/** The notification types this file can raise; the rest of the legacy set comes from collaboration. */
type ActivityNotificationType = Extract<NotificationType, "PR_OPENED" | "PR_MERGED" | "PR_REVIEWED" | "AI_COMMITTED" | "WORKFLOW_FAILED">

const commitRow = (c: LogEntry) => ({ oid: c.oid, parents: c.parents, message: c.message, author: { name: c.author.name, email: c.author.email, time: c.author.time } })
const iso = (d: Date) => d.toISOString()
const now = () => new Date().toISOString()
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
  const events = yield* LiveEvents
  const notifier = yield* NotificationService

  // Centralised broadcaster so every mutation triggers exactly one `events.publish` and, where
  // appropriate, one `notifier.create`. Nothing here may fail a user's request: the bus and the
  // notification row are both best-effort side channels, so the whole effect swallows errors.
  const broadcast = (projectId: string, userId: string, event: LiveEvent): Effect.Effect<void> =>
    Effect.gen(function*() {
      yield* events.publish(event)
      const history = `/projects/${projectId}/history`
      const make = (type: ActivityNotificationType, title: string, content: string) =>
        notifier.create({ type, title, content, userId, projectId, linkUrl: history }).pipe(Effect.ignore)
      switch (event.type) {
        case "pr.opened":
          yield* make("PR_OPENED", `PR #${event.number} opened`, event.title)
          break
        case "pr.merged":
          yield* make("PR_MERGED", `PR #${event.number} merged`, event.title)
          break
        case "pr.reviewed":
          yield* make("PR_REVIEWED", `PR #${event.number} reviewed`, event.verdict)
          break
        case "workflow.finished":
          // Only a failure is worth interrupting someone for; a green run shows up in Actions.
          if (event.status === "failure") yield* make("WORKFLOW_FAILED", `Workflow ${event.workflow} failed`, event.runId)
          break
        case "commit":
          // A person's own commits need no notification; the assistant's do, because a person has
          // to review them.
          if (event.authorKind === "ai") yield* make("AI_COMMITTED", `Assistant committed to ${event.branch}`, event.message)
          break
        default:
          break
      }
    }).pipe(Effect.ignore)

  /** Reading, committing, branching, opening PRs and reviewing need project access; moving shared branches needs maintainer rights. */
  const access = Effect.fn("vcs.access")(function*(projectId: string, level: "member" | "maintainer") {
    const user = yield* CurrentUser
    const found = yield* projects.find(user.id, projectId).pipe(Effect.catchTag("DatabaseError", () => Effect.fail(new InternalError({ message: "Failed to load project" }))))
    if (!found) return yield* new NotFound({ message: "Project not found or access denied" })
    if (level === "maintainer" && found.project.ownerId !== user.id && found.orgRole !== "ADMIN" && found.orgRole !== "MANAGER") {
      return yield* new Forbidden({ message: "Only the owner or an organisation admin/manager can do this" })
    }
    // Set only by the companion gateway, which replaces whatever a phone sends: the audit row names the paired device.
    const device = (yield* HttpServerRequest.HttpServerRequest).headers[COMPANION_DEVICE_HEADER]
    const actor: Actor = {
      userId: user.id, name: user.name ?? user.email ?? "User", email: user.email ?? "unknown@cadcamfun.local",
      ...(device && /^[0-9a-f]{1,64}$/.test(device) ? { via: `companion:${device}` } : {}),
    }
    return actor
  })

  const statusOf = (projectId: string) =>
    Effect.gen(function*() {
      const { current } = yield* vcs.branches(projectId)
      const log = yield* vcs.log(projectId).pipe(Effect.orElseSucceed(() => []))
      return { branch: current, head: log[0]?.oid ?? null, dirty: yield* vcs.status(projectId) }
    })

  /**
   * Announces each finished run on the live bus. `runner.trigger` is synchronous per workflow, so
   * a run is already settled when it comes back and both the `started` and the `finished` frame are
   * emitted together — which is what lets a paired phone show a run and its result without polling.
   */
  const announce = (projectId: string, userId: string, runs: ReadonlyArray<RunRow>, label: "push" | "pull-request" | "manual") =>
    Effect.forEach(runs, (run) => Effect.gen(function*() {
      yield* broadcast(projectId, userId, { type: "workflow.started", projectId, runId: run.id, workflow: run.workflow, event: label, at: now() })
      yield* broadcast(projectId, userId, {
        type: "workflow.finished", projectId, runId: run.id, workflow: run.workflow,
        // A run that never left `running` (the process was interrupted) is reported as cancelled.
        status: run.status === "success" || run.status === "failure" ? run.status : "cancelled", at: now(),
      })
    })).pipe(Effect.ignore)

  /** Like GitHub Actions on `push`: workflows stored in the pushed commit run right away. */
  const onPush = (projectId: string, userId: string, branch: string, actor: Actor) =>
    runner.trigger(projectId, branch, { type: "push", branch, changedPaths: [] }, { actor }).pipe(
      Effect.flatMap((runs) => announce(projectId, userId, runs, "push")),
      Effect.ignore,
    )

  return handlers
    .handle("status", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(statusOf(params.id)))))
    .handle("log", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.log(params.id, query.rev, query.limit, query.path).pipe(Effect.map((l) => l.map(commitRow)))))))
    .handle("commit", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        if (!payload.message.trim()) return yield* new BadRequest({ message: "Commit message is required" })
        // Besides the model, only workflow files can be written through the API (an AI or phone can edit CI, never arbitrary paths).
        const files = payload.files ?? {}
        if (Object.keys(files).some((p) => !/^\.cadcamfun\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/.test(p))) return yield* new BadRequest({ message: "Only .cadcamfun/workflows/*.yml can be committed as files" })
        const authorKind = payload.authorKind ?? "user"
        const oid = yield* wire(vcs.commit(params.id, { message: payload.message }, { ...actor, kind: authorKind }, files))
        const { current } = yield* wire(vcs.branches(params.id))
        yield* broadcast(params.id, actor.userId, { type: "commit", projectId: params.id, oid, branch: current, authorKind, message: payload.message, at: now() })
        yield* onPush(params.id, actor.userId, current, actor)
        const [entry] = yield* wire(vcs.log(params.id, oid, 1))
        return commitRow(entry!)
      }))
    .handle("branches", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.branches(params.id)))))
    .handle("createBranch", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* access(params.id, "member")
        yield* wire(vcs.createBranch(params.id, payload.name, payload.from))
        yield* events.workspaceChanged(params.id)
        return yield* wire(vcs.branches(params.id))
      }))
    .handle("checkout", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        yield* wire(vcs.checkout(params.id, payload.branch, actor))
        yield* events.workspaceChanged(params.id)
        return yield* wire(statusOf(params.id))
      }))
    .handle("restore", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        const oid = yield* wire(vcs.restore(params.id, payload.rev, actor, payload.paths))
        const [entry] = yield* wire(vcs.log(params.id, oid, 1))
        yield* broadcast(params.id, actor.userId, { type: "commit", projectId: params.id, oid, branch: payload.rev, authorKind: "user", message: `Restored ${payload.paths?.length ?? 1} file(s) from ${payload.rev.slice(0, 7)}`, at: now() })
        return commitRow(entry!)
      }))
    .handle("diff", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.diff(params.id, query.from, query.to).pipe(Effect.map((c) => c.map((x) => ({ ...x, changes: x.changes.map((p) => ({ ...p })) }))))))))
    .handle("listPullRequests", ({ params, query }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.listPullRequests(params.id, query.state).pipe(Effect.map((l) => l.map(prRow)))))))
    .handle("openPullRequest", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        if (!payload.title.trim()) return yield* new BadRequest({ message: "Pull request title is required" })
        const row = yield* wire(vcs.openPullRequest(params.id, payload, { ...actor, kind: payload.authorKind ?? "user" }))
        yield* broadcast(params.id, actor.userId, { type: "pr.opened", projectId: params.id, number: row.number, title: row.title, authorKind: payload.authorKind ?? "user", head: row.head, base: row.base, at: now() })
        yield* runner.trigger(params.id, row.head, { type: "pull-request", base: row.base }, { actor }).pipe(
          Effect.flatMap((runs) => announce(params.id, actor.userId, runs, "pull-request")),
          Effect.ignore,
        )
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
        yield* broadcast(params.id, actor.userId, { type: "pr.reviewed", projectId: params.id, number: params.number, verdict: payload.verdict, at: now() })
        return { ...r, createdAt: iso(r.createdAt) }
      }))
    .handle("mergePullRequest", ({ params }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        const row = yield* wire(vcs.mergePullRequest(params.id, params.number, actor))
        yield* broadcast(params.id, actor.userId, { type: "pr.merged", projectId: params.id, number: row.number, title: row.title, at: now() })
        yield* onPush(params.id, actor.userId, row.base, actor)
        return prRow(row)
      }))
    .handle("closePullRequest", ({ params }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        const row = yield* wire(vcs.closePullRequest(params.id, params.number))
        yield* broadcast(params.id, actor.userId, { type: "pr.closed", projectId: params.id, number: row.number, at: now() })
        return prRow(row)
      }))
    .handle("remote", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(vcs.remote(params.id).pipe(Effect.map((remote) => ({ remote })))))))
    .handle("setRemote", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* access(params.id, "maintainer")
        return { remote: yield* wire(vcs.setRemote(params.id, payload.remote)) }
      }))
    .handle("push", ({ params, payload, headers }) =>
      Effect.gen(function*() {
        yield* access(params.id, "maintainer")
        return yield* wire(vcs.push(params.id, headers["x-github-token"], payload.branch))
      }))
    .handle("pull", ({ params, payload, headers }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "maintainer")
        const result = yield* wire(vcs.pull(params.id, headers["x-github-token"], actor, payload.branch))
        yield* events.workspaceChanged(params.id)
        const { current } = yield* wire(vcs.branches(params.id))
        yield* onPush(params.id, actor.userId, current, actor)
        return result
      }))
    .handle("runs", ({ params }) => access(params.id, "member").pipe(Effect.andThen(wire(runner.runs(params.id).pipe(Effect.map((l) => l.map(runRow)))))))
    .handle("listWorkflows", ({ params, query }) =>
      access(params.id, "member").pipe(
        Effect.andThen(wire(vcs.branches(params.id).pipe(Effect.flatMap(({ current }) => runner.files(params.id, query.ref ?? current))))),
      ))
    .handle("workflow", ({ params, query }) =>
      Effect.gen(function*() {
        yield* access(params.id, "member")
        const { current } = yield* wire(vcs.branches(params.id))
        return yield* wire(runner.file(params.id, query.ref ?? current, params.name))
      }))
    .handle("dispatch", ({ params, payload }) =>
      Effect.gen(function*() {
        const actor = yield* access(params.id, "member")
        const ref = payload.ref ?? (yield* wire(vcs.branches(params.id))).current
        const runs = yield* wire(runner.trigger(params.id, ref, { type: "manual" }, { actor }))
        yield* announce(params.id, actor.userId, runs, "manual")
        return runs.map(runRow)
      }))
}))
