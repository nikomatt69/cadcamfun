import { type CloudAsset, type CloudProjectStatus, type CloudProjectSummary, type CloudTransfer } from "@cadcamfun/api"
import { Database, DatabaseError, schema, type Db, type MutationTransaction } from "@cadcamfun/db"
import { canonicalJson, exportBranch, filesToSnapshot, importObjects, portableEntity, Repository, snapshotToFiles, toText, type ProjectSnapshot } from "@cadcamfun/vcs"
import { and, eq, inArray, ne, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { applyProjectSnapshot, projectSnapshotRevision, readProjectSnapshot, sqliteBackend } from "./project-vcs-repo.ts"
import { ASSET_MANIFEST, CloudSyncError, metadataOf, modelFiles, sameModel, verifyCloudTransfer, type AssetMetadata } from "../services/cloud-transfer.ts"
import type { Actor } from "../services/project-vcs.ts"

const StateSchema = Schema.Struct({
  workspaceId: Schema.NullOr(Schema.String), remoteHead: Schema.NullOr(Schema.String), stageHead: Schema.NullOr(Schema.String),
  stageBranch: Schema.NullOr(Schema.String), stageAssets: Schema.Array(Schema.Struct({
    id: Schema.String, fileName: Schema.String, key: Schema.String, contentType: Schema.String,
    objectId: Schema.String, objectType: Schema.String, size: Schema.Number, sha256: Schema.String,
  })),
  state: Schema.Literals(["local", "pending", "downloaded", "applied", "conflict"]), deliveryHead: Schema.NullOr(Schema.String),
})
type State = typeof StateSchema.Type
const EMPTY: State = { workspaceId: null, remoteHead: null, stageHead: null, stageBranch: null, stageAssets: [], state: "local", deliveryHead: null }
const keyOf = (id: string) => `cloud:project:${id}`
const stateOf = (db: Pick<Db, "select">, id: string): State => {
  const value = db.select().from(schema.localKeyValueTable).where(eq(schema.localKeyValueTable.key, keyOf(id))).get()?.value
  return value === undefined ? { ...EMPTY } : Schema.decodeUnknownSync(StateSchema)(value)
}
const setState = (db: Pick<Db, "insert">, id: string, state: State): void => {
  db.insert(schema.localKeyValueTable).values({ key: keyOf(id), value: state }).onConflictDoUpdate({ target: schema.localKeyValueTable.key, set: { value: state, updatedAt: new Date() } }).run()
}
const requireOwner = (db: Pick<Db, "select">, id: string, userId: string) => {
  const project = db.select().from(schema.projectTable).where(and(eq(schema.projectTable.id, id), eq(schema.projectTable.ownerId, userId))).get()
  if (!project) throw new CloudSyncError({ code: "not-found", message: "Project not found or access denied" })
  return project
}
const isDirty = (db: Pick<Db, "select" | "insert" | "update" | "delete">, id: string): boolean => {
  const snapshot = readProjectSnapshot(db, id)
  const repo = new Repository(sqliteBackend(db, id))
  const head = repo.head()
  return !snapshot || !head || !sameModel(snapshot, filesToSnapshot(repo.readFiles(repo.readCommit(head).tree)))
}
const statusOf = (db: Pick<Db, "select" | "insert" | "update" | "delete">, id: string): CloudProjectStatus => {
  const state = stateOf(db, id)
  return { projectId: id, localHead: new Repository(sqliteBackend(db, id)).head() ?? null, remoteHead: state.remoteHead ?? state.deliveryHead, state: state.state, dirty: isDirty(db, id) }
}
const assertIdle = (db: Pick<Db, "select">, id: string): void => {
  if (db.select({ id: schema.aiCommandTable.id }).from(schema.aiCommandTable).where(and(eq(schema.aiCommandTable.projectId, id), eq(schema.aiCommandTable.status, "running"))).get()) {
    throw new CloudSyncError({ code: "dirty", message: "The assistant is changing this project. Stop it before applying a cloud version." })
  }
}

/** Project data and its Git ref are deliberately changed in the same SQLite transaction. */
const applyInTransaction = (tx: MutationTransaction, id: string, userId: string, transfer: CloudTransfer, expectedHead: string | null, allowClone: boolean): void => {
  const verified = verifyCloudTransfer(transfer, id)
  const existing = tx.select().from(schema.projectTable).where(eq(schema.projectTable.id, id)).get()
  if (existing && existing.ownerId !== userId) throw new CloudSyncError({ code: "not-found", message: "Project not found or access denied" })
  if (!existing && !allowClone) throw new CloudSyncError({ code: "not-found", message: "Project not found" })
  if (!existing) tx.insert(schema.projectTable).values({ id, name: String(verified.snapshot.project.name), description: typeof verified.snapshot.project.description === "string" ? verified.snapshot.project.description : null, ownerId: userId, isPublic: verified.snapshot.project.isPublic === true }).run()
  const backend = sqliteBackend(tx, id)
  const repo = new Repository(backend)
  const current = repo.head() ?? null
  if (current === transfer.head) return
  if (current !== expectedHead) throw new CloudSyncError({ code: "conflict", message: "The project changed while transferring. Fetch again before applying." })
  if (existing && isDirty(tx, id)) throw new CloudSyncError({ code: "dirty", message: "Commit or preserve local changes before applying a cloud version." })
  assertIdle(tx, id)
  importObjects(backend, transfer)
  if (current && !repo.isAncestor(current, transfer.head)) throw new CloudSyncError({ code: "conflict", message: "Local and cloud histories diverged. Both versions are preserved; merge them before applying." })
  const baseline = current ? filesToSnapshot(repo.readFiles(repo.readCommit(current).tree)) : undefined
  const groups = [
    { table: schema.materialTable, entities: verified.snapshot.materials ?? [], field: schema.toolpathTable.materialId, previous: baseline?.materials ?? [] },
    { table: schema.toolTable, entities: verified.snapshot.tools ?? [], field: schema.toolpathTable.toolId, previous: baseline?.tools ?? [] },
    { table: schema.machineConfigTable, entities: verified.snapshot.machineConfigs ?? [], field: schema.toolpathTable.machineConfigId, previous: baseline?.machineConfigs ?? [] },
  ]
  for (const group of groups) for (const incoming of group.entities) {
    const row = tx.select().from(group.table).where(eq(group.table.id, incoming.id)).get()
    if (!row) continue
    if (row.ownerId !== null && row.ownerId !== userId) throw new CloudSyncError({ code: "conflict", message: `Library item ${incoming.id} belongs to another account.` })
    if (canonicalJson(portableEntity(row)) === canonicalJson(portableEntity(incoming))) continue
    const previous = group.previous.find((item) => item.id === incoming.id)
    const shared = tx.select({ id: schema.toolpathTable.id }).from(schema.toolpathTable).where(and(eq(group.field, incoming.id), ne(schema.toolpathTable.projectId, id))).get()
    if (!previous || shared || canonicalJson(portableEntity(row)) !== canonicalJson(portableEntity(previous))) throw new CloudSyncError({ code: "conflict", message: `Library item ${incoming.id} has independent local changes or is shared by another project. Reconcile it before applying.` })
  }
  for (const [table, entities] of [[schema.drawingTable, verified.snapshot.drawings], [schema.componentTable, verified.snapshot.components], [schema.toolpathTable, verified.snapshot.toolpaths]] as const) {
    for (const entity of entities) {
      const taken = tx.select({ projectId: table.projectId }).from(table).where(eq(table.id, entity.id)).get()
      if (taken && taken.projectId !== id) throw new CloudSyncError({ code: "conflict", message: `Entity ${entity.id} already belongs to another project.` })
    }
  }
  const portable = filesToSnapshot(snapshotToFiles(verified.snapshot))
  applyProjectSnapshot(tx, id, portable, userId)
  const objectIds = [id, ...verified.snapshot.drawings.map((e) => e.id), ...verified.snapshot.components.map((e) => e.id), ...verified.snapshot.toolpaths.map((e) => e.id)]
  const previousObjectIds = baseline ? [id, ...baseline.drawings.map((e) => e.id), ...baseline.components.map((e) => e.id), ...baseline.toolpaths.map((e) => e.id)] : []
  const assetIds = new Set(transfer.assets.map((a) => a.id))
  for (const row of tx.select().from(schema.fileUploadTable).where(and(eq(schema.fileUploadTable.ownerId, userId), inArray(schema.fileUploadTable.objectId, [...new Set([...objectIds, ...previousObjectIds])]))).all()) {
    if (!assetIds.has(row.id)) tx.delete(schema.fileUploadTable).where(eq(schema.fileUploadTable.id, row.id)).run()
  }
  for (const asset of transfer.assets) {
    const old = tx.select().from(schema.fileUploadTable).where(eq(schema.fileUploadTable.id, asset.id)).get()
    if (old && (old.ownerId !== userId || !old.objectId || !objectIds.includes(old.objectId))) throw new CloudSyncError({ code: "conflict", message: "An uploaded file identifier belongs to another project" })
    const values = { id: asset.id, fileName: asset.fileName, s3Key: asset.key, s3Bucket: "local", s3ContentType: asset.contentType, s3Size: asset.size, objectId: asset.objectId, objectType: asset.objectType, ownerId: userId, organizationId: null }
    tx.insert(schema.fileUploadTable).values(values).onConflictDoUpdate({ target: schema.fileUploadTable.id, set: values }).run()
  }
  const applied = readProjectSnapshot(tx, id)
  if (!applied || !sameModel(applied, verified.snapshot)) throw new CloudSyncError({ code: "conflict", message: "The imported project cannot be represented without changing its content. Nothing was applied." })
  // HEAD keeps its local symbolic branch, while the immutable cloud commit is shared byte-for-byte.
  backend.setRef(backend.getHead(), transfer.head)
}

export interface ProjectCapture {
  readonly snapshot: ProjectSnapshot
  readonly revision: string
  readonly uploads: ReadonlyArray<typeof schema.fileUploadTable.$inferSelect>
}

export class CloudProjectRepo extends Context.Service<CloudProjectRepo, {
  status(projectId: string, userId: string): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  list(userId: string): Effect.Effect<readonly CloudProjectSummary[], CloudSyncError | DatabaseError>
  capture(projectId: string, userId: string): Effect.Effect<ProjectCapture, CloudSyncError | DatabaseError>
  commit(projectId: string, actor: Actor, revision: string, assets: readonly AssetMetadata[], message: string, pending: boolean): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  export(projectId: string, userId: string): Effect.Effect<Omit<CloudTransfer, "assets"> & { readonly assets: readonly AssetMetadata[] }, CloudSyncError | DatabaseError>
  stage(projectId: string, userId: string, workspaceId: string, transfer: CloudTransfer): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  staged(projectId: string, userId: string, workspaceId: string): Effect.Effect<Omit<CloudTransfer, "assets"> & { readonly assets: readonly AssetMetadata[] }, CloudSyncError | DatabaseError>
  apply(projectId: string, userId: string, workspaceId: string, transfer: CloudTransfer, expectedHead: string | null): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  accept(projectId: string, userId: string, transfer: CloudTransfer, expectedHead: string | null, clone?: boolean): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  markRemote(projectId: string, userId: string, workspaceId: string, head: string, state: "downloaded" | "applied"): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  receipt(projectId: string, userId: string, deviceId: string, head: string, state: "downloaded" | "applied"): Effect.Effect<CloudProjectStatus, CloudSyncError | DatabaseError>
  authorizeImport(projectId: string, userId: string): Effect.Effect<void, CloudSyncError | DatabaseError>
}>()("cadcamfun/CloudProjectRepo") {
  static readonly layer = Layer.effect(CloudProjectRepo, Effect.gen(function*() {
    const database = yield* Database
    const run = <A>(operation: string, fn: (db: Db) => A) => database.query(operation, fn).pipe(Effect.mapError((error) => error.cause instanceof CloudSyncError ? error.cause : error))
    const status = (id: string, userId: string) => run("cloud.status", (db) => { requireOwner(db, id, userId); return statusOf(db, id) })
    const exportAt = (db: Db, id: string, head: string, branch: string) => {
      const repo = new Repository(sqliteBackend(db, id))
      const transfer = exportBranch(repo, head)
      const files = repo.readFiles(repo.readCommit(head).tree)
      const raw = files[ASSET_MANIFEST]
      const metadata = raw ? Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String, fileName: Schema.String, key: Schema.String, contentType: Schema.String, objectId: Schema.String, objectType: Schema.String, size: Schema.Number, sha256: Schema.String })))(JSON.parse(toText(raw))) : []
      return { ...transfer, version: 1 as const, projectId: id, branch, assets: metadata }
    }
    return CloudProjectRepo.of({
      status,
      authorizeImport: (id, userId) => run("cloud.authorizeImport", (db) => {
        const existing = db.select().from(schema.projectTable).where(eq(schema.projectTable.id, id)).get()
        if (existing && existing.ownerId !== userId) throw new CloudSyncError({ code: "not-found", message: "Project not found or access denied" })
      }),
      list: (userId) => run("cloud.list", (db) => db.select().from(schema.projectTable).where(eq(schema.projectTable.ownerId, userId)).all().map((p) => ({ id: p.id, name: p.name, description: p.description, head: new Repository(sqliteBackend(db, p.id)).head() ?? null, state: stateOf(db, p.id).state, updatedAt: p.updatedAt.toISOString() }))),
      capture: (id, userId) => run("cloud.capture", (db) => {
        requireOwner(db, id, userId)
        const snapshot = readProjectSnapshot(db, id)
        if (!snapshot) throw new CloudSyncError({ code: "not-found", message: "Project not found" })
        const ids = [id, ...snapshot.drawings.map((e) => e.id), ...snapshot.components.map((e) => e.id), ...snapshot.toolpaths.map((e) => e.id)]
        return { snapshot, revision: projectSnapshotRevision(snapshot), uploads: db.select().from(schema.fileUploadTable).where(and(eq(schema.fileUploadTable.ownerId, userId), inArray(schema.fileUploadTable.objectId, ids))).all() }
      }),
      commit: (id, actor, revision, assets, message, pending) => run("cloud.commit", (db) => db.transaction((tx) => {
        requireOwner(tx, id, actor.userId)
        assertIdle(tx, id)
        const snapshot = readProjectSnapshot(tx, id)
        if (!snapshot || projectSnapshotRevision(snapshot) !== revision) throw new CloudSyncError({ code: "conflict", message: "The project changed while preparing the transfer. Retry after saving." })
        const repo = new Repository(sqliteBackend(tx, id))
        const head = repo.head()
        const previous = head ? repo.readFiles(repo.readCommit(head).tree) : {}
        const currentModel = modelFiles(snapshot)
        const files: Record<string, string> = { ...Object.fromEntries(Object.entries(previous).filter(([path]) => !Object.hasOwn(currentModel, path)).map(([path, value]) => [path, toText(value)])), ...currentModel, [ASSET_MANIFEST]: canonicalJson([...assets].sort((a, b) => a.id.localeCompare(b.id))) }
        // Deleted domain files must not be carried along as extra files.
        for (const path of Object.keys(files)) if (/^(drawings|components|toolpaths|materials|tools|machine-configs|costs)\//u.test(path) && !Object.hasOwn(currentModel, path)) delete files[path]
        const unchanged = head && canonicalJson(Object.fromEntries(Object.entries(previous).map(([path, value]) => [path, toText(value)]))) === canonicalJson(files)
        const oid = unchanged ? head : repo.commit(files, { message, author: { name: actor.name, email: actor.email, time: Math.floor(Date.now() / 1000), tz: "+0000" } })
        const state = stateOf(tx, id)
        if (pending) setState(tx, id, { ...state, deliveryHead: oid, state: "pending" })
        return statusOf(tx, id)
      })),
      export: (id, userId) => run("cloud.export", (db) => {
        requireOwner(db, id, userId)
        const repo = new Repository(sqliteBackend(db, id))
        const head = repo.head()
        if (!head) throw new CloudSyncError({ code: "not-found", message: "Commit the project before transferring it" })
        return exportAt(db, id, head, repo.currentBranch())
      }),
      stage: (id, userId, workspaceId, transfer) => run("cloud.stage", (db) => db.transaction((tx) => {
        requireOwner(tx, id, userId)
        verifyCloudTransfer(transfer, id)
        importObjects(sqliteBackend(tx, id), transfer)
        const alreadyApplied = new Repository(sqliteBackend(tx, id)).head() === transfer.head && !isDirty(tx, id)
        setState(tx, id, { ...stateOf(tx, id), workspaceId, remoteHead: transfer.head, stageHead: transfer.head, stageBranch: transfer.branch, stageAssets: transfer.assets.map(metadataOf), state: alreadyApplied ? "applied" : "downloaded" })
        return statusOf(tx, id)
      })),
      staged: (id, userId, workspaceId) => run("cloud.staged", (db) => {
        requireOwner(db, id, userId)
        const state = stateOf(db, id)
        if (state.workspaceId !== workspaceId || !state.stageHead || !state.stageBranch) throw new CloudSyncError({ code: "not-found", message: "Fetch a cloud version before applying it" })
        return { ...exportAt(db, id, state.stageHead, state.stageBranch), assets: state.stageAssets }
      }),
      apply: (id, userId, workspaceId, transfer, expectedHead) => run("cloud.apply", (db) => db.transaction((tx) => {
        requireOwner(tx, id, userId)
        const state = stateOf(tx, id)
        if (state.workspaceId !== workspaceId || state.stageHead !== transfer.head) throw new CloudSyncError({ code: "conflict", message: "The staged cloud version changed. Review the latest download." })
        applyInTransaction(tx, id, userId, transfer, expectedHead, false)
        setState(tx, id, { ...state, remoteHead: transfer.head, state: "applied" })
        return statusOf(tx, id)
      })),
      accept: (id, userId, transfer, expectedHead, clone = false) => run("cloud.accept", (db) => db.transaction((tx) => {
        applyInTransaction(tx, id, userId, transfer, expectedHead, clone)
        setState(tx, id, { ...stateOf(tx, id), remoteHead: transfer.head, state: "applied" })
        return statusOf(tx, id)
      })),
      markRemote: (id, userId, workspaceId, head, state) => run("cloud.markRemote", (db) => {
        requireOwner(db, id, userId)
        setState(db, id, { ...stateOf(db, id), workspaceId, remoteHead: head, state })
        return statusOf(db, id)
      }),
      receipt: (id, userId, deviceId, head, state) => run("cloud.receipt", (db) => db.transaction((tx) => {
        requireOwner(tx, id, userId)
        const current = stateOf(tx, id)
        const repo = new Repository(sqliteBackend(tx, id))
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(deviceId) || !/^[0-9a-f]{40}$/u.test(head) || !repo.backend.hasObject(head)) throw new CloudSyncError({ code: "invalid", message: "Invalid delivery receipt" })
        const key = `cloud:receipt:${id}:${deviceId}`
        const previous = tx.select().from(schema.localKeyValueTable).where(eq(schema.localKeyValueTable.key, key)).get()?.value
        const alreadyApplied = previous && typeof previous === "object" && "head" in previous && previous.head === head && "state" in previous && previous.state === "applied"
        const value = { head, state: alreadyApplied ? "applied" : state, at: new Date().toISOString() }
        tx.insert(schema.localKeyValueTable).values({ key, value }).onConflictDoUpdate({ target: schema.localKeyValueTable.key, set: { value, updatedAt: new Date() } }).run()
        if (head === current.deliveryHead && (current.state !== "applied" || state === "applied")) setState(tx, id, { ...current, remoteHead: head, state: alreadyApplied ? "applied" : state })
        return statusOf(tx, id)
      })),
    })
  }))
}
