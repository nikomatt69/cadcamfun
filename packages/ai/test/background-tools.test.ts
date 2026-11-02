import { describe, expect, test } from "bun:test"
import { BACKGROUND_TOOL_IDS, backgroundToolContributions, backgroundToolIds, baselineSection } from "../src/nikcli/background-tools.ts"
import { buildTools } from "../src/tools/catalogue.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { BackgroundTaskManagerError, type BackgroundTask, type BackgroundTaskManagerInterface } from "../src/nikcli/background-tasks.ts"

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
    wait: async (o, id) => {
      calls.push({ method: "wait", args: [o, id] })
      return { ...fakeTask, status: "completed", text: "report" }
    },
    dispose: () => Promise.resolve()
  } satisfies BackgroundTaskManagerInterface & { calls: Array<{ method: string; args: unknown[] }> }
}

const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal, handlers: {} as ToolHandlersShape }
const call = () => ({ signal: new AbortController().signal, sessionId: "s", projectId: "p" })
/** The `agent` tool as the host registers it, with the delegation contributions in place. */
const agentTool = (manager: BackgroundTaskManagerInterface) =>
  buildTools({} as ToolHandlersShape, "p", [], backgroundToolContributions(manager)).find((tool) => tool.id === "agent")!

describe("background tools", () => {
  test("delegation is one tool of the catalogue", () => {
    expect(BACKGROUND_TOOL_IDS).toEqual(["agent"])
    expect(backgroundToolIds()).toEqual([...BACKGROUND_TOOL_IDS])
  })

  test("every action uses the host session context as the parent", async () => {
    const manager = stubManager()
    const tool = agentTool(manager)
    expect(tool).toBeDefined()

    const started = JSON.parse(await tool.execute({ action: "start", description: "scan", prompt: "look" }, call()))
    expect(started).toEqual(expect.objectContaining({ id: expect.any(String), status: "queued" }))
    expect(manager.calls.at(-1)).toMatchObject({ method: "enqueue", args: [{ description: "scan", prompt: "look", projectId: "p", parentSessionId: "s" }] })

    const listed = JSON.parse(await tool.execute({ action: "list" }, call()))
    expect(listed).toEqual([expect.objectContaining({ id: expect.any(String), status: "queued" })])
    expect(manager.calls.at(-1)).toMatchObject({ method: "list", args: [{ projectId: "p", parentSessionId: "s" }] })

    const read = JSON.parse(await tool.execute({ action: "read", taskId: "11111111-1111-4111-8111-111111111111" }, call()))
    expect(read).toEqual(expect.objectContaining({ status: "queued" }))

    const cancelled = JSON.parse(await tool.execute({ action: "cancel", taskId: "11111111-1111-4111-8111-111111111111" }, call()))
    expect(cancelled).toEqual(expect.objectContaining({ status: "cancelled" }))
  })

  test("malformed arguments are refused by the action's own schema, before the manager is called", async () => {
    const manager = stubManager()
    const tool = agentTool(manager)
    const before = manager.calls.length
    expect(JSON.parse(await tool.execute({ action: "start", description: "" }, call())).ok).toBe(false)
    expect(JSON.parse(await tool.execute({ action: "read", taskId: "not-a-uuid" }, call())).ok).toBe(false)
    expect(manager.calls.length).toBe(before)
  })

  test("the contribution refuses without a host session instead of guessing an owner", async () => {
    const manager = stubManager()
    expect(await backgroundToolContributions(manager)["agent.list"]!({} as never, { sessionId: undefined, projectId: "p", handlers: {} as never })).toMatchObject({ ok: false })
    expect(manager.calls.length).toBe(0)
  })

  test("the specialist is told which drawing and revision the brief was written against", async () => {
    const manager = stubManager()
    const tool = agentTool(manager)
    await tool.execute({ action: "start", description: "bore", agent: "editor", brief: { objective: "Make bore h1 8 mm", ids: ["h1"] } }, { ...call(), taskTarget: { drawingId: "d-7", revision: "r42" } })
    const prompt = (manager.calls.at(-1)!.args[0] as { prompt: string }).prompt
    expect(prompt).toContain("Objective: Make bore h1 8 mm")
    expect(prompt).toContain("Document baseline")
    expect(prompt).toContain("- Drawing: d-7")
    expect(prompt).toContain("- Revision: r42")
    expect(prompt).toContain("re-read the targets")
    // No target, no section: a host without a drawing gets the brief as written.
    await tool.execute({ action: "start", description: "scan", prompt: "look" }, call())
    expect((manager.calls.at(-1)!.args[0] as { prompt: string }).prompt).toBe("look")
    expect(baselineSection({})).toBe("")
    expect(baselineSection(undefined)).toBe("")
  })

  test("the model reads a task without its own brief, and a list gives report sizes, not reports", async () => {
    const manager = stubManager()
    const done: BackgroundTask = { id: "22222222-2222-4222-8222-222222222222", projectId: "p", parentSessionId: "s", description: "scan", prompt: "SECRET BRIEF", status: "completed", text: "x".repeat(5_000), target: { revision: "r1" }, childSessionId: "child" }
    manager.list = () => [done]
    manager.read = () => done
    const tool = agentTool(manager)
    const listed = JSON.parse(await tool.execute({ action: "list" }, call())) as Array<Record<string, unknown>>
    expect(listed[0]).toMatchObject({ id: done.id, status: "completed", reportChars: 5_000 })
    expect(listed[0]).not.toHaveProperty("text")
    expect(listed[0]).not.toHaveProperty("prompt")
    const read = JSON.parse(await tool.execute({ action: "read", taskId: done.id }, call()))
    expect(read.text).toHaveLength(5_000)
    expect(read).not.toHaveProperty("prompt")
    expect(read).not.toHaveProperty("target")
    expect(read).not.toHaveProperty("childSessionId")
  })

  test("a full queue is refused with what to do about it", async () => {
    const manager = stubManager()
    manager.enqueue = () => { throw new BackgroundTaskManagerError("queue_full", "Background task queue is full") }
    const result = JSON.parse(await agentTool(manager).execute({ action: "start", description: "scan", prompt: "look" }, call()))
    expect(result.ok).toBe(false)
    expect(result.error).toContain("cancel the jobs you no longer need")
    expect(result.error).toContain("background false")
  })
})
