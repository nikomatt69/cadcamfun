import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export interface AuthUserRow {
  readonly id: string
  readonly email: string | null
  readonly name: string | null
  readonly emailVerified: Date | null
}

export class AuthRepo extends Context.Service<AuthRepo, {
  findByEmail(email: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
  findById(id: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
  setPassword(id: string, hash: string): Effect.Effect<void, DatabaseError>
  /** `undefined` when the user no longer exists (legacy Prisma P2025). */
  markVerified(id: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
}>()("cadcamfun/AuthRepo") {
  static readonly layer = Layer.effect(AuthRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.userTable
    const cols = { id: T.id, email: T.email, name: T.name, emailVerified: T.emailVerified }
    return AuthRepo.of({
      findByEmail: Effect.fn("AuthRepo.findByEmail")(function*(email) {
        return (yield* query("auth.findByEmail", (db) => db.select(cols).from(T).where(eq(T.email, email)).limit(1)))[0]
      }),
      findById: Effect.fn("AuthRepo.findById")(function*(id) {
        return (yield* query("auth.findById", (db) => db.select(cols).from(T).where(eq(T.id, id)).limit(1)))[0]
      }),
      setPassword: Effect.fn("AuthRepo.setPassword")(function*(id, hash) {
        yield* query("auth.setPassword", async (db) => { await db.update(T).set({ password: hash }).where(eq(T.id, id)) })
      }),
      markVerified: Effect.fn("AuthRepo.markVerified")(function*(id) {
        return (yield* query("auth.markVerified", (db) =>
          db.update(T).set({ emailVerified: new Date() }).where(eq(T.id, id)).returning(cols)))[0]
      })
    })
  }))
}
