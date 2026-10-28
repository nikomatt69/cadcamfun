import type { ActionOutcome, MutationExecutor, MutationExecution } from "@cadcamfun/ai"
import { Database, schema, withMutationCommand } from "@cadcamfun/db"
import { and, asc, eq } from "drizzle-orm"
import { Deferred, Effect, Schema } from "effect"
import { createHash } from "node:crypto"

export interface CommandOwner {
  readonly actorId: string
  readonly projectId: string
  readonly drawingId?: string
}

class CommandExecutionError extends Schema.TaggedError<CommandExecutionError>()("CommandExecutionError", {
  message: Schema.String
}) {}

const StoredOutcome = Schema.Struct({
  kind: Schema.Literals(["succeeded", "partial", "refused", "conflict", "cancelled", "uncertain"]),
  value: Schema.Unknown,
  validated: Schema.Boolean,
  files: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.Literal("file"), mime: Schema.String, filename: Schema.String, url: Schema.String })))
})
const decodeOutcome = Schema.decodeUnknownOption(StoredOutcome)
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]))
    : value
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
const failure = (request: MutationExecution, kind: "refused" | "conflict" | "cancelled" | "uncertain", tag: string, error: string): ActionOutcome => ({
  kind, validated: true, value: { ok: false, _tag: tag, actionId: request.actionId, error, ...(kind === "conflict" ? { status: "conflict" } : {}) }
})

interface Flight { readonly digest: string; readonly outcome: Deferred.Deferred<ActionOutcome> }
const flights = new WeakMap<object, Map<string, Flight>>()
type MutationReceipt = typeof schema.aiMutationReceiptTable.$inferSelect

/** Keep the domain answer's shape: viewport consumers still receive ids/elements/operations at their original paths. */
const withEvidence = (outcome: ActionOutcome, request: MutationExecution, commandId: string, receipts: readonly MutationReceipt[], includeResults = false): ActionOutcome => {
  if (outcome.value === null || typeof outcome.value !== "object" || Array.isArray(outcome.value)) return outcome
  return { ...outcome, value: { ...outcome.value, execution: { commandId, callId: request.callId, committedSteps: receipts.map((receipt) => ({
    receiptId: receipt.id, operation: receipt.operation, resourceId: receipt.resourceId,
    previousRevision: receipt.previousRevision, revision: receipt.revision, committedAt: receipt.committedAt.toISOString(),
    ...(includeResults ? { result: receipt.result } : {})
  })) } } }
}

/**
 * Admission and final results outlive the transport. Repository mutations save receipts in their own synchronous
 * transaction. A multi-step action is not one atomic transaction: a lost final outcome is uncertain, never replayed.
 * The factory is the single Promise edge; all admission, coalescing and persistence inside it remain Effect workflows.
 */
