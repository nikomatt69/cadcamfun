import { Database, commitMutation, type DatabaseError } from "@cadcamfun/db"
import { Repository, filesToSnapshot, snapshotToFiles, toText } from "@cadcamfun/vcs"
import { Effect } from "effect"
import { ProjectVcsRepo, projectSnapshotRevision, readProjectSnapshot, sqliteBackend } from "../repos/project-vcs-repo.ts"
import type { Actor } from "./project-vcs.ts"

const PREFIX = "refs/checkpoints/"
const META = ".cadcamfun/checkpoint.json"

export interface EngineeringCheckpoint {
  readonly commit: string
  readonly revision: string
  readonly label: string
  readonly createdAt: string
  readonly projectId: string
  readonly actorId: string
  readonly sessionId?: string
  readonly taskId?: string
}

const metadata = (text: string | Uint8Array | undefined, commit: string): EngineeringCheckpoint | undefined => {
  if (text === undefined) return undefined
  try {
    const value: unknown = JSON.parse(typeof text === "string" ? text : toText(text))
    if (!value || typeof value !== "object") return undefined
    const row = value as Record<string, unknown>
    if (["revision", "label", "createdAt", "projectId", "actorId"].some((key) => typeof row[key] !== "string")) return undefined
    return { commit, revision: String(row.revision), label: String(row.label), createdAt: String(row.createdAt), projectId: String(row.projectId), actorId: String(row.actorId), ...(typeof row.sessionId === "string" ? { sessionId: row.sessionId } : {}), ...(typeof row.taskId === "string" ? { taskId: row.taskId } : {}) }
  } catch { return undefined }
}

/** Snapshots and refs share existing VCS storage; the checked-out branch never moves. */
export const makeEngineeringCheckpoints = (database: Database["Service"], store: ProjectVcsRepo["Service"]) => ({
  list: (projectId: string) => database.query("ai.checkpoints.list", (db) => {
    const backend = sqliteBackend(db, projectId)
    const repo = new Repository(backend)
    const current = readProjectSnapshot(db, projectId)
    const checkpoints = Object.values(backend.listRefs(PREFIX)).flatMap((commit) => {
      const info = metadata(repo.readFiles(repo.readCommit(commit).tree)[META], commit)
      return info?.projectId === projectId ? [info] : []
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
    return { revision: current ? projectSnapshotRevision(current) : "", checkpoints }
  }),
  create: (projectId: string, input: { readonly label: string; readonly sessionId?: string; readonly taskId?: string }, actor: Actor) => database.query("ai.checkpoints.create", (db) => commitMutation(db, "vcs.checkpoint", (tx) => {
    const snapshot = readProjectSnapshot(tx, projectId)
    if (!snapshot) throw new Error("Project not found")
    const info = { revision: projectSnapshotRevision(snapshot), label: input.label, projectId, actorId: actor.userId, createdAt: new Date().toISOString(), ...(input.sessionId ? { sessionId: input.sessionId } : {}), ...(input.taskId ? { taskId: input.taskId } : {}) }
    const backend = sqliteBackend(tx, projectId)
    const ref = `${PREFIX}${crypto.randomUUID()}`
    const head = backend.getRef(backend.getHead())
    if (head) backend.setRef(ref, head)
    const repo = new Repository({ ...backend, getHead: () => ref })
    const signature = { name: actor.name, email: actor.email, time: Math.floor(Date.now() / 1000), tz: "+0000" }
    const commit = repo.commit({ ...snapshotToFiles(snapshot), [META]: JSON.stringify(info) }, { message: `Checkpoint: ${input.label}`, author: signature, allowEmpty: true })
    return { result: { ...info, commit }, resourceId: projectId, revision: info.revision }
  })),
  restore: Effect.fn("EngineeringCheckpoints.restore")(function*(projectId: string, input: { readonly commit: string; readonly expectedRevision: string }, actor: Actor) {
    const source = yield* database.query("ai.checkpoints.source", (db) => {
      const backend = sqliteBackend(db, projectId)
      if (!Object.values(backend.listRefs(PREFIX)).includes(input.commit)) throw new Error("Checkpoint not found in this project")
      const repo = new Repository(backend)
      const files = repo.readFiles(repo.readCommit(input.commit).tree)
      const info = metadata(files[META], input.commit)
      if (!info || info.projectId !== projectId) throw new Error("Invalid checkpoint")
      return filesToSnapshot(files)
    })
    const applied = yield* store.apply(projectId, source, actor.userId, { expectedRevision: input.expectedRevision, checkpointId: input.commit }).pipe(
      Effect.as(true),
      Effect.catchTag("DatabaseError", (error: DatabaseError) => String(error.cause).includes("CheckpointConflict:") ? Effect.succeed(false) : Effect.fail(error))
    )
    if (!applied) return { ok: false as const, status: "stale", error: "The project changed. Read its current checkpoint revision before restoring." }
    const current = yield* store.snapshot(projectId)
    return { ok: true as const, commit: input.commit, revision: current ? projectSnapshotRevision(current) : "", verification: "invalidated" as const }
  })
})
