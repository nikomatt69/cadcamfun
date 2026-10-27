import { expect, test } from "bun:test"
import { SessionUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { adoptChildSession } from "@cadcamfun/ai"
import { ActingUser, CurrentTurn, TurnCancelled, TurnUnowned, ensureTurnActive, invocationFailureText, isInvocationRefusal } from "../src/services/acting-user.ts"
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
      const live = acting.turn(bob)
      expect(Effect.runSync(Effect.exit(ensureTurnActive.pipe(Effect.provideService(CurrentTurn, live))))._tag).toBe("Success")
      controller.abort()
      const cancelled = Effect.runSync(Effect.flip(ensureTurnActive.pipe(Effect.provideService(CurrentTurn, acting.turn(bob)))))
      expect(cancelled).toBeInstanceOf(TurnCancelled)
      expect(cancelled.message).toContain("cancelled before mutation")
    }, controller.signal))
    yield* Effect.promise(async () => {
      await expect(acting.invoke("a", "sa", async () => "must not execute", controller.signal)).rejects.toBeInstanceOf(TurnCancelled)
      await expect(acting.invoke("b", "sa", async () => "wrong")).rejects.toBeInstanceOf(TurnUnowned)
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

test("the turn is read once at the edge: inside an invocation it is the admitted owner and drawing, outside the fallback", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const acting = yield* ActingUser
    const alice = new SessionUser({ id: "alice", name: "Alice", email: "alice@test.local" })
    const local = new SessionUser({ id: "local", name: "Local", email: "local@test.local" })
    const outside = acting.turn(local)
    expect(outside).toEqual({ user: local, admitted: false })
    expect(yield* Effect.promise(() => acting.bind("p", "s", alice, "make a plate", "d1"))).toBe(true)
    const inside = yield* Effect.promise(() => acting.invoke("p", "s", async () => acting.turn(local)))
    expect(inside).toMatchObject({ user: { id: "alice" }, prompt: "make a plate", drawingId: "d1", admitted: true })
    // Effect code reads the turn from its context, never from the storage: what was provided is what it sees.
    const seen = yield* CurrentTurn.pipe(Effect.provideService(CurrentTurn, inside))
    expect(seen.user.id).toBe("alice")
    expect(Object.isFrozen(inside)).toBe(true)
  }).pipe(Effect.provide(ActingUser.layer)))
})

test("a refused invocation says so; any other failure keeps its own message", () => {
  expect(isInvocationRefusal(new TurnUnowned())).toBe(true)
  expect(isInvocationRefusal(new TurnCancelled())).toBe(true)
  expect(invocationFailureText(new TurnCancelled())).toBe("AI invocation denied or interrupted.")
  const conflict = new Error("The drawing changed while this tool was working.")
  expect(isInvocationRefusal(conflict)).toBe(false)
  expect(invocationFailureText(conflict)).toBe("The drawing changed while this tool was working.")
})
