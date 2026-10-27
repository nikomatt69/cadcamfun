/**
 * Password hashing for the local accounts (bcrypt, cost 12, as the legacy database stored them). Bun's hasher is async and can
 * reject (an unreadable stored hash, a hasher failure); that is a typed `PasswordHashError` here, never a defect, so every
 * route answers it with its own error shape.
 */
import { Data, Effect } from "effect"

export class PasswordHashError extends Data.TaggedError("PasswordHashError")<{ readonly message: string; readonly cause: unknown }> {}

export const hashPassword = (password: string): Effect.Effect<string, PasswordHashError> =>
  Effect.tryPromise({
    try: () => Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 }),
    catch: (cause) => new PasswordHashError({ message: "The password could not be hashed.", cause })
  })

export const verifyPassword = (password: string, hash: string): Effect.Effect<boolean, PasswordHashError> =>
  Effect.tryPromise({
    try: () => Bun.password.verify(password, hash),
    catch: (cause) => new PasswordHashError({ message: "The stored password hash could not be read.", cause })
  })

/**
 * Sign-in check: a stored hash that cannot be read never signs anyone in (it counts as a wrong password), but it is logged,
 * because it means a damaged account row rather than a typo.
 */
export const signInPasswordMatches = (password: string, hash: string, userId: string): Effect.Effect<boolean> =>
  verifyPassword(password, hash).pipe(
    Effect.catchTag("PasswordHashError", (error) =>
      Effect.logWarning("Sign-in refused: the stored password hash is unreadable", error.cause).pipe(
        Effect.annotateLogs({ userId }),
        Effect.as(false)
      ))
  )
