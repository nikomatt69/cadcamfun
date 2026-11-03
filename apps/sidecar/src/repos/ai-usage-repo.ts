import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

/** What one model has used for a user: tokens as the host reported them at the end of each turn. */
export interface ModelUsage { readonly inputTokens: number; readonly outputTokens: number; readonly turns: number }
export interface UsageTotals {
  /** Per model, `provider/model` (or `default` when the turn named none), largest consumer first. */
  readonly models: ReadonlyArray<ModelUsage & { readonly model: string }>
  readonly totals: ModelUsage
  /** When the first and the latest recorded turn finished. */
  readonly since: string | null
  readonly updatedAt: string | null
}

interface Stored { since: string; updatedAt: string; models: Record<string, ModelUsage> }
const keyOf = (userId: string) => `ai.usage.${userId}`
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0)

/**
 * The tokens a person's assistant turns have used, kept apart from any one conversation so the settings total survives a
 * reload, a project switch and a removed session (RM-10). One key-value row per user, read and rewritten in one transaction,
 * so two turns that finish together both count. Only the usage of a finished turn is recorded; what it cost is arithmetic
 * on the provider catalogue and stays with the client, which has the prices.
 */
export class AiUsageRepo extends Context.Service<AiUsageRepo, {
  record(userId: string, model: string | undefined, usage: { readonly inputTokens: number; readonly outputTokens: number }): Effect.Effect<void, DatabaseError>
  totals(userId: string): Effect.Effect<UsageTotals, DatabaseError>
}>()("cadcamfun/AiUsageRepo") {
  static readonly layer = Layer.effect(AiUsageRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.localKeyValueTable
    return AiUsageRepo.of({
      record: (userId, model, usage) => query("aiUsage.record", async (db) => {
        db.transaction((tx) => {
          const now = new Date()
          const row = tx.select().from(T).where(eq(T.key, keyOf(userId))).get()
          const stored = (row?.value ?? { since: now.toISOString(), updatedAt: now.toISOString(), models: {} }) as Stored
          const name = model !== undefined && model.trim() !== "" ? model.trim().slice(0, 120) : "default"
          const before = stored.models[name] ?? { inputTokens: 0, outputTokens: 0, turns: 0 }
          const next: Stored = {
            since: stored.since, updatedAt: now.toISOString(),
            models: { ...stored.models, [name]: { inputTokens: before.inputTokens + count(usage.inputTokens), outputTokens: before.outputTokens + count(usage.outputTokens), turns: before.turns + 1 } }
          }
          tx.insert(T).values({ key: keyOf(userId), value: next, updatedAt: now }).onConflictDoUpdate({ target: T.key, set: { value: next, updatedAt: now } }).run()
        })
      }),
      totals: (userId) => query("aiUsage.totals", async (db) => {
        const row = (await db.select().from(T).where(eq(T.key, keyOf(userId))).limit(1))[0]
        const stored = row?.value as Stored | undefined
        const models = Object.entries(stored?.models ?? {}).map(([model, u]) => ({ model, inputTokens: count(u.inputTokens), outputTokens: count(u.outputTokens), turns: count(u.turns) }))
          .sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens) || a.model.localeCompare(b.model))
        return {
          models,
          totals: models.reduce<ModelUsage>((sum, m) => ({ inputTokens: sum.inputTokens + m.inputTokens, outputTokens: sum.outputTokens + m.outputTokens, turns: sum.turns + m.turns }), { inputTokens: 0, outputTokens: 0, turns: 0 }),
          since: stored?.since ?? null, updatedAt: stored?.updatedAt ?? null
        }
      })
    })
  }))
}
