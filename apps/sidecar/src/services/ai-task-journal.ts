/**
 * The background-task journal (AI-11 Step 9) over the key-value store: one row per task under `ai.tasks.<id>`. The
 * manager writes a task before its runner starts, the specialist's report before its session is removed and the outcome
 * before delivery; at start-up it reads them back (`BackgroundTaskManager.recover`). A row that does not decode is
 * skipped, never guessed.
 */
import type { BackgroundTask, BackgroundTaskJournal } from "@cadcamfun/ai"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { KvStore } from "./kv.ts"

export const TASK_JOURNAL_PREFIX = "ai.tasks."

const StoredTask = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  parentSessionId: Schema.String,
  prompt: Schema.String,
  description: Schema.String,
  agent: Schema.optional(Schema.String),
  edits: Schema.optional(Schema.Boolean),
  background: Schema.optional(Schema.Boolean),
  status: Schema.Literals(["queued", "running", "completed", "error", "cancelled"]),
  text: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.Number),
  startedAt: Schema.optional(Schema.Number),
  finishedAt: Schema.optional(Schema.Number),
  attempt: Schema.optional(Schema.Number),
  delivered: Schema.optional(Schema.Boolean),
  childSessionId: Schema.optional(Schema.String),
  deliveryAgent: Schema.optional(Schema.String),
  persistenceError: Schema.optional(Schema.String),
  target: Schema.optional(Schema.Struct({
    actorId: Schema.optional(Schema.String),
    drawingId: Schema.optional(Schema.String),
    revision: Schema.optional(Schema.String),
    turnId: Schema.optional(Schema.String)
  }))
})
const decode = Schema.decodeUnknownOption(StoredTask)

const LEASE_KEY = "ai.task-runtime-lease"
const LEASE_MS = 30_000
const Lease = Schema.Struct({ owner: Schema.String, expiresAt: Schema.Number })
const decodeLease = Schema.decodeUnknownOption(Lease)

/** Supplying Database enables an atomic process lease; KV-only adapters remain useful in isolated contract fixtures. */
export const kvTaskJournal = (kv: KvStore["Service"], database?: Database["Service"]): BackgroundTaskJournal => {
  const owner = crypto.randomUUID()
  const table = schema.localKeyValueTable
  type Tx = Parameters<Parameters<Database["Service"]["db"]["transaction"]>[0]>[0]
  const transaction = <A>(operation: string, run: (tx: Tx) => A): Promise<A> => {
    if (database === undefined) return Promise.reject(new Error("The task lease requires the database adapter"))
    return Effect.runPromise(database.query(`ai.tasks.${operation}`, (db) => db.transaction((tx) => ({ value: run(tx) }), { behavior: "immediate" }).value))
  }
  const currentLease = (tx: Tx) => {
    const row = tx.select({ value: table.value }).from(table).where(eq(table.key, LEASE_KEY)).get()
    if (row === undefined) return undefined
    const lease = decodeLease(row.value)
    if (lease._tag === "None") throw new Error("The AI task execution lease is invalid")
    return lease.value
  }
  const assert = (tx: Tx) => {
    const lease = currentLease(tx)
    if (lease?.owner !== owner || lease.expiresAt <= Date.now()) throw new Error("The AI task execution lease was lost; no further task effects are admitted")
  }
  const writeLease = (tx: Tx) => {
    const now = new Date()
    const value = { owner, expiresAt: now.getTime() + LEASE_MS }
    tx.insert(table).values({ key: LEASE_KEY, value, updatedAt: now })
      .onConflictDoUpdate({ target: table.key, set: { value, updatedAt: now } }).run()
  }
  return {
  write: (task) => Effect.runPromise(kv.set(`${TASK_JOURNAL_PREFIX}${task.id}`, task)).then(() => undefined),
  list: async () => (await Effect.runPromise(kv.list(TASK_JOURNAL_PREFIX))).flatMap((entry) => {
    const task = decode(entry.value)
    return task._tag === "Some" ? [task.value as BackgroundTask] : []
  }),
  remove: (id) => Effect.runPromise(kv.delete(`${TASK_JOURNAL_PREFIX}${id}`)).then(() => undefined),
  ...(database === undefined ? {} : {
    acquire: () => transaction("acquire", (tx) => {
      const lease = currentLease(tx)
      if (lease !== undefined && lease.owner !== owner && lease.expiresAt > Date.now()) throw new Error("Another AI task runtime owns the execution lease")
      writeLease(tx)
    }),
    heartbeat: () => transaction("heartbeat", (tx) => { assert(tx); writeLease(tx) }),
    assertLease: () => transaction("checkLease", assert),
    release: () => transaction("release", (tx) => {
      if (currentLease(tx)?.owner === owner) tx.delete(table).where(eq(table.key, LEASE_KEY)).run()
    }),
    write: (task: BackgroundTask) => transaction("write", (tx) => {
      assert(tx)
      const key = `${TASK_JOURNAL_PREFIX}${task.id}`
      const now = new Date()
      // Persist only decoded JSON fields; signals and trusted invocation closures never enter storage.
      const decoded = decode(task)
      if (decoded._tag === "None") throw new Error("The AI task record is invalid")
      const value = JSON.parse(JSON.stringify(decoded.value)) as typeof decoded.value
      tx.insert(table).values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: table.key, set: { value, updatedAt: now } }).run()
    }),
    remove: (id: string) => transaction("remove", (tx) => { assert(tx); tx.delete(table).where(eq(table.key, `${TASK_JOURNAL_PREFIX}${id}`)).run() })
  })
  }
}
