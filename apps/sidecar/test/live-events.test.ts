/**
 * The live event stream: the vcs handlers publish, the notification feed records the user-visible
 * subset, and the endpoint is scoped to a project the caller can actually see.
 *
 * The stream is the only push channel a companion device has, so the contract under test is narrow
 * but important: a write is announced once, on that project's channel only, and the notification
 * row lands in the same user's feed — so reviewing on the desktop marks it read on the phone.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"
import { LiveEvents, liveEventMatches } from "../src/services/live-events.ts"
import { LiveEvent as ApiLiveEvent, PublishedLiveEvent } from "@cadcamfun/api"
import { Effect, Fiber, Schema, Stream } from "effect"
import type { LiveEvent } from "../src/services/live-events.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let id: string
let drawingId: string
beforeAll(async () => {
  app = await makeApp()
  id = (await app.call("/api/projects", { method: "POST", json: { name: "Bracket" } })).body.id
  await app.call(`/api/projects/${id}/drawings`, { method: "POST", json: { name: "Plate", data: { w: 100 } } })
  drawingId = (await app.call(`/api/projects/${id}/drawings`)).body[0].id
  await app.call(`/api/projects/${id}/vcs/commit`, { method: "POST", json: { message: "Initial import" } })
  await app.call(`/api/projects/${id}/vcs/branches`, { method: "POST", json: { name: "ai/widen-plate" } })
  await app.call(`/api/projects/${id}/vcs/checkout`, { method: "POST", json: { branch: "ai/widen-plate" } })
})
afterAll(async () => { await app.dispose() })

const v = (path: string) => `/api/projects/${id}${path}`

describe("live events", () => {
  test("the bus filters by project and by type", () => {
    const base = { projectId: "p1", at: "2026-01-01T00:00:00.000Z" } as const
    const commit: LiveEvent = { ...base, type: "commit", oid: "abc", branch: "main", authorKind: "user", message: "hi" }
    const pr: LiveEvent = { ...base, type: "pr.opened", number: 1, title: "T", authorKind: "ai", head: "ai/x", base: "main" }
    const otherProject: LiveEvent = { ...commit, projectId: "p2" }

    expect(liveEventMatches(commit, { projectId: "p1" })).toBe(true)
    // The phone opens one stream per project; another project's work must never bleed into it.
    expect(liveEventMatches(otherProject, { projectId: "p1" })).toBe(false)
    expect(liveEventMatches(commit, {})).toBe(true)
    // A screen that only cares about pull requests is not woken by a commit.
    expect(liveEventMatches(commit, { types: ["pr.opened"] })).toBe(false)
    expect(liveEventMatches(pr, { types: ["pr.opened"] })).toBe(true)
  })

  test("an assistant commit opens a notification a person has to review", async () => {
    await app.call(`/api/drawings/${drawingId}`, { method: "PUT", json: { data: { w: 140 } } })
    const commit = await app.call(v("/vcs/commit"), { method: "POST", json: { message: "Widen plate to 140 mm", authorKind: "ai" } })
    expect(commit.status).toBe(201)

    const feed = (await app.call("/api/notifications")).body
    const ai = feed.notifications.find((n: { type: string }) => n.type === "AI_COMMITTED")
    // A person's own commits are silent; the assistant's are not, because a person must review them.
    expect(ai).toMatchObject({ title: "Assistant committed to ai/widen-plate", isRead: false })
    expect(feed.unreadCount).toBeGreaterThan(0)
    expect(ai.linkUrl).toBe(`/projects/${id}/history`)
  })

  test("opening, reviewing and merging a pull request each notify once", async () => {
    const before = (await app.call("/api/notifications")).body.unreadCount

    const pr = await app.call(v("/pulls"), { method: "POST", json: { title: "Widen plate", head: "ai/widen-plate", authorKind: "ai" } })
    expect(pr.status).toBe(201)
    const afterOpen = (await app.call("/api/notifications")).body.unreadCount

    expect((await app.call(v("/pulls/1/reviews"), { method: "POST", json: { verdict: "approve" } })).status).toBe(201)
    await app.call(v("/vcs/checkout"), { method: "POST", json: { branch: "main" } })
    expect((await app.call(v("/pulls/1/merge"), { method: "POST" })).status).toBe(200)

    const feed = (await app.call("/api/notifications")).body
    const types = feed.notifications.map((n: { type: string }) => n.type)
    expect(types).toContain("PR_OPENED")
    expect(types).toContain("PR_REVIEWED")
    expect(types).toContain("PR_MERGED")
    // Exactly one row per step, and no rows for the branch movement in between.
    expect(afterOpen - before).toBe(1)
    expect(feed.unreadCount - afterOpen).toBe(2)
  })

  test("marking read is what the shell badge reads", async () => {
    const before = (await app.call("/api/notifications")).body
    expect(before.unreadCount).toBeGreaterThan(0)
    const target = before.notifications.find((n: { isRead: boolean }) => !n.isRead)
    expect((await app.call(`/api/notifications/${target.id}`, { method: "PUT", json: { isRead: true } })).status).toBe(200)

    const after = (await app.call("/api/notifications")).body
    expect(after.unreadCount).toBe(before.unreadCount - 1)
    // The unread-only view the phone's badge reads is narrower still.
    expect((await app.call("/api/notifications?onlyUnread=true")).body.unreadCount).toBe(after.unreadCount)

    expect((await app.call("/api/notifications/mark-all-read", { method: "POST" })).status).toBe(200)
    expect((await app.call("/api/notifications")).body.unreadCount).toBe(0)
  })

  test("the stream is authenticated, exists, and is gated on the project", async () => {
    // An unauthenticated call is refused: the route exists, so the 401 is the auth layer talking.
    expect((await app.call(v("/events"), { auth: false })).status).toBe(401)
    // A project the caller cannot see answers 404 rather than an empty stream, so the phone knows
    // the pairing is stale instead of sitting on a connection that will never deliver a frame.
    expect((await app.call("/api/projects/nope/events")).status).toBe(404)
    // The companion gateway forwards the stream, so the phone never needs a different path.
    const { isCompanionRoute } = await import("../src/services/companion-gateway.ts")
    expect(isCompanionRoute("GET", v("/events"))).toBe(true)
  })
})

describe("one schema for the bus and the stream", () => {
  test("what the bus publishes encodes with the API's schema; the stream's own frames never go on the bus", async () => {
    const published: LiveEvent[] = []
    await Effect.runPromise(Effect.gen(function*() {
      const events = yield* LiveEvents
      yield* Effect.scoped(Effect.gen(function*() {
        const stream = yield* events.subscribe({})
        const collected = yield* Stream.runCollect(Stream.take(stream, 3)).pipe(Effect.forkChild)
        yield* events.workspaceChanged("p1")
        yield* events.resourcesChanged("u1", "org1")
        yield* events.publish({ type: "cam.progress", projectId: "p1", runId: "r1", phase: "running", stage: "queued", ahead: 2, at: new Date().toISOString() })
        published.push(...(yield* Fiber.join(collected)))
      }))
    }).pipe(Effect.provide(LiveEvents.layer)))
    expect(published.map((e) => e.type)).toEqual(["workspace.changed", "resources.changed", "cam.progress"])
    for (const event of published) {
      expect(Schema.decodeUnknownSync(PublishedLiveEvent)(Schema.encodeUnknownSync(PublishedLiveEvent)(event))).toEqual(event)
      expect(Schema.is(ApiLiveEvent)(event)).toBe(true)
    }
    const greeting = { type: "server.connected", at: new Date().toISOString() }
    expect(Schema.is(ApiLiveEvent)(greeting)).toBe(true)
    expect(Schema.is(PublishedLiveEvent)(greeting)).toBe(false)
  })
})
