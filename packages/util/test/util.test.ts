import { describe, expect, test } from "bun:test"
import { BoundedCache } from "../src/bounded-cache.ts"

describe("BoundedCache", () => {
  const cache = (over: { maxEntries?: number; maxBytes?: number } = {}) => {
    const evicted: string[] = []
    const c = new BoundedCache<string, string>({ maxEntries: over.maxEntries ?? 3, maxBytes: over.maxBytes ?? 100, sizeOf: (v) => v.length, onEvict: (k) => evicted.push(k) })
    return { c, evicted }
  }

  test("evicts the least recently used entry past the entry count", () => {
    const { c, evicted } = cache()
    c.set("a", "1"); c.set("b", "2"); c.set("c", "3")
    expect(c.get("a")).toBe("1")
    c.set("d", "4")
    expect(evicted).toEqual(["b"])
    expect(c.has("a") && c.has("c") && c.has("d")).toBe(true)
  })

  test("is bounded by bytes, and an entry larger than the budget is not stored", () => {
    const { c, evicted } = cache({ maxEntries: 10, maxBytes: 10 })
    c.set("a", "xxxx"); c.set("b", "yyyy")
    expect(c.set("big", "z".repeat(11))).toBe(false)
    expect(c.bytes).toBe(8)
    c.set("c", "wwww")
    expect(evicted).toEqual(["a"])
    expect(c.bytes).toBe(8)
  })

  test("replacing a key counts its new size once; clear empties it with the hook", () => {
    const { c, evicted } = cache()
    c.set("a", "xx"); c.set("a", "yyyy")
    expect(c.bytes).toBe(4)
    expect(c.size).toBe(1)
    c.clear()
    expect(c.bytes).toBe(0)
    expect(evicted).toEqual(["a", "a"])
    c.get("nope")
    expect(c.misses).toBe(1)
  })
})
