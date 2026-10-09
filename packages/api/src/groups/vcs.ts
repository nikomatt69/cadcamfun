import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound } from "../errors.ts"

/**
 * Git-style version control, pull requests and workflow runs for a project (spec 13). Every project is a
 * git-compatible repository; these routes are what the desktop History/PR panels and the iOS companion call.
 */
const NullStr = Schema.NullOr(Schema.String)
const Oid = Schema.String

export const VcsAuthor = Schema.Struct({ name: Schema.String, email: Schema.String, time: Schema.Number })
export const VcsCommit = Schema.Struct({ oid: Oid, parents: Schema.Array(Oid), message: Schema.String, author: VcsAuthor })
export type VcsCommit = typeof VcsCommit.Type

export const VcsStatus = Schema.Struct({ branch: Schema.String, head: Schema.NullOr(Oid), dirty: Schema.Array(Schema.String) })
export type VcsStatus = typeof VcsStatus.Type
export const VcsBranches = Schema.Struct({ current: Schema.String, branches: Schema.Record(Schema.String, Oid) })
export type VcsBranches = typeof VcsBranches.Type

export const PropertyChange = Schema.Struct({ pointer: Schema.String, before: Schema.optional(Schema.Unknown), after: Schema.optional(Schema.Unknown) })
export const EntityChange = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(["drawings", "components", "toolpaths", "materials", "tools", "machine-configs", "costs", "project", "other"]),
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  status: Schema.Literals(["added", "modified", "deleted"]),
  changes: Schema.Array(PropertyChange),
})
export type EntityChange = typeof EntityChange.Type

export const PullRequestRow = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  body: Schema.String,
  head: Schema.String,
  base: Schema.String,
  state: Schema.Literals(["open", "merged", "closed"]),
  authorId: Schema.String,
  authorKind: Schema.Literals(["user", "ai"]),
  mergeCommit: NullStr,
  remoteNumber: Schema.NullOr(Schema.Number),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type PullRequestRow = typeof PullRequestRow.Type

export const ReviewRow = Schema.Struct({
  id: Schema.String,
  pullRequestId: Schema.String,
  reviewerId: Schema.String,
  verdict: Schema.Literals(["comment", "approve", "request-changes"]),
  body: Schema.String,
  path: NullStr,
  pointer: NullStr,
  createdAt: Schema.String,
})

export type ReviewRow = typeof ReviewRow.Type

export const PullRequestDetail = Schema.Struct({ pullRequest: PullRequestRow, reviews: Schema.Array(ReviewRow), changes: Schema.Array(EntityChange) })

export const WorkflowRunRow = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  workflow: Schema.String,
  event: Schema.Literals(["push", "pull-request", "manual"]),
  ref: Schema.String,
  sha: Schema.String,
  status: Schema.Literals(["queued", "running", "success", "failure"]),
  events: Schema.Array(Schema.Unknown),
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
})
export type WorkflowRunRow = typeof WorkflowRunRow.Type

const project = { id: Schema.String }
const errors = [BadRequest, Forbidden, NotFound, Conflict, InternalError] as const
const Created = <A extends Schema.Top>(a: A) => a.pipe(Schema.annotate({ httpApiStatus: 201 }))

/**
 * One workflow file as it is stored in the repository. `content` is the YAML itself; `name` is the
 * file name without the directory, so it round-trips straight back into a commit.
 */
export const WorkflowFile = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  content: Schema.String,
  /** Why the file does not parse, when it does not. An invalid workflow is still worth showing. */
  problem: Schema.optional(Schema.String),
})
export type WorkflowFile = typeof WorkflowFile.Type

