import { describe, expect, test } from "bun:test"
import { BoundedCache } from "../src/bounded-cache.ts"
import { Semaphore } from "../src/semaphore.ts"
import { SingleFlight } from "../src/single-flight.ts"

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("Semaphore", () => {
  test("never runs more than its slots and serves the queue in order", async () => {
    const s = new Semaphore(2)
    let running = 0, peak = 0
    const order: number[] = []
    await Promise.all([1, 2, 3, 4, 5].map((n) => s.run(async () => {
      running++; peak = Math.max(peak, running); order.push(n)
      await tick(); await tick()
      running--
    })))
    expect(peak).toBe(2)
    expect(order).toEqual([1, 2, 3, 4, 5])
    expect(s.active).toBe(0)
  })

  test("a waiter that aborts leaves the queue and never takes a slot", async () => {
    const s = new Semaphore(1)
    const hold = await s.acquire()
    const controller = new AbortController()
    const waiting = s.acquire(controller.signal)
    const next = s.acquire()
    expect(s.waiting).toBe(2)
    controller.abort(new Error("gone"))
    await expect(waiting).rejects.toThrow("gone")
    expect(s.waiting).toBe(1)
    hold()
    const release = await next
    expect(s.active).toBe(1)
    release(); release()
    expect(s.active).toBe(0)
  })

  test("a slot is given back when the work throws; a bad size is refused", async () => {
    const s = new Semaphore(1)
    await expect(s.run(async () => { throw new Error("boom") })).rejects.toThrow("boom")
    expect(s.active).toBe(0)
    expect(() => new Semaphore(0)).toThrow(RangeError)
  })
})

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

describe("SingleFlight", () => {
  test("identical concurrent work runs once, and every caller gets the result and the progress", async () => {
    const f = new SingleFlight<string, number, string>()
    let starts = 0
    const seenA: string[] = [], seenB: string[] = []
    const start = async (flight: { emit: (p: string) => void }) => { starts++; flight.emit("half"); await tick(); flight.emit("done"); return 42 }
    const [a, b] = await Promise.all([f.join("k", start, { onProgress: (p) => seenA.push(p) }), f.join("k", start, { onProgress: (p) => seenB.push(p) })])
    expect([a, b, starts]).toEqual([42, 42, 1])
    expect(seenA).toEqual(["half", "done"])
    expect(f.running).toBe(0)
    await f.join("k", start)
    expect(starts).toBe(2)
  })

  test("one caller leaving does not stop the run; the last one leaving aborts it", async () => {
    const f = new SingleFlight<string, number>()
    let aborted = false
    const start = (flight: { signal: AbortSignal }) => new Promise<number>((resolve) => {
      flight.signal.addEventListener("abort", () => { aborted = true; resolve(-1) })
      setTimeout(() => resolve(7), 30)
    })
    const one = new AbortController(), two = new AbortController()
    const a = f.join("k", start, { signal: one.signal })
    const b = f.join("k", start, { signal: two.signal })
    one.abort(new Error("left"))
    await expect(a).rejects.toThrow("left")
    expect(aborted).toBe(false)
    expect(await b).toBe(7)

    const solo = new AbortController()
    const c = f.join("k2", start, { signal: solo.signal })
    solo.abort(new Error("alone"))
    await expect(c).rejects.toThrow("alone")
    expect(aborted).toBe(true)
  })

  test("a failure reaches every caller and the next call starts fresh", async () => {
    const f = new SingleFlight<string, number>()
    let n = 0
    const start = async () => { n++; await tick(); if (n === 1) throw new Error("bad"); return n }
    const results = await Promise.allSettled([f.join("k", start), f.join("k", start)])
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"])
    expect(await f.join("k", start)).toBe(2)
  })

  test("a caller arriving after the last one left starts a fresh run, not the aborted one", async () => {
    const f = new SingleFlight<string, number>()
    let starts = 0
    const start = (flight: { signal: AbortSignal }) => new Promise<number>((resolve) => {
      const n = ++starts
      flight.signal.addEventListener("abort", () => resolve(-n))
      setTimeout(() => resolve(n), 20)
    })
    const gone = new AbortController()
    const first = f.join("k", start, { signal: gone.signal })
    gone.abort(new Error("left"))
    await expect(first).rejects.toThrow("left")
    expect(await f.join("k", start)).toBe(2)
  })
})
