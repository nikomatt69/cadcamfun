import { AsyncLocalStorage } from "node:async_hooks"
import { eq } from "drizzle-orm"
import type { Db } from "./index.ts"
import { aiCommandTable, aiMutationReceiptTable } from "./schema.ts"

export type MutationTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export interface MutationCommand {
  readonly id: string
  readonly actorId: string
  readonly projectId: string
  readonly drawingId?: string
  readonly signal?: AbortSignal
}

interface ActiveCommand {
  readonly command: MutationCommand
  sequence: number
}

const activeCommand = new AsyncLocalStorage<ActiveCommand>()

/** Lets an existing single-statement repository keep its original path outside governed AI execution. */
export const hasMutationCommand = (): boolean => activeCommand.getStore() !== undefined

/** The Promise edge owns the command; synchronous repository commits consume this immutable context. */
export const withMutationCommand = <A>(command: MutationCommand, run: () => Promise<A>): Promise<A> =>
  activeCommand.run({ command: Object.freeze({ ...command }), sequence: 0 }, run)

export interface MutationEvidence<A> {
  readonly resourceId?: string
  readonly previousRevision?: string
  readonly revision?: string
  readonly result: A
  /** A failed compare-and-swap is an answer, but it committed no domain mutation. */
  readonly changed?: boolean
}

/**
 * The domain mutation and its step receipt are one synchronous transaction. A multi-step action is deliberately not
 * represented as a single atomic commit: its admitted command stays uncertain if the process dies between steps.
 */
export const commitMutation = <A>(
  db: Db,
  operation: string,
  run: (tx: MutationTransaction, recording: boolean) => MutationEvidence<A>
): A => db.transaction((tx) => {
  const scope = activeCommand.getStore()
  if (scope?.command.signal?.aborted) throw new Error("Mutation command was cancelled before commit")
  if (scope) {
    const stored = tx.select().from(aiCommandTable).where(eq(aiCommandTable.id, scope.command.id)).get()
    if (!stored || stored.status !== "running" || stored.actorId !== scope.command.actorId || stored.projectId !== scope.command.projectId || stored.drawingId !== (scope.command.drawingId ?? null)) {
      throw new Error("Mutation command no longer owns this commit")
    }
  }
  const evidence = run(tx, scope !== undefined)
  if (evidence.result !== null && typeof evidence.result === "object" && "then" in evidence.result && typeof evidence.result.then === "function") {
    throw new Error("Mutation transactions must return synchronous results")
  }
  if (scope?.command.signal?.aborted) throw new Error("Mutation command was cancelled before commit")
  if (scope && evidence.changed !== false) {
    const sequence = ++scope.sequence
    tx.insert(aiMutationReceiptTable).values({
      id: `${scope.command.id}:${sequence}`,
      commandId: scope.command.id,
      sequence,
      operation,
      resourceId: evidence.resourceId ?? null,
      previousRevision: evidence.previousRevision ?? null,
      revision: evidence.revision ?? null,
      result: evidence.result ?? null,
      committedAt: new Date()
    }).run()
  }
  return { result: evidence.result }
}).result