export class VcsGroup extends HttpApiGroup.make("vcs")
  .add(
    HttpApiEndpoint.get("status", "/api/projects/:id/vcs/status", { params: project, success: VcsStatus, error: errors }),
    HttpApiEndpoint.get("log", "/api/projects/:id/vcs/log", { params: project, query: { rev: Schema.optional(Schema.String), limit: Schema.optional(Schema.NumberFromString), path: Schema.optional(Schema.String) }, success: Schema.Array(VcsCommit), error: errors }),
    HttpApiEndpoint.post("commit", "/api/projects/:id/vcs/commit", { params: project, payload: Schema.Struct({ message: Schema.String, authorKind: Schema.optional(Schema.Literals(["user", "ai"])), files: Schema.optional(Schema.Record(Schema.String, Schema.String)) }), success: Created(VcsCommit), error: errors }),
    HttpApiEndpoint.get("branches", "/api/projects/:id/vcs/branches", { params: project, success: VcsBranches, error: errors }),
    HttpApiEndpoint.post("createBranch", "/api/projects/:id/vcs/branches", { params: project, payload: Schema.Struct({ name: Schema.String, from: Schema.optional(Schema.String) }), success: Created(VcsBranches), error: errors }),
    HttpApiEndpoint.post("checkout", "/api/projects/:id/vcs/checkout", { params: project, payload: Schema.Struct({ branch: Schema.String }), success: VcsStatus, error: errors }),
    HttpApiEndpoint.post("restore", "/api/projects/:id/vcs/restore", { params: project, payload: Schema.Struct({ rev: Schema.String, paths: Schema.optional(Schema.Array(Schema.String)) }), success: VcsCommit, error: errors }),
    HttpApiEndpoint.get("diff", "/api/projects/:id/vcs/diff", { params: project, query: { from: Schema.optional(Schema.String), to: Schema.String }, success: Schema.Array(EntityChange), error: errors }),
    HttpApiEndpoint.get("listPullRequests", "/api/projects/:id/pulls", { params: project, query: { state: Schema.optional(Schema.Literals(["open", "merged", "closed"])) }, success: Schema.Array(PullRequestRow), error: errors }),
    HttpApiEndpoint.post("openPullRequest", "/api/projects/:id/pulls", {
      params: project,
      payload: Schema.Struct({ title: Schema.String, body: Schema.optional(Schema.String), head: Schema.String, base: Schema.optional(Schema.String), authorKind: Schema.optional(Schema.Literals(["user", "ai"])) }),
      success: Created(PullRequestRow),
      error: errors,
    }),
    HttpApiEndpoint.get("pullRequest", "/api/projects/:id/pulls/:number", { params: { id: Schema.String, number: Schema.NumberFromString }, success: PullRequestDetail, error: errors }),
    HttpApiEndpoint.post("review", "/api/projects/:id/pulls/:number/reviews", {
      params: { id: Schema.String, number: Schema.NumberFromString },
      payload: Schema.Struct({ verdict: Schema.Literals(["comment", "approve", "request-changes"]), body: Schema.optional(Schema.String), path: Schema.optional(Schema.String), pointer: Schema.optional(Schema.String) }),
      success: Created(ReviewRow),
      error: errors,
    }),
    HttpApiEndpoint.post("mergePullRequest", "/api/projects/:id/pulls/:number/merge", { params: { id: Schema.String, number: Schema.NumberFromString }, success: PullRequestRow, error: errors }),
    HttpApiEndpoint.post("closePullRequest", "/api/projects/:id/pulls/:number/close", { params: { id: Schema.String, number: Schema.NumberFromString }, success: PullRequestRow, error: errors }),
    HttpApiEndpoint.get("remote", "/api/projects/:id/vcs/remote", { params: project, success: Schema.Struct({ remote: NullStr }), error: errors }),
    HttpApiEndpoint.put("setRemote", "/api/projects/:id/vcs/remote", { params: project, payload: Schema.Struct({ remote: NullStr }), success: Schema.Struct({ remote: NullStr }), error: errors }),
    // The token is the user's GitHub token, read from the desktop keychain by the UI for each call; it is never stored by the sidecar.
    HttpApiEndpoint.post("push", "/api/projects/:id/vcs/push", { params: project, headers: { "x-github-token": Schema.String }, payload: Schema.Struct({ branch: Schema.optional(Schema.String) }), success: Schema.Struct({ oid: Oid, objects: Schema.Number }), error: errors }),
    HttpApiEndpoint.post("pull", "/api/projects/:id/vcs/pull", { params: project, headers: { "x-github-token": Schema.String }, payload: Schema.Struct({ branch: Schema.optional(Schema.String) }), success: Schema.Struct({ kind: Schema.String, oid: Oid }), error: errors }),
    HttpApiEndpoint.get("runs", "/api/projects/:id/actions/runs", { params: project, success: Schema.Array(WorkflowRunRow), error: errors }),
    HttpApiEndpoint.post("dispatch", "/api/projects/:id/actions/dispatch", { params: project, payload: Schema.Struct({ ref: Schema.optional(Schema.String) }), success: Schema.Array(WorkflowRunRow), error: errors }),
    // The workflow files of a ref, so CI can be read and authored in the app instead of only by
    // hand-committing YAML. Editing one is a commit like any other, so it goes through `commit`.
    HttpApiEndpoint.get("listWorkflows", "/api/projects/:id/actions/workflows", {
      params: project,
      query: { ref: Schema.optional(Schema.String) },
      success: Schema.Array(WorkflowFile),
      error: errors,
    }),
    HttpApiEndpoint.get("workflow", "/api/projects/:id/actions/workflows/:name", {
      params: { id: Schema.String, name: Schema.String },
      query: { ref: Schema.optional(Schema.String) },
      success: WorkflowFile,
      error: errors,
    }),
  )
{}
