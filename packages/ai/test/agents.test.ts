import { describe, expect, test } from "bun:test"
import { adoptChildSession, SUBAGENT_IDS, SUBAGENTS } from "../src/nikcli/agents.ts"
import { BackgroundTaskManager, type BackgroundTaskRunnerInput } from "../src/nikcli/background-tasks.ts"
import { backgroundTools } from "../src/nikcli/background-tools.ts"
import { buildHostConfig, defaultProviderSpecs } from "../src/nikcli/config.ts"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

const VCS_IDS = ["vcs_status", "vcs_start_change", "vcs_commit", "vcs_diff", "vcs_open_pull_request", "vcs_list_pull_requests", "actions_run"]
const REGISTERED = [...TOOL_IDS, ...VCS_IDS, "agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"]

describe("specialist roster", () => {
  test("every tool a specialist names exists, and only the editors can change the document", () => {
    for (const id of SUBAGENT_IDS) {
      for (const tool of SUBAGENTS[id].tools) expect(REGISTERED).toContain(tool)
    }
    const MUTATING = /^(cad_(add|modify|transform|group|delete|import|editor)|cam_(create|update|generate|verify))/
    expect(SUBAGENTS.researcher.tools.filter((t) => MUTATING.test(t))).toEqual([])
    expect(SUBAGENTS.editor.tools.filter((t) => t.startsWith("cam_"))).toEqual([])
    expect(SUBAGENTS.editor.tools).toContain("cad_modify_entities")
    expect(SUBAGENTS.machinist.tools.filter((t) => t.startsWith("cad_") && MUTATING.test(t))).toEqual([])
    // Committing and opening the pull request stay with the main agent.
    for (const id of SUBAGENT_IDS) for (const t of SUBAGENTS[id].tools) expect(["vcs_start_change", "vcs_commit", "vcs_open_pull_request"]).not.toContain(t)
  })

  test("the host config has one deny-by-default agent per specialist with only its tools", () => {
    const config = buildHostConfig({ providers: defaultProviderSpecs(), toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { mode: string; permission: Record<string, string>; steps: number }> }
    for (const id of SUBAGENT_IDS) {
      const agent = config.agent[SUBAGENTS[id].host]!
      expect(agent.mode).toBe("subagent")
      expect(agent.permission["*"]).toBe("deny")
      const allowed = Object.keys(agent.permission).filter((k) => agent.permission[k] === "allow" && k !== "skill" && k !== "code_mode").sort()
      expect(allowed).toEqual([...SUBAGENTS[id].tools, "invalid", "search_tools", "question"].sort())
      expect(agent.permission["task"]).toBeUndefined()
    }
    expect(config.agent["cadcam-editor"]!.permission["cam_generate_gcode"]).toBeUndefined()
    expect(config.agent["cadcam"]!.permission["task"]).toBe("deny")
  })

  test("permission modes use native evaluation and preserve role denials", () => {
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { permission_mode?: string; permission: Record<string, string> }> }
    expect(config.agent["cadcam-auto"]?.permission_mode).toBe("auto")
    expect(config.agent["cadcam-ask"]?.permission_mode).toBe("default")
    expect(config.agent["cadcam-ask"]?.permission["cad_parametric"]).toBe("ask")
    expect(config.agent["cadcam"]?.permission["cad_parametric"]).toBe("allow")
    expect(config.agent["cadcam-modeler-auto"]?.permission["cam_create_operation"]).toBeUndefined()
    expect(config.agent["cadcam-modeler-auto"]?.permission["*"]).toBe("deny")
  })

  test("a tool the project did not register is left out of the specialist's permissions", () => {
    const config = buildHostConfig({ providers: defaultProviderSpecs(), toolIds: ["cad_describe_drawing"], systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    expect(config.agent["cadcam-editor"]!.permission["cad_modify_entities"]).toBeUndefined()
    expect(config.agent["cadcam-editor"]!.permission["cad_describe_drawing"]).toBe("allow")
  })
})

const owner = { projectId: "p", parentSessionId: "s" }
const gate = () => {
  let open!: () => void
  const promise = new Promise<void>((r) => (open = r))
  return { promise, open }
}

describe("task manager with specialists", () => {
  test("wait returns the finished task", async () => {
    const manager = new BackgroundTaskManager({ runner: async () => "report" })
    const task = manager.enqueue({ ...owner, description: "d", prompt: "p", agent: "editor", edits: true, background: false })
    const done = await manager.wait(owner, task.id)
    expect(done).toMatchObject({ status: "completed", text: "report", agent: "editor", background: false })
    await manager.dispose()
  })

  test("editing tasks of one project run one at a time, others in parallel", async () => {
    const hold = gate()
    const running: string[] = []
    let peak = 0
    const runner = async (input: BackgroundTaskRunnerInput) => {
      running.push(input.description)
      peak = Math.max(peak, running.length)
      await hold.promise
      running.splice(running.indexOf(input.description), 1)
      return "ok"
    }
    const manager = new BackgroundTaskManager({ runner })
    const a = manager.enqueue({ ...owner, description: "a", prompt: "p", edits: true })
    const b = manager.enqueue({ ...owner, description: "b", prompt: "p", edits: true })
    const reader = manager.enqueue({ ...owner, description: "r", prompt: "p" })
    const other = manager.enqueue({ projectId: "q", parentSessionId: "t", description: "o", prompt: "p", edits: true })
    await new Promise((r) => setTimeout(r, 20))
    expect(manager.read(owner, a.id).status).toBe("running")
    expect(manager.read(owner, b.id).status).toBe("queued")
    expect(manager.read(owner, reader.id).status).toBe("running")
    expect(manager.read({ projectId: "q", parentSessionId: "t" }, other.id).status).toBe("running")
    hold.open()
    await manager.wait(owner, b.id)
    expect(manager.read(owner, b.id).status).toBe("completed")
    expect(peak).toBeLessThanOrEqual(3)
    await manager.dispose()
  })

  test("aborting the waiting call cancels the task", async () => {
    const manager = new BackgroundTaskManager({ runner: (input) => new Promise((_, reject) => input.signal.addEventListener("abort", () => reject(new Error("stopped")))) })
    const task = manager.enqueue({ ...owner, description: "d", prompt: "p", edits: true, background: false })
    const controller = new AbortController()
    const waiting = manager.wait(owner, task.id, controller.signal)
    controller.abort()
    expect((await waiting).status).toBe("cancelled")
    await manager.dispose()
  })
})

const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const agentTask = (manager: BackgroundTaskManager) => backgroundTools(manager).find((t) => t.id === "agent_task")!

describe("agent_task", () => {
  test("an editing specialist is waited for and its report is the call's result", async () => {
    const seen: BackgroundTaskRunnerInput[] = []
    const manager = new BackgroundTaskManager({ runner: async (input) => (seen.push(input), "moved the bracket") })
    const result = JSON.parse(await agentTask(manager).execute({ description: "move", prompt: "move box-1 up 20", agent: "editor" }, ctx))
    expect(result).toMatchObject({ status: "completed", text: "moved the bracket", agent: "editor" })
    expect(seen[0]).toMatchObject({ agent: "editor", edits: true, background: false })
    await manager.dispose()
  })

  test("a researcher returns at once; the nikcli spelling and the host name both resolve", async () => {
    const hold = gate()
    const manager = new BackgroundTaskManager({ runner: async () => (await hold.promise, "found") })
    const queued = JSON.parse(await agentTask(manager).execute({ description: "d", prompt: "p" }, ctx))
    expect(queued).toMatchObject({ background: true, agent: "researcher" })
    expect(["queued", "running"]).toContain(queued.status)
    const alias = JSON.parse(await agentTask(manager).execute({ description: "d", prompt: "p", subagent_type: "cadcam-machinist", background: "true", extra: 1 }, ctx))
    expect(alias).toMatchObject({ agent: "machinist", edits: true, background: true })
    hold.open()
    await manager.dispose()
  })

  test("an unknown agent is refused with the names to use", async () => {
    const manager = new BackgroundTaskManager({ runner: async () => "x" })
    await expect(agentTask(manager).execute({ description: "d", prompt: "p", agent: "welder" }, ctx)).rejects.toThrow(/editor, modeler, machinist|researcher, editor/)
    await manager.dispose()
  })
})

describe("specialist events reach the parent's stream", () => {
  const part = (sessionID: string, type: string, extra: Record<string, unknown>) => ({ type: "message.part.updated", properties: { part: { sessionID, messageID: "m", type, ...extra }, delta: extra["text"] } })

  test("a child's tool calls are forwarded with the agent; its text is not", () => {
    const release = adoptChildSession("parent", "child", "editor")
    const state = newMapperState()
    const call = part("child", "tool", { callID: "c1", tool: "cad_modify_entities", state: { status: "running", input: { id: "a" } } })
    const done = part("child", "tool", { callID: "c1", tool: "cad_modify_entities", state: { status: "completed", output: "{\"ok\":true}" } })
    expect(mapHostEvent("parent", call, state)).toEqual([{ type: "tool_call", sessionId: "parent", agent: "editor", callId: "child:c1", tool: "cad_modify_entities", input: { id: "a" } }])
    expect(mapHostEvent("parent", done, state)).toEqual([{ type: "tool_result", sessionId: "parent", agent: "editor", callId: "child:c1", tool: "cad_modify_entities", ok: true, output: "{\"ok\":true}" }])
    expect(mapHostEvent("parent", part("child", "text", { text: "hello" }), state)).toEqual([])
    expect(mapHostEvent("parent", part("child", "tool", { callID: "t", tool: "todowrite", state: { status: "running", input: {} } }), state)).toEqual([])
    release()
    expect(mapHostEvent("parent", part("child", "tool", { callID: "c2", tool: "cad_describe_drawing", state: { status: "running", input: {} } }), state)).toEqual([])
  })

  test("a session that is nobody's child stays out", () => {
    expect(mapHostEvent("parent", part("stranger", "tool", { callID: "c", tool: "cad_describe_drawing", state: { status: "running", input: {} } }), newMapperState())).toEqual([])
  })
})