export const makeCommandExecutor = (
  database: Database["Service"],
  admittedOwner: CommandOwner,
  authorize?: () => Promise<void>
): MutationExecutor => {
  const owner = Object.freeze({ ...admittedOwner })
  let active = flights.get(database.db)
  if (!active) { active = new Map(); flights.set(database.db, active) }
  const inFlight = active
  const T = schema.aiCommandTable
  const receiptsFor = Effect.fn("AiCommands.receipts")(function*(id: string) {
    return yield* database.query("ai.command.receipts", (db) => db.select().from(schema.aiMutationReceiptTable)
      .where(eq(schema.aiMutationReceiptTable.commandId, id)).orderBy(asc(schema.aiMutationReceiptTable.sequence)).all())
  })
  const runOwned = Effect.fn("AiCommands.runOwned")(function*(request: MutationExecution, id: string, inputDigest: string, run: () => Promise<ActionOutcome>) {
    const admission = yield* database.query("ai.command.admit", (db) => db.transaction((tx) => {
      const existing = tx.select().from(T).where(eq(T.id, id)).get()
      if (existing) return { fresh: false, row: existing }
      const row = tx.insert(T).values({
        id, actorId: owner.actorId, projectId: owner.projectId, drawingId: owner.drawingId ?? null,
        sessionId: request.sessionId ?? "", callId: request.callId ?? "", messageId: request.messageId ?? null,
        actionId: request.actionId, inputDigest, status: "running"
      }).returning().get()
      if (!row) throw new Error("Command admission did not persist")
      return { fresh: true, row }
    }))
    if (admission.row.inputDigest !== inputDigest || admission.row.actorId !== owner.actorId || admission.row.projectId !== owner.projectId || admission.row.drawingId !== (owner.drawingId ?? null)) {
      return failure(request, "conflict", "ActionCommandConflict", "This call identity already names different arguments or a different target.")
    }
    if (!admission.fresh) {
      const saved = decodeOutcome(admission.row.outcome)
      if (admission.row.status === "completed" && saved._tag === "Some") return saved.value
      const receipts = yield* receiptsFor(id)
      return withEvidence(failure(request, "uncertain", "ActionUncertain", "This command has no durable final result. Reconcile its committed steps against the current document before another command changes it; it was not replayed."), request, id, receipts, true)
    }
    const perform = Effect.gen(function*() {
      const outcome = yield* Effect.tryPromise({
        try: () => withMutationCommand({ id, ...owner, ...(request.signal ? { signal: request.signal } : {}) }, run),
        catch: (cause) => new CommandExecutionError({ message: cause instanceof Error ? cause.message : "Mutation execution failed" })
      })
      const receipts = yield* receiptsFor(id)
      const recorded = withEvidence(outcome, request, id, receipts)
      const status = outcome.kind === "uncertain" ? "uncertain" as const : "completed" as const
      yield* database.query("ai.command.finish", (db) => {
        const stored = db.update(T).set({ status, outcome: recorded, updatedAt: new Date() })
          .where(and(eq(T.id, id), eq(T.status, "running"))).run()
        if (stored.changes !== 1) throw new Error("Command ownership changed before its outcome was persisted")
      })
      return recorded
    })
    return yield* perform.pipe(Effect.catch((cause) => database.query("ai.command.uncertain", (db) => db.update(T)
      .set({ status: "uncertain", updatedAt: new Date() }).where(and(eq(T.id, id), eq(T.status, "running"))).run()).pipe(
      Effect.catch(() => Effect.void),
      Effect.as(failure(request, "uncertain", "ActionUncertain", `The mutation's final result could not be persisted. Inspect its receipts and document before proceeding. ${cause instanceof Error ? cause.message : "Storage or execution failed."}`))
    )))
  })
  const execute = Effect.fn("AiCommands.execute")(function*(request: MutationExecution, run: () => Promise<ActionOutcome>) {
    if (request.signal?.aborted) return failure(request, "cancelled", "ActionInterrupted", "Tool execution cancelled before admission.")
    if (request.projectId !== owner.projectId || !request.sessionId || !request.callId) {
      return failure(request, "refused", "ActionDenied", "A mutation needs its authenticated project, session and stable call identity.")
    }
    const authorized = yield* Effect.tryPromise({
      try: () => authorize?.() ?? Promise.resolve(),
      catch: () => new CommandExecutionError({ message: "The authenticated actor can no longer change this project." })
    }).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false)))
    if (!authorized) return failure(request, "refused", "ActionDenied", "The authenticated actor can no longer change this project.")
    const id = digest({ actorId: owner.actorId, sessionId: request.sessionId, callId: request.callId })
    const inputDigest = digest({ actionId: request.actionId, input: request.input, projectId: owner.projectId, drawingId: owner.drawingId ?? null })
    const previous = inFlight.get(id)
    if (previous) return previous.digest === inputDigest
      ? yield* Deferred.await(previous.outcome)
      : failure(request, "conflict", "ActionCommandConflict", "This call identity already names different arguments or a different target.")
    const completed = yield* Deferred.make<ActionOutcome>()
    inFlight.set(id, { digest: inputDigest, outcome: completed })
    const interrupted = failure(request, "uncertain", "ActionUncertain", "Command execution was interrupted; inspect the current document before proceeding.")
    return yield* runOwned(request, id, inputDigest, run).pipe(
      Effect.catch(() => Effect.succeed(failure(request, "refused", "ActionUnavailable", "The command could not be admitted or read durably; no new execution started."))),
      Effect.tap((outcome) => Deferred.succeed(completed, outcome)),
      Effect.ensuring(Deferred.succeed(completed, interrupted).pipe(Effect.andThen(Effect.sync(() => inFlight.delete(id)))))
    )
  })
  return (request, run) => Effect.runPromise(execute(request, run))
}
