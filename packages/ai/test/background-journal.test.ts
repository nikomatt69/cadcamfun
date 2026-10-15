import { describe, expect, test } from "bun:test"
import { BackgroundTaskManager, MAX_TASK_ATTEMPTS, TASK_RETENTION_MS, type BackgroundTask, type BackgroundTaskJournal } from "../src/nikcli/background-tasks.ts"

/** An in-memory journal that records the order of writes. */
const memoryJournal = (seed: ReadonlyArray<BackgroundTask> = []) => {
  const rows = new Map(seed.map((task) => [task.id, { ...task }]))
  const writes: BackgroundTask[] = []
  let failing = false
  const journal: BackgroundTaskJournal = {
    write: async (task) => {
      if (failing) throw new Error("disk full")
      writes.push({ ...task })
      rows.set(task.id, { ...task })
    },
    list: async () => [...rows.values()],
    remove: async (id) => { rows.delete(id) }
  }
  return { journal, rows, writes, fail: () => { failing = true } }
}

const owner = { projectId: "p", parentSessionId: "parent" }
const base = { ...owner, prompt: "Measure the bracket", description: "measure" }
const settle = (manager: BackgroundTaskManager, id: string) => manager.wait(owner, id)
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5))
}

describe("the task journal (AI-11 Step 9)", () => {
  test("a task is in the journal before its runner starts, and its outcome before anyone is told", async () => {
    const memory = memoryJournal()
    const seenByRunner: Array<BackgroundTask | undefined> = []
    const seenByDelivery: Array<BackgroundTask | undefined> = []
    const manager = new BackgroundTaskManager({
      journal: memory.journal,
      runner: async (input) => { seenByRunner.push(memory.rows.get([...memory.rows.keys()][0]!)); await input.report?.("found 4 holes"); return "found 4 holes" },
      onCompletion: (task) => { seenByDelivery.push(memory.rows.get(task.id)) }
    })
    const task = manager.enqueue(base)
    await settle(manager, task.id)
    await until(() => memory.rows.get(task.id)?.delivered === true)
    await manager.dispose()
    expect(seenByRunner[0]).toMatchObject({ id: task.id, status: "running", attempt: 1 })
    expect(seenByDelivery[0]).toMatchObject({ id: task.id, status: "completed", text: "found 4 holes" })
    // The report was written while the run was still open (before the native session goes away), then the outcome.
    const statuses = memory.writes.map((write) => `${write.status}${write.text !== undefined ? ":text" : ""}`)
    expect(statuses.indexOf("running:text")).toBeGreaterThan(-1)
    expect(statuses.indexOf("running:text")).toBeLessThan(statuses.indexOf("completed:text"))
    // Once handed over, the record says so: a restart does not deliver it twice.
    expect(memory.rows.get(task.id)).toMatchObject({ status: "completed", delivered: true })
  })

  test("a task the journal cannot record never runs", async () => {
    const memory = memoryJournal()
    memory.fail()
    let ran = 0
    const manager = new BackgroundTaskManager({ journal: memory.journal, runner: async () => { ran++; return "" } })
    const task = manager.enqueue(base)
    const settled = await settle(manager, task.id)
    await manager.dispose()
    expect(ran).toBe(0)
    expect(settled).toMatchObject({ status: "error", error: "disk full" })
  })

  test("a cancelled task is declared stopped only after its runner has stopped", async () => {
    const memory = memoryJournal()
    let stopped = false
    const manager = new BackgroundTaskManager({
      journal: memory.journal,
      runner: (input) => new Promise((_, reject) => input.signal.addEventListener("abort", () => setTimeout(() => { stopped = true; reject(new Error("stopped")) }, 30)))
    })
    const task = manager.enqueue(base)
    await new Promise((resolve) => setTimeout(resolve, 10))
    manager.cancel(owner, task.id)
    const settled = await settle(manager, task.id)
    expect(stopped).toBe(true)
    expect(settled.status).toBe("cancelled")
    await until(() => memory.rows.get(task.id)?.delivered === true)
    await manager.dispose()
    expect(memory.rows.get(task.id)).toMatchObject({ status: "cancelled", delivered: true })
  })
})

describe("recovery after a restart", () => {
  const now = 10 * TASK_RETENTION_MS
  const stored = (id: string, fields: Partial<BackgroundTask>): BackgroundTask => ({ ...base, id, status: "running", attempt: 1, createdAt: now - 1000, startedAt: now - 900, ...fields })

  test("readers run again within their attempts, editors are reported uncertain and never replayed, outcomes are handed over once", async () => {
    const memory = memoryJournal([
      stored("reader", {}),
      stored("reader-tired", { attempt: MAX_TASK_ATTEMPTS }),
      stored("editor", { edits: true, agent: "editor" }),
      stored("finished", { status: "completed", text: "report", finishedAt: now - 500 }),
      stored("handed", { status: "completed", text: "old", finishedAt: now - 500, delivered: true }),
      stored("ancient", { status: "completed", text: "older", finishedAt: now - TASK_RETENTION_MS - 1, delivered: true }),
      stored("stopped", { status: "cancelled", finishedAt: now - 500 })
    ])
    const ran: string[] = []
    const delivered: BackgroundTask[] = []
    const manager = new BackgroundTaskManager({ journal: memory.journal, now: () => now, onCompletion: (task) => { delivered.push(task) } })
    manager.setRunner(async (input) => { ran.push(input.prompt); return "measured again" })
    const recovery = await manager.recover()
    expect(recovery).toEqual({ resumed: ["reader"], uncertain: ["reader-tired", "editor"], redelivered: ["finished"], pruned: 1 })

    expect(await settle(manager, "reader")).toMatchObject({ status: "completed", attempt: 2, text: "measured again" })
    expect(ran).toEqual([base.prompt])
    const editor = await settle(manager, "editor")
    expect(editor.status).toBe("error")
    expect(editor.error).toContain("uncertain")
    await until(() => ["reader", "reader-tired", "editor", "finished"].every((id) => memory.rows.get(id)?.delivered === true))
    await manager.dispose()

    expect(delivered.map((task) => task.id).sort()).toEqual(["editor", "finished", "reader", "reader-tired"])
    expect(memory.rows.has("ancient")).toBe(false)
    for (const id of ["reader", "reader-tired", "editor", "finished"]) expect(memory.rows.get(id)?.delivered, id).toBe(true)
    // A second recovery finds nothing left to do.
    const again = new BackgroundTaskManager({ journal: memory.journal, now: () => now, runner: async () => "x", onCompletion: (task) => { delivered.push(task) } })
    const before = delivered.length
    expect(await again.recover()).toEqual({ resumed: [], uncertain: [], redelivered: [], pruned: 0 })
    await again.dispose()
    expect(delivered.length).toBe(before)
  })
})
