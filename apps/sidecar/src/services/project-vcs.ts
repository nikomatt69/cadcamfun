import { Database, DatabaseError, schema } from "@cadcamfun/db"
import {
  describeDiff,
  ENTITY_DIRECTORIES,
  Repository,
  snapshotToFiles,
  VcsError,
  filesToSnapshot,
  pull as pullRemote,
  push as pushRemote,
  restTransport,
  type GitHubTransport,
  type SyncResult,
  toText,
  type EntityChange,
  type LogEntry,
  type MergeResult,
  type Oid,
  type Signature,
} from "@cadcamfun/vcs"
import { and, desc, eq } from "drizzle-orm"
import { Context, Data, Effect, Layer } from "effect"
import { ProjectVcsRepo } from "../repos/project-vcs-repo.ts"

export class VcsFailure extends Data.TaggedError("VcsFailure")<{
  readonly code: "not-found" | "invalid" | "dirty" | "conflict" | "blocked" | "nothing-to-commit" | "remote"
  readonly message: string
  readonly conflicts?: ReadonlyArray<{ path: string; pointers: readonly string[] }>
}> {}

/** Builds the GitHub client of a project's remote. Replaced in tests; the token comes from the desktop's keychain per call. */
export class GitHubTransports extends Context.Service<GitHubTransports, {
  make(remote: string, token: string): GitHubTransport
}>()("cadcamfun/GitHubTransports") {
  static readonly layer = Layer.succeed(GitHubTransports, GitHubTransports.of({
    make: (remote, token) => {
      const [owner = "", repo = ""] = remote.split("/")
      return restTransport({ owner, repo, token })
    },
  }))
}

export interface Actor {
  readonly userId: string
  readonly name: string
  readonly email: string
  /** `ai` when the mobile companion or another agent acts on the user's behalf. */
  readonly kind?: "user" | "ai"
  /** The message that opened the AI turn, cited on an AI commit so history says what the work was for. */
  readonly lastPrompt?: string
}

export type PullRequestRow = typeof schema.pullRequestTable.$inferSelect
export type ReviewRow = typeof schema.pullRequestReviewTable.$inferSelect

const MAIN = "main"

const isEntityPath = (p: string): boolean => p === "project.json" || ENTITY_DIRECTORIES.some((dir) => p.startsWith(`${dir}/`))

/** An AI actor (mobile companion, agents) proposes changes on its own branches; a human merges them. */
const PROTECTED = new Set([MAIN])
const forbidAiOnProtected = (actor: Actor, branch: string, action: string): Effect.Effect<void, VcsFailure> =>
  actor.kind === "ai" && PROTECTED.has(branch)
    ? Effect.fail(new VcsFailure({ code: "blocked", message: `AI actors cannot ${action} on ${branch}; use an ai/* branch and open a pull request` }))
    : Effect.void

const toFailure = (e: unknown): VcsFailure => {
  if (e instanceof VcsError) {
    const code = e._tag === "NothingToCommit" ? "nothing-to-commit" : e._tag === "UnknownRef" || e._tag === "UnknownObject" ? "not-found" : "invalid"
    return new VcsFailure({ code, message: e.message })
  }
  return new VcsFailure({ code: "invalid", message: String(e) })
}

/** Lifts synchronous vcs calls into Effect. */
const vcs = <A>(run: () => A): Effect.Effect<A, VcsFailure> => Effect.try({ try: run, catch: toFailure })

