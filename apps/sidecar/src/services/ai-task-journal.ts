/**
 * The background-task journal (AI-11 Step 9) over the key-value store: one row per task under `ai.tasks.<id>`. The
 * manager writes a task before its runner starts, the specialist's report before its session is removed and the outcome
 * before delivery; at start-up it reads them back (`BackgroundTaskManager.recover`). A row that does not decode is
 * skipped, never guessed.
 */
import type { BackgroundTask, BackgroundTaskJournal } from "@cadcamfun/ai"
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
  delivered: Schema.optional(Schema.Boolean)
})
const decode = Schema.decodeUnknownOption(StoredTask)

export const kvTaskJournal = (kv: KvStore["Service"]): BackgroundTaskJournal => ({
  write: (task) => Effect.runPromise(kv.set(`${TASK_JOURNAL_PREFIX}${task.id}`, task)).then(() => undefined),
  list: async () => (await Effect.runPromise(kv.list(TASK_JOURNAL_PREFIX))).flatMap((entry) => {
    const task = decode(entry.value)
    return task._tag === "Some" ? [task.value as BackgroundTask] : []
  }),
  remove: (id) => Effect.runPromise(kv.delete(`${TASK_JOURNAL_PREFIX}${id}`)).then(() => undefined)
})
