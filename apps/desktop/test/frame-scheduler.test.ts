import { expect, test } from "bun:test"
import { FrameScheduler } from "../src/cad/lib/frame-scheduler.ts"

const harness = (draw: () => boolean) => {
  let id = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const scheduler = new FrameScheduler(draw, (callback) => { callbacks.set(++id, callback); return id }, (key) => { callbacks.delete(key) })
  const tick = () => {
    const entry = callbacks.entries().next().value
    if (!entry) throw new Error("No scheduled frame")
    callbacks.delete(entry[0]); entry[1](0)
  }
  return { scheduler, callbacks, tick }
}

test("idle scenes have no frame loop; repeated updates coalesce", () => {
  let draws = 0
  const h = harness(() => { draws++; return false })
  h.scheduler.invalidate(); h.scheduler.invalidate()
  expect(h.callbacks.size).toBe(1)
  h.tick()
  expect(draws).toBe(1)
  expect(h.callbacks.size).toBe(0)
})

test("damping requests frames only while moving", () => {
  let remaining = 2
  const h = harness(() => remaining-- > 0)
  h.scheduler.invalidate()
  h.tick(); h.tick(); h.tick()
  expect(h.callbacks.size).toBe(0)
})

test("hidden and disposed views cancel work and cannot be revived after disposal", () => {
  let draws = 0
  const h = harness(() => { draws++; return false })
  h.scheduler.invalidate(); h.scheduler.suspend(true); h.scheduler.invalidate()
  expect(h.callbacks.size).toBe(0)
  h.scheduler.suspend(false); h.tick()
  expect(draws).toBe(1)
  h.scheduler.invalidate(); h.scheduler.dispose(); h.scheduler.suspend(false); h.scheduler.invalidate()
  expect(h.callbacks.size).toBe(0)
})
