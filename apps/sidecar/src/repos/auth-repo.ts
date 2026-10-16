import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export interface AuthUserRow {
  readonly id: string
  readonly email: string | null
  readonly name: string | null
  readonly emailVerified: Date | null
}

export class AuthRepo extends Context.Service<AuthRepo, {
  identityUser(issuer: string, subject: string, email: string): Effect.Effect<AuthUserRow, DatabaseError>
  findByEmail(email: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
  findById(id: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
  /** Sign-in lookup: the stored password hash comes along. */
  findForSignin(email: string): Effect.Effect<(AuthUserRow & { password: string | null; createdAt: Date; updatedAt: Date }) | undefined, DatabaseError>
  /** `undefined` when the e-mail is already registered. */
  createUser(input: { email: string; name: string; passwordHash: string }): Effect.Effect<(AuthUserRow & { createdAt: Date }) | undefined, DatabaseError>
  profile(id: string): Effect.Effect<(AuthUserRow & { createdAt: Date; updatedAt: Date }) | undefined, DatabaseError>
  setPassword(id: string, hash: string): Effect.Effect<void, DatabaseError>
  /** `undefined` when the user no longer exists (legacy Prisma P2025). */
  markVerified(id: string): Effect.Effect<AuthUserRow | undefined, DatabaseError>
}>()("cadcamfun/AuthRepo") {
  static readonly layer = Layer.effect(AuthRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.userTable
    const cols = { id: T.id, email: T.email, name: T.name, emailVerified: T.emailVerified }
    return AuthRepo.of({
      identityUser: Effect.fn("AuthRepo.identityUser")(function*(issuer, subject, email) {
        return yield* query("auth.identityUser", (db) => db.transaction((tx) => {
          const A = schema.accountTable
          const link = tx.select({ userId: A.userId }).from(A).where(and(eq(A.providerId, issuer), eq(A.accountId, subject))).get()
          if (link) {
            const user = tx.select(cols).from(T).where(eq(T.id, link.userId)).get()
            if (!user) throw new Error("Identity account has no local user")
            return user
          }
          // Email alone never proves ownership of an existing installation account.
          const emailTaken = tx.select({ id: T.id }).from(T).where(eq(T.email, email)).get()
          const user = tx.insert(T).values({ email: emailTaken ? null : email, name: email, emailVerified: new Date() }).returning(cols).get()
          tx.insert(A).values({ userId: user.id, providerId: issuer, accountId: subject }).run()
          return user
        }))
      }),
      findByEmail: Effect.fn("AuthRepo.findByEmail")(function*(email) {
        return (yield* query("auth.findByEmail", (db) => db.select(cols).from(T).where(eq(T.email, email)).limit(1)))[0]
      }),
      findById: Effect.fn("AuthRepo.findById")(function*(id) {
        return (yield* query("auth.findById", (db) => db.select(cols).from(T).where(eq(T.id, id)).limit(1)))[0]
      }),
      findForSignin: Effect.fn("AuthRepo.findForSignin")(function*(email) {
        return (yield* query("auth.findForSignin", (db) => db.select({ ...cols, password: T.password, createdAt: T.createdAt, updatedAt: T.updatedAt })
          .from(T).where(eq(T.email, email)).limit(1)))[0]
      }),
      createUser: Effect.fn("AuthRepo.createUser")(function*(input) {
        return yield* query("auth.createUser", async (db) => {
          const [existing] = await db.select({ id: T.id }).from(T).where(eq(T.email, input.email)).limit(1)
          if (existing) return undefined
          const [row] = await db.insert(T).values({ email: input.email, name: input.name, password: input.passwordHash })
            .returning({ ...cols, createdAt: T.createdAt })
          return row
        })
      }),
      profile: Effect.fn("AuthRepo.profile")(function*(id) {
        return (yield* query("auth.profile", (db) => db.select({ ...cols, createdAt: T.createdAt, updatedAt: T.updatedAt }).from(T).where(eq(T.id, id)).limit(1)))[0]
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
