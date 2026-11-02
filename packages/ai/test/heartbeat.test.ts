import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { withHeartbeat } from "../src/heartbeat.ts"

describe("stream heartbeat", () => {
  test("a silent stretch gets heartbeats, real events retain their order, and collection ends with the source", async () => {
    const slow = Stream.concat(Stream.make("a"), Stream.fromEffect(Effect.delay(Effect.succeed("b"), "120 millis")))
    const out = await Effect.runPromise(Stream.runCollect(withHeartbeat(slow, 25)))
    const items = [...out]
    expect(items[0]).toBe("a")
    // A concurrent heartbeat already queued when the source ends may drain after its last value.
    expect(items.filter((item) => typeof item === "string")).toEqual(["a", "b"])
    const beats = items.filter((x) => typeof x === "object")
    expect(beats.length).toBeGreaterThanOrEqual(2)
    expect(beats.every((b) => (b as { type: string }).type === "heartbeat")).toBe(true)
  })

  test("no heartbeat after the source has ended", async () => {
    const out = await Effect.runPromise(Stream.runCollect(withHeartbeat(Stream.make(1, 2), 10)))
    expect([...out].filter((x) => typeof x === "object").length).toBeLessThanOrEqual(1)
    expect([...out].filter((x) => typeof x === "number")).toEqual([1, 2])
  })
})
