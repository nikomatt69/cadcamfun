import { expect, test } from "bun:test"
import { Effect } from "effect"
import { PasswordHashError, hashPassword, signInPasswordMatches, verifyPassword } from "../src/services/passwords.ts"

test("a hashed password verifies; a wrong one does not", async () => {
  const hash = await Effect.runPromise(hashPassword("correct horse"))
  expect(hash.startsWith("$2")).toBe(true)
  expect(await Effect.runPromise(verifyPassword("correct horse", hash))).toBe(true)
  expect(await Effect.runPromise(verifyPassword("wrong", hash))).toBe(false)
})

test("an unreadable stored hash is a typed failure, and never signs anyone in", async () => {
  const failure = await Effect.runPromise(Effect.flip(verifyPassword("anything", "not-a-hash")))
  expect(failure).toBeInstanceOf(PasswordHashError)
  expect(await Effect.runPromise(signInPasswordMatches("anything", "not-a-hash", "user-1"))).toBe(false)
})
