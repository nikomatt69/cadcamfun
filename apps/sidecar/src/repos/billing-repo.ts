import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, eq, lte } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export type SubscriptionRow = typeof schema.subscriptionTable.$inferSelect
export const PLANS = ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const
export const TRIAL_DAYS = 14

export class BillingRepo extends Context.Service<BillingRepo, {
  find(userId: string): Effect.Effect<SubscriptionRow | undefined, DatabaseError>
  /** Creates the free plan row the first time a subscription is read (legacy upsert). */
  ensureFree(userId: string): Effect.Effect<SubscriptionRow, DatabaseError>
  setPlan(userId: string, plan: string, status: string): Effect.Effect<void, DatabaseError>
  startTrial(userId: string, plan: string, days: number): Effect.Effect<void, DatabaseError>
  expireTrial(userId: string): Effect.Effect<void, DatabaseError>
  cancel(userId: string): Effect.Effect<boolean, DatabaseError>
  updateFromStripe(match: { subscriptionId?: string; userId?: string }, data: Partial<SubscriptionRow>): Effect.Effect<boolean, DatabaseError>
  updateExpiredTrials(): Effect.Effect<number, DatabaseError>
}>()("cadcamfun/BillingRepo") {
  static readonly layer = Layer.effect(BillingRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.subscriptionTable
    const find = (db: Parameters<Parameters<typeof query>[1]>[0], userId: string) =>
      db.select().from(T).where(eq(T.id, userId)).limit(1).then((r) => r[0])
    return BillingRepo.of({
      find: (userId) => query("billing.find", (db) => find(db, userId)),
      ensureFree: (userId) => query("billing.ensureFree", async (db) => {
        const existing = await find(db, userId)
        if (existing) return existing
        const [row] = await db.insert(T).values({ id: userId, referenceId: userId, plan: "FREE", status: "active" }).returning()
        return row!
      }),
      setPlan: (userId, plan, status) => query("billing.setPlan", async (db) => {
        const existing = await find(db, userId)
        if (existing) await db.update(T).set({ plan, status }).where(eq(T.id, userId))
        else await db.insert(T).values({ id: userId, referenceId: userId, plan, status })
      }),
      startTrial: (userId, plan, days) => query("billing.startTrial", async (db) => {
        const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        const values = { plan, status: "trialing", trialStart: new Date(), trialEnd: trialEndsAt, trialEndsAt }
        const existing = await find(db, userId)
        if (existing) await db.update(T).set(values).where(eq(T.id, userId))
        else await db.insert(T).values({ id: userId, referenceId: userId, ...values })
      }),
      expireTrial: (userId) => query("billing.expireTrial", async (db) => {
        await db.update(T).set({ plan: "FREE", status: "active", trialEndsAt: null }).where(eq(T.id, userId))
      }),
      cancel: (userId) => query("billing.cancel", async (db) =>
        (await db.update(T).set({ plan: "FREE", status: "canceled", cancelAtPeriodEnd: false, stripeSubscriptionId: null }).where(eq(T.id, userId)).returning({ id: T.id })).length > 0),
      updateFromStripe: (match, data) => query("billing.updateFromStripe", async (db) => {
        const where = match.subscriptionId ? eq(T.stripeSubscriptionId, match.subscriptionId) : match.userId ? eq(T.id, match.userId) : undefined
        if (!where) return false
        return (await db.update(T).set(data).where(where).returning({ id: T.id })).length > 0
      }),
      updateExpiredTrials: (() => query("billing.updateExpiredTrials", async (db) =>
        (await db.update(T).set({ status: "expired", plan: "FREE", trialEndsAt: null, lsSubscriptionId: null, lsVariantId: null, lsCurrentPeriodEnd: null })
          .where(and(eq(T.status, "trialing"), lte(T.trialEndsAt, new Date()))).returning({ id: T.id })).length))
    })
  }))
}
