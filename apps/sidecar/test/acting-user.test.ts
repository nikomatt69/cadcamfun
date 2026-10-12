import { expect, test } from "bun:test"
import { SessionUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { adoptChildSession } from "@cadcamfun/ai"
import { ActingUser } from "../src/services/acting-user.ts"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("overlapping tool invocations retain their admitted actor and prompt", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const acting = yield* ActingUser
    const alice = new SessionUser({ id: "alice", name: "Alice", email: "alice@test.local" })
    const bob = new SessionUser({ id: "bob", name: "Bob", email: "bob@test.local" })
    expect(yield* Effect.promise(() => acting.bind("a", "sa", alice, "Alice turn"))).toBe(true)
    expect(yield* Effect.promise(() => acting.bind("b", "sb", bob, "Bob turn"))).toBe(true)
    expect(yield* Effect.promise(() => acting.bind("a", "sa", bob))).toBe(false)
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

test("private session authority survives service restart and cannot be rebound to another actor or project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cadcamfun-session-owner-"))
  const alice = new SessionUser({ id: "alice", name: "Alice", email: "alice@test.local" })
  const bob = new SessionUser({ id: "bob", name: "Bob", email: "bob@test.local" })
  const run = (f: (acting: ActingUser["Service"]) => Promise<void>) => Effect.runPromise(Effect.gen(function* () {
    const acting = yield* ActingUser
    acting.configureDirectory(directory)
    yield* Effect.promise(() => f(acting))
  }).pipe(Effect.provide(ActingUser.layer)))
  try {
    await run(async (acting) => { expect(await acting.bind("part-a", "ses_saved", alice, "First turn")).toBe(true) })
    await run(async (acting) => {
      expect(await acting.owner("ses_saved")).toEqual({ userId: "alice", projectId: "part-a" })
      expect(await acting.bind("part-a", "ses_saved", bob)).toBe(false)
      expect(await acting.bind("part-b", "ses_saved", alice)).toBe(false)
      expect(await acting.bind("part-a", "ses_saved", alice, "Continue")).toBe(true)
      expect(await acting.invoke("part-a", "ses_saved", async () => acting.lastPrompt())).toBe("Continue")
      await acting.forget("ses_saved")
    })
    await run(async (acting) => { expect(await acting.owner("ses_saved")).toBeUndefined() })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
