import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { Context, Effect, Layer } from "effect"

/** Activity log writes (legacy `lib/activityTracking.logActivity`). */
export class AnalyticsRepo extends Context.Service<AnalyticsRepo, {
  logActivity(input: {
    userId: string; itemId: string; itemType: string; action: string; details: unknown
  }): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/AnalyticsRepo") {
  static readonly layer = Layer.effect(AnalyticsRepo, Effect.gen(function*() {
    const { query } = yield* Database
    return AnalyticsRepo.of({
      logActivity: Effect.fn("AnalyticsRepo.logActivity")(function*(input) {
        yield* query("analytics.logActivity", async (db) => {
          await db.insert(schema.activityLogTable).values({
            userId: input.userId, itemId: input.itemId, itemType: input.itemType, action: input.action,
            details: input.details === undefined ? null : input.details
          })
        })
      })
    })
  }))
}
