import { expect, test } from "bun:test"
import { SessionUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { adoptChildSession } from "@cadcamfun/ai"
import { ActingUser } from "../src/services/acting-user.ts"

test("overlapping tool invocations retain their admitted actor and prompt", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const acting = yield* ActingUser
    const alice = new SessionUser({ id: "alice", name: "Alice", email: "alice@test.local" })
    const bob = new SessionUser({ id: "bob", name: "Bob", email: "bob@test.local" })
    expect(acting.bind("a", "sa", alice, "Alice turn")).toBe(true)
    expect(acting.bind("b", "sb", bob, "Bob turn")).toBe(true)
    expect(acting.bind("a", "sa", bob)).toBe(false)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = acting.invoke("a", "sa", async () => {
      await gate
      return { id: acting.get(bob).id, prompt: acting.lastPrompt() }
    })
    acting.set(bob, "last cell must not select authority")
    const second = yield* Effect.promise(() => acting.invoke("b", "sb", async () => acting.get(alice).id))
    expect(second).toBe("bob")
    release()
    expect(yield* Effect.promise(() => first)).toEqual({ id: "alice", prompt: "Alice turn" })
    yield* Effect.promise(async () => {
      await expect(acting.invoke("b", "sa", async () => "wrong")).rejects.toThrow("authenticated session owner")
      await expect(acting.invoke("a", "unknown", async () => "wrong")).rejects.toThrow("authenticated session owner")
    })
    const detach = adoptChildSession("sa", "child", "editor")
    try {
      expect(yield* Effect.promise(() => acting.invoke("a", "child", async () => acting.get(bob).id))).toBe("alice")
    } finally { detach() }
    const controller = new AbortController()
    yield* Effect.promise(() => acting.invoke("a", "sa", async () => {
      controller.abort()
      expect(() => acting.assertActive()).toThrow("cancelled before mutation")
    }, controller.signal))
    yield* Effect.promise(async () => {
      await expect(acting.invoke("a", "sa", async () => "must not execute", controller.signal)).rejects.toThrow("cancelled")
    })
  }).pipe(Effect.provide(ActingUser.layer)))
})
