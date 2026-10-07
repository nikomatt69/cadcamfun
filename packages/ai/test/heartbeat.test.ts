import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { withHeartbeat } from "../src/heartbeat.ts"

describe("stream heartbeat", () => {
  test("a silent stretch gets heartbeats, real events pass untouched, and the stream still ends with its source", async () => {
    const slow = Stream.concat(Stream.make("a"), Stream.fromEffect(Effect.delay(Effect.succeed("b"), "120 millis")))
    const out = await Effect.runPromise(Stream.runCollect(withHeartbeat(slow, 25)))
    const items = [...out]
    expect(items[0]).toBe("a")
    expect(items.at(-1)).toBe("b")
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
