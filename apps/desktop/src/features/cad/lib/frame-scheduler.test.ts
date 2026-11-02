import { describe, expect, test } from "bun:test"
import { FrameScheduler } from "./frame-scheduler.ts"

/** A frame source the test steps by hand. */
const clock = () => {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 1
  return {
    request: (callback: FrameRequestCallback) => { const id = next++; queue.set(id, callback); return id },
    cancel: (id: number) => { queue.delete(id) },
    step: () => { const [id, callback] = [...queue][0] ?? []; if (id === undefined) return false; queue.delete(id); callback!(0); return true },
    pending: () => queue.size
  }
}

describe("the frame scheduler", () => {
  test("many invalidations ask for one frame", () => {
    const c = clock()
    let draws = 0
    const scheduler = new FrameScheduler(() => { draws++; return false }, c.request, c.cancel)
    scheduler.invalidate(); scheduler.invalidate(); scheduler.invalidate()
    expect(c.pending()).toBe(1)
    c.step()
    expect(draws).toBe(1)
    expect(c.pending()).toBe(0)
  })

  test("a draw that is still moving asks for the next frame itself", () => {
    const c = clock()
    let remaining = 3, draws = 0
    const scheduler = new FrameScheduler(() => { draws++; return --remaining > 0 }, c.request, c.cancel)
    scheduler.invalidate()
    while (c.step());
    expect(draws).toBe(3)
  })

  test("a hidden canvas draws nothing and draws again when it comes back", () => {
    const c = clock()
    let draws = 0
    const scheduler = new FrameScheduler(() => { draws++; return false }, c.request, c.cancel)
    scheduler.invalidate()
    scheduler.suspend(true)
    expect(c.pending()).toBe(0)
    scheduler.invalidate()
    expect(c.pending()).toBe(0)
    scheduler.suspend(false)
    expect(c.pending()).toBe(1)
    c.step()
    expect(draws).toBe(1)
  })

  test("a disposed scheduler ignores everything, and cancels the frame in flight", () => {
    const c = clock()
    let draws = 0
    const scheduler = new FrameScheduler(() => { draws++; return true }, c.request, c.cancel)
    scheduler.invalidate()
    scheduler.dispose()
    expect(c.pending()).toBe(0)
    scheduler.invalidate()
    scheduler.suspend(false)
    expect(c.pending()).toBe(0)
    expect(draws).toBe(0)
  })

  test("the browser's own requestAnimationFrame can be passed detached", () => {
    const calls: unknown[] = []
    const fake = { raf(this: unknown, callback: FrameRequestCallback): number { calls.push(this); void callback; return 1 } }
    const scheduler = new FrameScheduler(() => false, fake.raf, () => {})
    scheduler.invalidate()
    expect(calls).toHaveLength(1)
  })
})
