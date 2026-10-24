import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createAutosave, type AutosaveOptions, type Clock } from "../src/shared/state/autosave.ts"

/** A clock the test advances by hand: timers run in order when time moves past them. */
const fakeClock = (): Clock & { advance(ms: number): Promise<void> } => {
  let now = 1_000_000, seq = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  return {
    now: () => now,
    setTimeout: (run, ms) => { const id = ++seq; timers.set(id, { at: now + ms, run }); return id },
    clearTimeout: (handle) => { timers.delete(handle as number) },
    advance: async (ms) => {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0]); now = due[1].at; due[1].run()
        for (let i = 0; i < 20; i++) await Promise.resolve()
      }
      now = end
      for (let i = 0; i < 20; i++) await Promise.resolve()
    }
  }
}

const harness = (over: Partial<AutosaveOptions> = {}) => {
  const clock = fakeClock()
  const log: string[] = []
  const box = { content: "a", enabled: true, interval: 120_000, canSave: true, fail: undefined as Error | undefined, hold: undefined as Promise<void> | undefined }
  const autosave = createRoot(() => createAutosave({
    revision: () => box.content,
    save: async (reason) => {
      const written = box.content
      log.push(`${reason}:${written}`)
      if (box.hold) await box.hold
      if (box.fail) throw box.fail
      return written
    },
    enabled: () => box.enabled,
    intervalMs: () => box.interval,
    canSave: () => box.canSave,
    debounceMs: 10,
    retryMs: 5_000,
    clock,
    ...over
  }))
  return { clock, log, box, autosave }
}

describe("autosave schedule", () => {
  test("a clean resource never saves; an edit makes it dirty and the interval writes it once", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"; const touched = h.autosave.touch(); await h.clock.advance(10); await touched
    expect(h.autosave.state()).toBe("dirty")
    await h.clock.advance(119_000)
    expect(h.log).toEqual([])
    await h.clock.advance(1_500)
    expect(h.log).toEqual(["auto:b"])
    expect(h.autosave.state()).toBe("clean")
    expect(h.autosave.savedAt()).toBeDefined()
    await h.clock.advance(600_000)
    expect(h.log).toEqual(["auto:b"]) // nothing changed: no further writes
  })

  test("continuous editing does not push the save back: it still happens every interval", async () => {
    const h = harness()
    await h.autosave.baseline()
    for (let i = 0; i < 6; i++) {
      h.box.content = `edit-${i}`; const touched = h.autosave.touch(); await h.clock.advance(30_000); await touched
    }
    expect(h.log.length).toBe(1)
    expect(h.log[0]).toMatch(/^auto:edit-/)
  })

  test("turning autosave off stops the timer; turning it on again arms it", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"; const touched = h.autosave.touch(); await h.clock.advance(10); await touched
    h.box.enabled = false; h.autosave.reschedule()
    await h.clock.advance(10 * 60_000)
    expect(h.log).toEqual([])
    expect(h.autosave.state()).toBe("dirty") // still tracked, so the indicator and the manual save work
    h.box.enabled = true; h.autosave.reschedule()
    await h.clock.advance(121_000)
    expect(h.log).toEqual(["auto:b"])
  })

  test("a changed interval re-arms from now", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"; const touched = h.autosave.touch(); await h.clock.advance(10); await touched
    h.box.interval = 60_000; h.autosave.reschedule()
    await h.clock.advance(61_000)
    expect(h.log).toEqual(["auto:b"])
  })

  test("with no destination the resource stays dirty and nothing is attempted", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.canSave = false
    h.box.content = "b"; const touched = h.autosave.touch(); await h.clock.advance(10); await touched
    await h.clock.advance(10 * 60_000)
    expect(h.log).toEqual([])
    expect(h.autosave.state()).toBe("dirty")
  })
})

describe("autosave writes", () => {
  test("saveNow on a clean resource writes nothing", async () => {
    const h = harness()
    await h.autosave.baseline()
    await h.autosave.saveNow("manual")
    expect(h.log).toEqual([])
  })

  test("an edit made during a write leaves the resource dirty, and the next write carries it", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"
    let release!: () => void
    h.box.hold = new Promise<void>((resolve) => { release = resolve })
    const first = h.autosave.saveNow("manual")
    await h.clock.advance(1)
    expect(h.autosave.state()).toBe("saving")
    h.box.content = "c" // typed while the write is in flight
    release(); h.box.hold = undefined
    await first
    expect(h.autosave.state()).toBe("dirty")
    await h.autosave.saveNow("flush")
    expect(h.log).toEqual(["manual:b", "flush:c"])
    expect(h.autosave.state()).toBe("clean")
  })

  test("writes never overlap: a request during a write runs after it", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"
    let release!: () => void
    h.box.hold = new Promise<void>((resolve) => { release = resolve })
    const first = h.autosave.saveNow("auto")
    await h.clock.advance(1)
    h.box.content = "c"
    const second = h.autosave.saveNow("flush")
    await h.clock.advance(1)
    expect(h.log).toEqual(["auto:b"]) // the second has not started
    release(); h.box.hold = undefined
    await Promise.all([first, second])
    expect(h.log).toEqual(["auto:b", "flush:c"])
  })

  test("a failed write keeps the resource dirty, reports it and retries with a growing delay", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"; h.box.fail = new Error("disk full")
    const touched = h.autosave.touch(); await h.clock.advance(10); await touched
    await h.clock.advance(121_000)
    expect(h.autosave.state()).toBe("error")
    expect(h.autosave.error()).toBe("disk full")
    expect(h.log).toHaveLength(1)
    await h.clock.advance(5_100) // first retry after retryMs
    expect(h.log).toHaveLength(2)
    await h.clock.advance(5_100) // the second waits twice as long
    expect(h.log).toHaveLength(2)
    h.box.fail = undefined
    await h.clock.advance(5_000)
    expect(h.log).toHaveLength(3)
    expect(h.autosave.state()).toBe("clean")
    expect(h.autosave.error()).toBeUndefined()
  })

  test("a conflict (not retryable) waits for the user: no automatic retry, a manual save still works", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"
    h.box.fail = Object.assign(new Error("changed elsewhere"), { retryable: false })
    await expect(h.autosave.saveNow("manual")).rejects.toThrow("changed elsewhere")
    await h.clock.advance(30 * 60_000)
    expect(h.log).toHaveLength(1)
    expect(h.autosave.state()).toBe("error")
    h.box.fail = undefined
    await h.autosave.saveNow("manual")
    expect(h.autosave.state()).toBe("clean")
  })

  test("a failed write does not block the ones after it", async () => {
    const h = harness()
    await h.autosave.baseline()
    h.box.content = "b"; h.box.fail = new Error("boom")
    await expect(h.autosave.saveNow("manual")).rejects.toThrow("boom")
    h.box.fail = undefined
    await h.autosave.saveNow("manual")
    expect(h.log).toEqual(["manual:b", "manual:b"])
  })

  test("baseline declares a stored copy: an opened document is clean, and a revision the editor already left is dirty", async () => {
    const h = harness()
    h.box.content = "opened"
    await h.autosave.baseline()
    expect(h.autosave.state()).toBe("clean")
    h.box.content = "opened+edit"
    await h.autosave.baseline("opened") // the stored copy is the old one
    expect(h.autosave.state()).toBe("dirty")
  })
})
