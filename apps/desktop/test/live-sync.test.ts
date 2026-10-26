import "./helpers/dom-global.ts"
import { expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { startLiveSync } from "../src/app/live-sync.ts"
import { createQueryCache } from "../src/shared/state/query-cache.ts"
import type { AppState } from "../src/shared/state/context.ts"
import type { LiveEvent } from "@cadcamfun/api"
import { useCamStore } from "../src/features/cam/store/camStore.ts"

test("one desktop host connection coalesces phone changes, reloads on greeting and stops on disposal", async () => {
  let push!: (event: LiveEvent) => void
  const queued: LiveEvent[] = []
  let wake: (() => void) | undefined
  let reads = 0, closed = false
  const cache = createQueryCache()
  let invalidations = 0
  cache.subscribe(() => invalidations++)
  const runtime = {
    run: (effect: Effect.Effect<unknown>, options?: { signal?: AbortSignal }) => Effect.runPromise(effect, options),
  }
  const stream = Stream.fromAsyncIterable((async function*() {
    try {
      for (;;) {
        while (queued.length) yield queued.shift()!
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally { closed = true }
  })(), (error) => error)
  push = (event) => { queued.push(event); wake?.(); wake = undefined }
  const notifications = { handleLiveEvent: () => undefined, refresh: async () => undefined }
  const app = { cache, runtime, notifications, client: { events: { subscribeAll: () => { reads++; return Effect.succeed(stream) } } } } as unknown as AppState
  const stop = startLiveSync(app)
  const until = async (probe: () => boolean) => {
    const deadline = Date.now() + 2000
    while (!probe()) { if (Date.now() > deadline) throw new Error("Live sync timed out"); await new Promise((resolve) => setTimeout(resolve, 5)) }
  }
  try {
    await until(() => reads === 1)
    push({ type: "server.connected", at: "now" })
    await until(() => invalidations === 1)
    for (let i = 0; i < 20; i++) push({ type: "workspace.changed", projectId: "phone-project", at: "now" })
    await until(() => invalidations === 2)
    expect(reads).toBe(1)
    // Kernel progress moves the CAM panel's label and never reloads the project, even for the open one.
    const before = invalidations
    push({ type: "cam.progress", projectId: "phone-project", runId: "r1", phase: "running", stage: "operations", operationId: "rough", index: 0, count: 3, at: "now" })
    await until(() => useCamStore.getState().kernelProgress?.runId === "r1")
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(useCamStore.getState().kernelProgress).toMatchObject({ operationId: "rough", index: 0, count: 3 })
    expect(invalidations).toBe(before)
    stop()
    push({ type: "workspace.changed", projectId: "phone-project", at: "now" })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(invalidations).toBe(2)
  } finally { stop(); wake?.() }
})
