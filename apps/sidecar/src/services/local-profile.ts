import { SessionUser } from "@cadcamfun/api"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

const LOCAL_EMAIL = "local@cadcamfun.local"

/** The single local identity of the desktop app (replaces login in v6.0). */
export class LocalProfile extends Context.Service<LocalProfile, { readonly user: SessionUser }>()("cadcamfun/LocalProfile") {
  static readonly layer = Layer.effect(
    LocalProfile,
    Effect.gen(function*() {
      const { query } = yield* Database
      const existing = yield* query("localProfile.find", (db) =>
        db.select().from(schema.userTable).where(eq(schema.userTable.email, LOCAL_EMAIL)).limit(1))
      const row = existing[0] ?? (yield* query("localProfile.create", (db) =>
        db.insert(schema.userTable).values({ email: LOCAL_EMAIL, name: "Local user" }).returning()))[0]!
      return LocalProfile.of({ user: new SessionUser({ id: row.id, email: row.email, name: row.name }) })
    })
  )
}
