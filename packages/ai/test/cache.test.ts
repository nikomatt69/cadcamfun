import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AiCache, cached, keyOf } from "../src/cache.ts"

const run = <A, E>(effect: Effect.Effect<A, E, AiCache>, options?: { ttl?: number; maxSize?: number }) =>
  Effect.runPromise(effect.pipe(Effect.provide(AiCache.layer(options))))

describe("AiCache", () => {
  test("keyOf is stable across key order and JSON-equivalent payloads", () => {
    expect(keyOf({ a: 1, b: 2 })).toBe(keyOf({ b: 2, a: 1 }))
    expect(keyOf([1, 2, 3])).toBe(keyOf([1, 2, 3]))
    expect(keyOf({ a: 1, b: 2 })).not.toBe(keyOf({ a: 1, b: 3 }))
    expect(keyOf(null)).toBe(keyOf(null))
  })

  test("set/get round-trip with a TTL", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* AiCache
      yield* cache.set("k", "v")
      return yield* cache.get<string>("k")
    })
    expect(await run(program, { ttl: 60_000 })).toBe("v")
  })

  test("expired entries are returned as a miss and removed", async () => {
    let now = 1_000_000
    const original = Date.now
    Date.now = () => now
    try {
      const program = Effect.gen(function* () {
        const cache = yield* AiCache
        yield* cache.set("k", "v", 500)
        now += 600
        const hit = yield* cache.get<string>("k")
        const size = yield* cache.size
        return { hit, size }
      })
      const { hit, size } = await run(program, { ttl: 500 })
      expect(hit).toBeUndefined()
      expect(size).toBe(0)
    } finally {
      Date.now = original
    }
  })

  test("eviction drops the oldest entry past maxSize", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* AiCache
      yield* cache.set("a", 1)
      yield* cache.set("b", 2)
      yield* cache.set("c", 3)
      yield* cache.set("d", 4) // evicts "a" by insertion order
      return {
        a: yield* cache.get<number>("a"),
        b: yield* cache.get<number>("b"),
        c: yield* cache.get<number>("c"),
        d: yield* cache.get<number>("d")
      }
    })
    const result = await run(program, { ttl: 60_000, maxSize: 3 })
    expect(result.a).toBeUndefined()
    expect(result.b).toBe(2)
    expect(result.c).toBe(3)
    expect(result.d).toBe(4)
  })

  test("clear wipes everything", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* AiCache
      yield* cache.set("a", 1)
      yield* cache.set("b", 2)
      yield* cache.clear
      const size = yield* cache.size
      const a = yield* cache.get<number>("a")
      return { size, a }
    })
    const { size, a } = await run(program)
    expect(size).toBe(0)
    expect(a).toBeUndefined()
  })

  test("delete returns true exactly once", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* AiCache
      yield* cache.set("k", 1)
      const first = yield* cache.delete("k")
      const second = yield* cache.delete("k")
      return { first, second }
    })
    const { first, second } = await run(program)
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  test("cached: hit returns the stored value without running the effect", async () => {
    let runs = 0
    const make = () => Effect.sync(() => {
      runs++
      return runs * 10
    })
    const program = Effect.gen(function* () {
      const a = yield* cached("payload", 60_000, make())
      const b = yield* cached("payload", 60_000, make())
      const c = yield* cached("payload", 60_000, make())
      return { a, b, c }
    })
    const { a, b, c } = await run(program)
    expect(a).toBe(10)
    expect(b).toBe(10)
    expect(c).toBe(10)
    expect(runs).toBe(1)
  })

  test("cached: failures are not cached", async () => {
    let runs = 0
    const flaky = (): Effect.Effect<number, Error> =>
      Effect.try({
        try: () => {
          runs++
          if (runs === 1) throw new Error("boom")
          return runs
        },
        catch: (e) => e as Error
      })
    const program = Effect.gen(function* () {
      yield* Effect.flip(cached("payload", 60_000, flaky()))
      return yield* cached("payload", 60_000, flaky())
    })
    const value = await run(program)
    expect(value).toBe(2)
  })
})

// Suppress unused-import warning for Layer when only Effect.provide is used.
void Layer