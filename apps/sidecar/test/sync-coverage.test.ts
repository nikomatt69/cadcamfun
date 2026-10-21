/**
 * Sync coverage: every user-visible write announces itself on the live bus (so a second device
 * reloads), and the host stream keeps beating so a client can tell a quiet stream from a dead one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Context, Effect, Fiber, Stream } from "effect"
import { makeApp } from "./helpers.ts"
import { frameVisibleTo, framed } from "../src/http/events.ts"
import { LiveEvents, announcingWrites } from "../src/services/live-events.ts"
import { McpRepo } from "../src/repos/mcp-repo.ts"
import { UserRepo } from "../src/repos/user-repo.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let userId: string
beforeAll(async () => {
  app = await makeApp()
  userId = (await app.call("/api/user/profile")).body.id
})
afterAll(async () => { await app.dispose() })

describe("sync coverage", () => {
  test("the stream greets, then beats while idle", async () => {
    const frames = await Effect.runPromise(Stream.runCollect(framed(Stream.never, 20).pipe(Stream.take(3))))
    expect(frames.map((f) => f.type)).toEqual(["server.connected", "server.heartbeat", "server.heartbeat"])
  })

  test("profile and MCP writes reach the owner's devices", async () => {
    const frames = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const ctx = yield* Effect.promise(() => app.services())
      const events = Context.get(ctx, LiveEvents)
      const users = Context.get(ctx, UserRepo)
      const mcp = Context.get(ctx, McpRepo)
      const stream = yield* events.subscribe({})
      const collecting = yield* Effect.forkDetach(Stream.runCollect(stream.pipe(Stream.take(3))))
      yield* users.updateProfile(userId, { name: "Synced" } as never)
      const created = yield* mcp.create(userId, { name: "sync-probe", type: "stdio" } as never)
      yield* mcp.remove(created.id)
      return yield* Fiber.join(collecting).pipe(Effect.timeout("5 seconds"))
    })))
    expect(frames.every((f) => f.type === "resources.changed" && f.userId === userId)).toBe(true)
  })

  test("organization writes carry the organization so every member's device reloads", async () => {
    const seen: Array<readonly [string, string | null | undefined]> = []
    const events = { resourcesChanged: (user: string, org?: string | null) => Effect.sync(() => { seen.push([user, org]) }) }
    const repo = announcingWrites(events, {
      shared: (_user: string) => Effect.succeed({ organizationId: "org-1" }),
      personal: (_user: string) => Effect.succeed({ organizationId: null })
    }, ["shared", "personal"])
    await Effect.runPromise(Effect.andThen(repo.shared("u1"), repo.personal("u1")))
    expect(seen).toEqual([["u1", "org-1"], ["u1", undefined]])

    const frame = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const ctx = yield* Effect.promise(() => app.services())
      const bus = Context.get(ctx, LiveEvents)
      const stream = yield* bus.subscribe({})
      const next = yield* Effect.forkDetach(Stream.runHead(stream.pipe(Stream.filter((e) => e.type === "resources.changed" && e.organizationId === "org-1"))))
      yield* bus.resourcesChanged(userId, "org-1")
      return yield* Fiber.join(next).pipe(Effect.timeout("5 seconds"))
    })))
    expect(frame._tag === "Some" && frame.value).toMatchObject({ type: "resources.changed", userId, organizationId: "org-1" })
  })

  test("an organization frame is delivered to members and to nobody else", async () => {
    const members = new Map([["org-1", new Set(["owner", "colleague"])]])
    const projects = {
      isMember: (user: string, org: string) => Effect.succeed(members.get(org)?.has(user) ?? false),
      find: () => Effect.succeed(undefined)
    }
    const frame = { type: "resources.changed", userId: "owner", organizationId: "org-1", at: "now" } as const
    const seenBy = (user: string) => Effect.runPromise(frameVisibleTo(user, frame, projects))
    expect(await seenBy("owner")).toBe(true)
    expect(await seenBy("colleague")).toBe(true)
    expect(await seenBy("stranger")).toBe(false)
    // Revoked membership stops delivery on the very next frame.
    members.get("org-1")!.delete("colleague")
    expect(await seenBy("colleague")).toBe(false)
    // A personal write never leaks to an organization.
    expect(await Effect.runPromise(frameVisibleTo("colleague", { type: "resources.changed", userId: "owner", at: "now" }, projects))).toBe(false)
  })
})
