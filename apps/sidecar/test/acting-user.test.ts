import { expect, test } from "bun:test"
import { SessionUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { ActingUser } from "../src/services/acting-user.ts"

const make = () => Effect.runSync(Effect.gen(function*() { return yield* ActingUser }).pipe(Effect.provide(ActingUser.layer)))

test("the assistant's tools act as the account of the last chat turn, the local profile before any", () => {
  const local = new SessionUser({ id: "local", email: null, name: null })
  const signedIn = new SessionUser({ id: "me", email: "me@example.com", name: "Me" })
  const cell = make()
  expect(cell.get(local).id).toBe("local")
  cell.set(signedIn)
  expect(cell.get(local).id).toBe("me")
})

test("two instances never see each other's account", () => {
  const local = new SessionUser({ id: "local", email: null, name: null })
  const a = make()
  const b = make()
  a.set(new SessionUser({ id: "me", email: null, name: null }))
  expect(b.get(local).id).toBe("local")
})
