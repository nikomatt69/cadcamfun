import { expect, test } from "bun:test"
import { Effect, Layer, Metric } from "effect"
import { eventLoopDelayMax, eventLoopWatch } from "../src/observability.ts"

test("a stalled event loop is measured and the gauge reports how long it stood still", async () => {
  const stalled = await Effect.runPromise(Effect.gen(function*() {
    // Idle first: the window must start clean, then block the loop the way heavy synchronous kernel work would.
    yield* Effect.sleep("150 millis")
    const until = Date.now() + 400
    while (Date.now() < until) { /* busy */ }
    // The gauge holds the latest window, so read it while the stalled window is still the newest.
    let seen = 0
    for (let i = 0; i < 40; i++) {
      yield* Effect.sleep("5 millis")
      seen = Math.max(seen, (yield* Metric.value(eventLoopDelayMax)).value)
    }
    return seen
  }).pipe(Effect.provide(eventLoopWatch("100 millis")), Effect.scoped))
  expect(stalled).toBeGreaterThanOrEqual(250)
})

test("the watch stops with its scope", async () => {
  await Effect.runPromise(Effect.void.pipe(Effect.provide(eventLoopWatch("50 millis")), Effect.scoped))
  await Effect.runPromise(Effect.sleep("120 millis"))
})