export class ProjectVcs extends Context.Service<ProjectVcs, {
  /** Working-copy changes (database vs HEAD), as paths. Empty = clean. */
  status(projectId: string): Effect.Effect<readonly string[], VcsFailure | DatabaseError>
  commit(projectId: string, input: { message: string }, actor: Actor, extra?: Readonly<Record<string, string>>): Effect.Effect<Oid, VcsFailure | DatabaseError>
  /** History of the whole project, or only of one file (`drawings/<id>.json`…) when `path` is given. */
  log(projectId: string, rev?: string, limit?: number, path?: string): Effect.Effect<LogEntry[], VcsFailure>
  branches(projectId: string): Effect.Effect<{ current: string; branches: Record<string, Oid> }, VcsFailure>
  createBranch(projectId: string, name: string, from?: string): Effect.Effect<Oid, VcsFailure>
  /** Switches the working copy to `branch`; refuses when there are uncommitted changes. */
  checkout(projectId: string, branch: string, actor: Actor): Effect.Effect<void, VcsFailure | DatabaseError>
  diff(projectId: string, from: string | undefined, to: string): Effect.Effect<EntityChange[], VcsFailure>
  /** Restores an older revision as a new commit (history is never rewritten). */
  restore(projectId: string, rev: string, actor: Actor, paths?: readonly string[]): Effect.Effect<Oid, VcsFailure | DatabaseError>
  openPullRequest(projectId: string, input: { title: string; body?: string; head: string; base?: string }, actor: Actor): Effect.Effect<PullRequestRow, VcsFailure | DatabaseError>
  listPullRequests(projectId: string, state?: PullRequestRow["state"]): Effect.Effect<PullRequestRow[], DatabaseError>
  pullRequest(projectId: string, number: number): Effect.Effect<{ pullRequest: PullRequestRow; reviews: ReviewRow[]; changes: EntityChange[] }, VcsFailure | DatabaseError>
  review(projectId: string, number: number, input: { verdict: ReviewRow["verdict"]; body?: string; path?: string; pointer?: string }, actor: Actor): Effect.Effect<ReviewRow, VcsFailure | DatabaseError>
  mergePullRequest(projectId: string, number: number, actor: Actor): Effect.Effect<PullRequestRow, VcsFailure | DatabaseError>
  closePullRequest(projectId: string, number: number): Effect.Effect<PullRequestRow, VcsFailure | DatabaseError>
  remote(projectId: string): Effect.Effect<string | null, DatabaseError>
  /** `owner/repo` of the GitHub mirror, or null to detach. */
  setRemote(projectId: string, remote: string | null): Effect.Effect<string | null, VcsFailure | DatabaseError>
  /** Uploads the branch (default: checked out) to the mirror; fails if the mirror has commits you have not pulled. */
  push(projectId: string, token: string, branch?: string): Effect.Effect<SyncResult, VcsFailure | DatabaseError>
  /** Fetches the mirror's branch and merges it into the checked-out branch; refuses a dirty working copy. */
  pull(projectId: string, token: string, actor: Actor, branch?: string): Effect.Effect<{ kind: string; oid: string }, VcsFailure | DatabaseError>
}>()("cadcamfun/ProjectVcs") {
  static readonly layer = Layer.effect(
    ProjectVcs,
    Effect.gen(function*() {
      const { query } = yield* Database
      const store = yield* ProjectVcsRepo
      const transports = yield* GitHubTransports
      const repoOf = (projectId: string) => new Repository(store.backend(projectId))
      const sign = (a: Actor): Signature => ({ name: a.kind === "ai" ? `${a.name} (AI)` : a.name, email: a.email, time: Math.floor(Date.now() / 1000), tz: "+0000" })

      const workingFiles = (projectId: string) =>
        Effect.gen(function*() {
          const snap = yield* store.snapshot(projectId)
          if (!snap) return yield* new VcsFailure({ code: "not-found", message: "Project not found" })
          return snapshotToFiles(snap)
        })

      const status = Effect.fn("ProjectVcs.status")(function*(projectId: string) {
        const files = yield* workingFiles(projectId)
        const repo = repoOf(projectId)
        const head = repo.head()
        const tracked = head ? yield* vcs(() => repo.readFiles(repo.readCommit(head).tree)) : {}
        const changed = new Set<string>()
        for (const path of new Set([...Object.keys(files), ...Object.keys(tracked)].filter(isEntityPath))) {
          if (files[path] !== (tracked[path] === undefined ? undefined : toText(tracked[path]))) changed.add(path)
        }
        return [...changed].sort()
      })

      const requireClean = Effect.fn("ProjectVcs.requireClean")(function*(projectId: string) {
        const dirty = yield* status(projectId)
        if (dirty.length > 0) return yield* new VcsFailure({ code: "dirty", message: `Uncommitted changes in ${dirty.length} file(s); commit or discard them first` })
      })

      /** Writes the tree of the commit now at HEAD back into the database. */
      const applyHead = Effect.fn("ProjectVcs.applyHead")(function*(projectId: string, actor: Actor) {
        const repo = repoOf(projectId)
        const files = yield* vcs(() => repo.readFiles(repo.readCommit(repo.resolve("HEAD")).tree))
        yield* store.apply(projectId, filesToSnapshot(files), actor.userId)
      })

      const findPr = (projectId: string, number: number) =>
        query("vcs.pr.find", (db) => db.select().from(schema.pullRequestTable).where(and(eq(schema.pullRequestTable.projectId, projectId), eq(schema.pullRequestTable.number, number))).get()).pipe(
          Effect.flatMap((row) => (row ? Effect.succeed(row) : Effect.fail(new VcsFailure({ code: "not-found", message: `Pull request #${number} not found` })))),
        )

      /** Every history-changing action is also written to the `ActivityLog`; a failure to log never fails the action. */
      const audit = (actor: Actor, projectId: string, action: string, details: Record<string, unknown>) => {
        // An AI commit cites the message that opened the turn, so history reads as "the user asked for X".
        const citation = actor.kind === "ai" && actor.lastPrompt ? `[ai] ${actor.lastPrompt.replace(/\s+/g, " ").slice(0, 200)}` : undefined
        return store.audit(actor.userId, projectId, action, { ...details, actor: actor.kind ?? "user", ...(citation !== undefined ? { citation } : {}) }).pipe(Effect.ignore)
      }

      const remoteOf = Effect.fn("ProjectVcs.remoteOf")(function*(projectId: string) {
        const remote = yield* store.remote(projectId)
        if (!remote) return yield* new VcsFailure({ code: "invalid", message: "This project has no GitHub remote" })
        return remote
      })
      const network = <A>(run: () => Promise<A>) =>
        Effect.tryPromise({ try: run, catch: toFailure }).pipe(
          Effect.mapError((e) => (e.code === "invalid" && !/^(Remote|Unknown|No )/.test(e.message) ? new VcsFailure({ code: "remote", message: e.message }) : e)),
        )

      return ProjectVcs.of({
        remote: (projectId) => store.remote(projectId),
        setRemote: Effect.fn("ProjectVcs.setRemote")(function*(projectId, remote) {
          if (remote !== null && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(remote)) return yield* new VcsFailure({ code: "invalid", message: "Remote must look like owner/repo" })
          yield* store.setRemote(projectId, remote)
          return remote
        }),
        push: Effect.fn("ProjectVcs.push")(function*(projectId, token, branch) {
          const remote = yield* remoteOf(projectId)
          const repo = repoOf(projectId)
          return yield* network(() => pushRemote(repo, transports.make(remote, token), branch ?? repo.currentBranch()))
        }),
        pull: Effect.fn("ProjectVcs.pull")(function*(projectId, token, actor, branch) {
          const remote = yield* remoteOf(projectId)
          yield* requireClean(projectId)
          const repo = repoOf(projectId)
          const result = yield* network(() => pullRemote(repo, transports.make(remote, token), branch ?? repo.currentBranch(), sign(actor)))
          if (result.kind === "conflict") return yield* new VcsFailure({ code: "conflict", message: "Merge conflicts", conflicts: result.conflicts })
          if (result.kind !== "up-to-date") yield* applyHead(projectId, actor)
          return { kind: result.kind, oid: result.oid }
        }),
        status,
        commit: Effect.fn("ProjectVcs.commit")(function*(projectId, input, actor, extra) {
          yield* forbidAiOnProtected(actor, repoOf(projectId).currentBranch(), "commit")
          const files = yield* workingFiles(projectId)
          // Non-entity files (workflows, README…) are not in the database; they ride along from the previous commit.
          const repo = repoOf(projectId)
          const head = repo.head()
          const carried = head ? yield* vcs(() => Object.fromEntries(Object.entries(repo.readFiles(repo.readCommit(head).tree)).filter(([p]) => !isEntityPath(p)).map(([p, b]) => [p, toText(b)]))) : {}
          const oid = yield* vcs(() => repo.commit({ ...carried, ...extra, ...files }, { message: input.message, author: sign(actor) }))
          yield* audit(actor, projectId, "vcs.commit", { commit: oid, message: input.message, branch: repo.currentBranch() })
          return oid
        }),
        log: (projectId, rev = "HEAD", limit, path) => vcs(() => {
          const repo = repoOf(projectId)
          // A project nobody has committed yet has an empty history, not an unknown revision.
          if (rev === "HEAD" && repo.head() === undefined) return []
          return path ? repo.fileLog(path, rev, limit) : repo.log(rev, limit)
        }),
        branches: (projectId) => vcs(() => {
          const repo = repoOf(projectId)
          return { current: repo.currentBranch(), branches: repo.branches() }
        }),
        createBranch: (projectId, name, from) => vcs(() => repoOf(projectId).createBranch(name, from)),
        checkout: Effect.fn("ProjectVcs.checkout")(function*(projectId, branch, actor) {
          yield* requireClean(projectId)
          yield* vcs(() => repoOf(projectId).checkout(branch))
          yield* applyHead(projectId, actor)
          yield* audit(actor, projectId, "vcs.checkout", { branch })
        }),
        diff: (projectId, from, to) => vcs(() => {
          const repo = repoOf(projectId)
          return describeDiff(repo, from ? repo.resolve(from) : undefined, repo.resolve(to))
        }),
        restore: Effect.fn("ProjectVcs.restore")(function*(projectId, rev, actor, paths) {
          yield* forbidAiOnProtected(actor, repoOf(projectId).currentBranch(), "restore a revision")
          yield* requireClean(projectId)
          const oid = yield* vcs(() => (paths && paths.length > 0 ? repoOf(projectId).restorePaths(rev, paths, sign(actor)) : repoOf(projectId).revertTo(rev, sign(actor))))
          yield* applyHead(projectId, actor)
          yield* audit(actor, projectId, "vcs.restore", { rev, paths: paths ?? null, commit: oid })
          return oid
        }),
        openPullRequest: Effect.fn("ProjectVcs.openPullRequest")(function*(projectId, input, actor) {
          const base = input.base ?? MAIN
          const repo = repoOf(projectId)
          const [h, b] = yield* vcs(() => [repo.resolve(input.head), repo.resolve(base)] as const)
          if (input.head === base) return yield* new VcsFailure({ code: "invalid", message: "Head and base must differ" })
          if (repo.isAncestor(h, b)) return yield* new VcsFailure({ code: "invalid", message: "Nothing to merge: base already contains head" })
          const row = yield* query("vcs.pr.open", (db) =>
            db.transaction((tx) => {
              const last = tx.select({ n: schema.pullRequestTable.number }).from(schema.pullRequestTable).where(eq(schema.pullRequestTable.projectId, projectId)).orderBy(desc(schema.pullRequestTable.number)).limit(1).get()
              return tx.insert(schema.pullRequestTable).values({
                projectId, number: (last?.n ?? 0) + 1, title: input.title, body: input.body ?? "", head: input.head, base, authorId: actor.userId, authorKind: actor.kind ?? "user",
              }).returning().get()
            }))
          yield* audit(actor, projectId, "vcs.pull-request.open", { number: row.number, title: input.title, head: input.head, base })
          return row
        }),
        listPullRequests: (projectId, state) =>
          query("vcs.pr.list", (db) =>
            db.select().from(schema.pullRequestTable)
              .where(state ? and(eq(schema.pullRequestTable.projectId, projectId), eq(schema.pullRequestTable.state, state)) : eq(schema.pullRequestTable.projectId, projectId))
              .orderBy(desc(schema.pullRequestTable.number)).all()),
        pullRequest: Effect.fn("ProjectVcs.pullRequest")(function*(projectId, number) {
          const pr = yield* findPr(projectId, number)
          const reviews = yield* query("vcs.pr.reviews", (db) => db.select().from(schema.pullRequestReviewTable).where(eq(schema.pullRequestReviewTable.pullRequestId, pr.id)).orderBy(schema.pullRequestReviewTable.createdAt).all())
          // A merged PR is diffed through its merge commit's parents so the view stays stable after the branch moves.
          const changes = yield* vcs(() => {
            const repo = repoOf(projectId)
            if (pr.state === "merged" && pr.mergeCommit) return describeDiff(repo, repo.readCommit(pr.mergeCommit).parents[0], pr.mergeCommit)
            return describeDiff(repo, repo.mergeBase(repo.resolve(pr.base), repo.resolve(pr.head)), repo.resolve(pr.head))
          })
          return { pullRequest: pr, reviews, changes }
        }),
        review: Effect.fn("ProjectVcs.review")(function*(projectId, number, input, actor) {
          const pr = yield* findPr(projectId, number)
          if (pr.state !== "open") return yield* new VcsFailure({ code: "invalid", message: "Pull request is not open" })
          return yield* query("vcs.pr.review", (db) =>
            db.insert(schema.pullRequestReviewTable).values({ pullRequestId: pr.id, reviewerId: actor.userId, verdict: input.verdict, body: input.body ?? "", path: input.path ?? null, pointer: input.pointer ?? null }).returning().get())
        }),
        mergePullRequest: Effect.fn("ProjectVcs.mergePullRequest")(function*(projectId, number, actor) {
          const pr = yield* findPr(projectId, number)
          if (pr.state !== "open") return yield* new VcsFailure({ code: "invalid", message: "Pull request is not open" })
          const reviews = yield* query("vcs.pr.reviews", (db) => db.select().from(schema.pullRequestReviewTable).where(eq(schema.pullRequestReviewTable.pullRequestId, pr.id)).orderBy(schema.pullRequestReviewTable.createdAt).all())
          const latest = new Map<string, ReviewRow["verdict"]>()
          for (const r of reviews) if (r.verdict !== "comment") latest.set(r.reviewerId, r.verdict)
          if ([...latest.values()].includes("request-changes")) return yield* new VcsFailure({ code: "blocked", message: "A reviewer requested changes" })
          yield* forbidAiOnProtected(actor, pr.base, "merge pull requests")
          const repo = repoOf(projectId)
          const onBase = repo.currentBranch() === pr.base
          if (onBase) yield* requireClean(projectId)
          const result: MergeResult = yield* vcs(() => repo.mergeInto(pr.base, pr.head, sign(actor), `Merge pull request #${pr.number}: ${pr.title}`))
          if (result.kind === "conflict") return yield* new VcsFailure({ code: "conflict", message: "Merge conflicts", conflicts: result.conflicts })
          if (onBase) yield* applyHead(projectId, actor)
          const merged = yield* query("vcs.pr.merged", (db) =>
            db.update(schema.pullRequestTable).set({ state: "merged", mergeCommit: result.oid }).where(eq(schema.pullRequestTable.id, pr.id)).returning().get()).pipe(Effect.map((r) => r!))
          yield* audit(actor, projectId, "vcs.pull-request.merge", { number: pr.number, commit: result.oid })
          return merged
        }),
        closePullRequest: Effect.fn("ProjectVcs.closePullRequest")(function*(projectId, number) {
          const pr = yield* findPr(projectId, number)
          if (pr.state !== "open") return yield* new VcsFailure({ code: "invalid", message: "Pull request is not open" })
          return yield* query("vcs.pr.close", (db) => db.update(schema.pullRequestTable).set({ state: "closed" }).where(eq(schema.pullRequestTable.id, pr.id)).returning().get()).pipe(Effect.map((r) => r!))
        }),
      })
    }),
  )
}
