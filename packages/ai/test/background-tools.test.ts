import { describe, expect, test } from "bun:test"
import { BACKGROUND_TOOL_IDS, backgroundToolIds, backgroundTools } from "../src/nikcli/background-tools.ts"
import type { BackgroundTask, BackgroundTaskManagerInterface } from "../src/nikcli/background-tasks.ts"

const stubManager = (): BackgroundTaskManagerInterface & { calls: Array<{ method: string; args: unknown[] }> } => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const tasks = new Map<string, BackgroundTask>()
  const owner = { projectId: "p", parentSessionId: "s" }
  const fakeTask: BackgroundTask = {
    id: "11111111-1111-4111-8111-111111111111",
    projectId: "p",
    parentSessionId: "s",
    description: "scan",
    prompt: "look",
    status: "queued"
  }
  tasks.set(fakeTask.id, fakeTask)
  return {
    calls,
    enqueue: (input) => {
      calls.push({ method: "enqueue", args: [input] })
      return fakeTask
    },
    list: (o) => {
      calls.push({ method: "list", args: [o] })
      return [...tasks.values()].filter((t) => t.projectId === o.projectId && t.parentSessionId === o.parentSessionId)
    },
    read: (o, id) => {
      calls.push({ method: "read", args: [o, id] })
      const t = tasks.get(id)
      if (!t || t.projectId !== o.projectId || t.parentSessionId !== o.parentSessionId) {
        throw new Error("not found")
      }
      return t
    },
    cancel: (o, id) => {
      calls.push({ method: "cancel", args: [o, id] })
      const t = tasks.get(id)
      if (!t || t.projectId !== o.projectId || t.parentSessionId !== o.parentSessionId) {
        throw new Error("not found")
      }
      const next: BackgroundTask = { ...t, status: "cancelled" }
      tasks.set(id, next)
      return next
    },
    cancelParent: () => 0,
    dispose: () => Promise.resolve()
  } satisfies BackgroundTaskManagerInterface & { calls: Array<{ method: string; args: unknown[] }> }
}

const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }

describe("background tools", () => {
  test("enumerates four ids in this exact order", () => {
    expect(BACKGROUND_TOOL_IDS).toEqual(["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"])
    expect(backgroundToolIds()).toEqual([...BACKGROUND_TOOL_IDS])
  })

  test("every tool uses the host session context as the parent", async () => {
    const manager = stubManager()
    const tools = backgroundTools(manager)
    expect(tools.map((t) => t.id).sort()).toEqual([...BACKGROUND_TOOL_IDS].sort())

    const enqueued = JSON.parse(await tools[0]!.execute({ description: "scan", prompt: "look" }, ctx))
    expect(enqueued).toEqual(expect.objectContaining({ id: expect.any(String), status: "queued" }))
    expect(manager.calls.at(-1)).toMatchObject({ method: "enqueue", args: [{ description: "scan", prompt: "look", projectId: "p", parentSessionId: "s" }] })

    const listed = JSON.parse(await tools[1]!.execute({}, ctx))
    expect(listed).toEqual([expect.objectContaining({ id: expect.any(String), status: "queued" })])
    expect(manager.calls.at(-1)).toMatchObject({ method: "list", args: [{ projectId: "p", parentSessionId: "s" }] })

    const read = JSON.parse(await tools[2]!.execute({ taskId: "11111111-1111-4111-8111-111111111111" }, ctx))
    expect(read).toEqual(expect.objectContaining({ status: "queued" }))

    const cancelled = JSON.parse(await tools[3]!.execute({ taskId: "11111111-1111-4111-8111-111111111111" }, ctx))
    expect(cancelled).toEqual(expect.objectContaining({ status: "cancelled" }))
  })

  test("rejects malformed inputs with a parse error", async () => {
    const manager = stubManager()
    const tools = backgroundTools(manager)
    await expect(tools[0]!.execute({ description: "" }, ctx)).rejects.toBeDefined()
    await expect(tools[2]!.execute({ taskId: "not-a-uuid" }, ctx)).rejects.toBeDefined()
  })
})