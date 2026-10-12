import { describe, expect, test } from "bun:test"
import { BackgroundTaskManager, type BackgroundTaskOwner, type BackgroundTaskRunnerInput } from "../src/nikcli/background-tasks.ts"

/**
 * Background tasks belong to the conversation (the parent session) that started them: stopping the turn or compacting the
 * conversation stops them, without retiring the parent, and a task of another parent is never touched.
 */
const parent: BackgroundTaskOwner = { projectId: "project", parentSessionId: "parent" }
const sibling: BackgroundTaskOwner = { projectId: "project", parentSessionId: "sibling" }
const task = (owner: BackgroundTaskOwner, edits = false) => ({ ...owner, prompt: "Inspect the part", description: "Inspect", ...(edits ? { edits: true } : {}) })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

/** A runner that finishes only when told to, or when its signal aborts (like a worker that honours cancellation). */
const manager = (honourAbort = true) => {
  const runs: Array<{ input: BackgroundTaskRunnerInput; resolve: (text: string) => void }> = []
  const m = new BackgroundTaskManager({
    runner: (input) => new Promise<string>((resolve) => {
      runs.push({ input, resolve })
      if (honourAbort) input.signal.addEventListener("abort", () => resolve(""), { once: true })
    })
  })
  return { m, runs }
}

describe("stopParent: the tasks of a conversation stop with it", () => {
  test("running and queued tasks of the parent are cancelled and counted; the runners have settled when it returns", async () => {
    const { m, runs } = manager()
    const a = m.enqueue(task(parent)), b = m.enqueue(task(parent, true)), c = m.enqueue(task(parent, true))
    await flush()
    // a and b run, c waits behind b (one editor per project at a time).
    expect(m.read(parent, c.id).status).toBe("queued")
    const stopped = await m.stopParent(parent)
    expect(stopped).toBe(3)
    expect([a, b, c].map((t) => m.read(parent, t.id).status)).toEqual(["cancelled", "cancelled", "cancelled"])
    expect(runs.every((r) => r.input.signal.aborted)).toBe(true)
  })

  test("nothing running: it returns 0 without waiting", async () => {
    const { m } = manager()
    const t0 = Date.now()
    expect(await m.stopParent(parent)).toBe(0)
    expect(Date.now() - t0).toBeLessThan(100)
  })

  test("finished tasks keep their result and are not counted", async () => {
    const { m, runs } = manager()
    const done = m.enqueue(task(parent))
    await flush()
    runs[0]!.resolve("findings")
    await flush()
    expect(m.read(parent, done.id)).toMatchObject({ status: "completed", text: "findings" })
    expect(await m.stopParent(parent)).toBe(0)
    expect(m.read(parent, done.id).status).toBe("completed")
  })

  test("the tasks of another parent are untouched", async () => {
    const { m } = manager()
    const mine = m.enqueue(task(parent)), theirs = m.enqueue(task(sibling))
    await flush()
    await m.stopParent(parent)
    expect(m.read(parent, mine.id).status).toBe("cancelled")
    expect(m.read(sibling, theirs.id).status).toBe("running")
    expect(await m.stopParent(sibling)).toBe(1)
  })

  test("the parent is not retired: it can start new tasks after the stop", async () => {
    const { m } = manager()
    m.enqueue(task(parent))
    await flush()
    await m.stopParent(parent)
    const next = m.enqueue(task(parent))
    await flush()
    expect(m.read(parent, next.id).status).toBe("running")
  })

  test("a runner that ignores the abort cannot hold the stop: the task already reads as cancelled and the wait is bounded", async () => {
    const { m, runs } = manager(false)
    const stuck = m.enqueue(task(parent))
    await flush()
    const t0 = Date.now()
    const stopped = await m.stopParent(parent, 60)
    expect(stopped).toBe(1)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50)
    expect(m.read(parent, stuck.id).status).toBe("cancelled")
    // The slot frees when the stuck runner finally settles.
    expect(runs[0]!.input.signal.aborted).toBe(true)
    runs[0]!.resolve("late")
    await flush()
    expect(m.read(parent, stuck.id).status).toBe("cancelled")
  })

  test("after the stop, nothing of the parent counts as active (what the compaction guard looks at)", async () => {
    const { m } = manager(false)
    m.enqueue(task(parent)); m.enqueue(task(parent, true)); m.enqueue(task(parent, true))
    await flush()
    await m.stopParent(parent, 20)
    expect(m.list(parent).some((t) => t.status === "running" || t.status === "queued")).toBe(false)
  })

  test("cancelled tasks do not wake the parent", async () => {
    const delivered: string[] = []
    const runs: Array<(text: string) => void> = []
    const m = new BackgroundTaskManager({
      runner: (input) => new Promise<string>((resolve) => { runs.push(resolve); input.signal.addEventListener("abort", () => resolve(""), { once: true }) }),
      onCompletion: (t) => { delivered.push(t.status) }
    })
    m.enqueue(task(parent))
    await flush()
    await m.stopParent(parent)
    await flush()
    // The completion callback sees the cancelled status (the host layer skips cancelled tasks when it wakes the parent).
    expect(delivered).toEqual(["cancelled"])
  })
})
