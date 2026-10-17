import { describe, expect, test } from "bun:test"
import { PreviewCache } from "./cache.ts"

describe("preview cache", () => {
  test("evicts the least recently used entry past the entry bound", () => {
    const cache = new PreviewCache<string>({ maxEntries: 2, maxWeight: 100 }, (value) => value.length)
    cache.set("a", "1")
    cache.set("b", "2")
    expect(cache.get("a")).toBe("1")
    cache.set("c", "3")
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")).toBe("1")
    expect(cache.size).toBe(2)
  })

  test("keeps the total weight under its budget and never stores an entry larger than it", () => {
    const cache = new PreviewCache<string>({ maxEntries: 10, maxWeight: 10 }, (value) => value.length)
    cache.set("a", "xxxx")
    cache.set("b", "xxxx")
    cache.set("c", "xxxx")
    expect(cache.weight).toBeLessThanOrEqual(10)
    expect(cache.get("a")).toBeUndefined()
    cache.set("huge", "x".repeat(11))
    expect(cache.get("huge")).toBeUndefined()
    expect(cache.get("c")).toBe("xxxx")
  })

  test("replacing a key adjusts the weight, and getOrSet builds once", () => {
    const cache = new PreviewCache<string>({ maxEntries: 10, maxWeight: 10 }, (value) => value.length)
    cache.set("a", "xxxx")
    cache.set("a", "xx")
    expect(cache.weight).toBe(2)
    let built = 0
    const make = () => { built++; return "v" }
    cache.getOrSet("k", make)
    cache.getOrSet("k", make)
    expect(built).toBe(1)
  })
})
