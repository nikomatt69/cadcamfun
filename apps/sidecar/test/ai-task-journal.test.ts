import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { BackgroundTaskManager } from "@cadcamfun/ai"
import { hostname } from "node:os"
import { schema } from "@cadcamfun/db"
import { Context, Effect } from "effect"
import { kvTaskJournal, TASK_JOURNAL_PREFIX } from "../src/services/ai-task-journal.ts"
import { KvStore } from "../src/services/kv.ts"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("the background-task journal in the key-value store (AI-11 Step 9)", () => {
  test("a task written by one manager is recovered by the next, and a row that does not decode is skipped", async () => {
    const kv = Context.get(await app.services(), KvStore)
    const journal = kvTaskJournal(kv)
    await Effect.runPromise(kv.set(`${TASK_JOURNAL_PREFIX}junk`, { id: 7 }))

    // The first process enqueues an edit and dies before its runner reports anything.
    const first = new BackgroundTaskManager({ journal, runner: () => new Promise<string>(() => undefined) })
    const task = first.enqueue({ projectId: "p", parentSessionId: "s", prompt: "Move the bracket", description: "move", edits: true })
    for (let i = 0; i < 50 && (await journal.list()).find((t) => t.id === task.id)?.status !== "running"; i++) await new Promise((r) => setTimeout(r, 5))
    expect((await journal.list()).map((t) => t.id)).toEqual([task.id])

    // The next process does not replay the edit: it reports it uncertain to the parent.
    const told: string[] = []
    const next = new BackgroundTaskManager({ journal, runner: async () => { throw new Error("must not run") }, onCompletion: (t) => { told.push(`${t.id}:${t.status}`) } })
    expect(await next.recover()).toMatchObject({ resumed: [], uncertain: [task.id] })
    for (let i = 0; i < 50 && told.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
    expect(told).toEqual([`${task.id}:error`])
    await next.dispose()
    expect((await journal.list()).find((t) => t.id === task.id)).toMatchObject({ status: "error", delivered: true })
  })
})

describe("the task execution lease after the process that held it is gone", () => {
  const LEASE_KEY = "ai.task-runtime-lease"
  const leaseHeldBy = async (lease: { pid?: number; host?: string }) => {
    const database = await app.database()
    const value = { owner: crypto.randomUUID(), expiresAt: Date.now() + 25_000, ...lease }
    await Effect.runPromise(database.query("test.lease", (db) => db.insert(schema.localKeyValueTable)
      .values({ key: LEASE_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.localKeyValueTable.key, set: { value, updatedAt: new Date() } }).run()))
    return { database, owner: value.owner }
  }
  const deadPid = async (): Promise<number> => {
    const child = Bun.spawn([process.execPath, "-e", "0"])
    await child.exited
    return child.pid
  }

  test("a lease still valid but owned by a process that no longer exists on this host is taken over", async () => {
    const { database } = await leaseHeldBy({ pid: await deadPid(), host: hostname() })
    const journal = kvTaskJournal(Context.get(await app.services(), KvStore), database)
    await journal.acquire!()
    await journal.release!()
  })

  test("a lease owned by a living process, by another host, or by an unknown owner is respected until it expires", async () => {
    for (const lease of [{ pid: process.ppid, host: hostname() }, { pid: await deadPid(), host: "another-machine" }, {}]) {
      const { database } = await leaseHeldBy(lease)
      const journal = kvTaskJournal(Context.get(await app.services(), KvStore), database)
      const refused = await journal.acquire!().then(() => undefined, (error: unknown) => error)
      expect(refused).toBeDefined()
      // The effect runtime wraps the failure; the lease message is somewhere in what it carries.
      expect(JSON.stringify(refused, Object.getOwnPropertyNames(refused as object)) + String(refused)).toContain("Another AI task runtime owns the execution lease")
    }
  })
})
