import { describe, expect, test } from "bun:test"
import { PRIMARIES, PRIMARY_IDS, resolvePrimary } from "../src/nikcli/primaries.ts"
import { adoptChildSession, SUBAGENT_IDS, SUBAGENTS, subagentCatalogue } from "../src/nikcli/agents.ts"
import { BackgroundTaskManager, type BackgroundTaskRunnerInput } from "../src/nikcli/background-tasks.ts"
import { backgroundToolContributions } from "../src/nikcli/background-tools.ts"
import { buildHostConfig, defaultProviderSpecs } from "../src/nikcli/config.ts"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"
import { ACTION_CATALOGUE, EXPOSED_TOOL_IDS, exposedActions, toolKind } from "../src/actions/catalogue.ts"
import { DESTRUCTIVE_TOOL_IDS, READ_TOOL_IDS, WRITE_TOOL_IDS } from "../src/tools/project-tools.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

const REGISTERED = [...TOOL_IDS]

describe("specialist roster", () => {
  test("a tool that contains a destructive action requires native approval, in every role", () => {
    expect(DESTRUCTIVE_TOOL_IDS.length).toBeGreaterThan(0)
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    for (const id of DESTRUCTIVE_TOOL_IDS) {
      for (const name of ["cadcam", "cadcam-ask"]) expect(config.agent[name]!.permission[id], name).toBe("ask")
    }
    // The editor deletes elements and the machinist removes library rows: both ask, and the researcher has neither tool.
    // The researcher's host name is the worker's (`cadcam-worker`), not a name spelled after the specialist.
    expect(config.agent["cadcam-editor"]!.permission["cad_edit"]).toBe("ask")
    expect(config.agent["cadcam-machinist"]!.permission["library_edit"]).toBe("ask")
    expect(config.agent[SUBAGENTS.researcher.host]!.permission["cad_edit"]).toBeUndefined()
    expect(config.agent[SUBAGENTS.researcher.host]!.permission["cad"]).toBe("allow")
  })

  test("read-only specialists cannot persist verification, write memory, the libraries or dispatch workflows", () => {
    for (const id of ["researcher", "reviewer"] as const) {
      expect(SUBAGENTS[id].edits).toBe(false)
      for (const tool of ["cam_edit", "vcs_edit", "memory_edit", "library_edit", "cad_edit", "parts", "agent"]) {
        expect(SUBAGENTS[id].tools, `${id} must not have ${tool}`).not.toContain(tool)
      }
    }
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    for (const id of ["researcher", "reviewer"] as const) {
      for (const suffix of ["", "-auto", "-ask"]) {
        const permission = config.agent[`${SUBAGENTS[id].host}${suffix}`]!.permission
        expect(permission["**"]).toBe("deny")
        for (const tool of WRITE_TOOL_IDS) expect(permission[tool], `${tool} must stay denied`).toBeUndefined()
      }
    }
  })

  test("every tool a specialist names exists, and only the editors can change the document", () => {
    for (const id of SUBAGENT_IDS) for (const tool of SUBAGENTS[id].tools) expect(EXPOSED_TOOL_IDS).toContain(tool)
    // Derived from the catalogue's effects, not from a hand-written list of ids.
    for (const id of SUBAGENT_IDS) {
      const writes = SUBAGENTS[id].tools.filter((tool) => toolKind(tool) !== "read")
      // A specialist holds a write tool exactly when it edits the document: a role that edits without a write tool
      // cannot do its job, and one that holds a write tool without `edits` would mutate behind the parent's back.
      expect(writes.length > 0, `${id} writes: ${writes.join(", ")}`).toBe(SUBAGENTS[id].edits)
    }
    // Both read-only specialists see the CAD, CAM, library and version-control reads. `research` is the researcher's
    // own instrument (web search, attachments); the reviewer reasons from the project and does not search.
    for (const id of ["researcher", "reviewer"] as const) for (const tool of READ_TOOL_IDS.filter((t) => t !== "research")) {
      expect(SUBAGENTS[id].tools, `${id} must read ${tool}`).toContain(tool)
    }
    expect(SUBAGENTS.reviewer.tools).not.toContain("research")
    expect(SUBAGENTS.editor.tools).toContain("cad_edit")
    expect(SUBAGENTS.editor.tools).not.toContain("cam_edit")
    expect(SUBAGENTS.machinist.tools).toContain("cam_edit")
    expect(SUBAGENTS.machinist.tools).not.toContain("cad_edit")
    expect(SUBAGENTS.modeler.tools).toContain("cad_edit")
    expect(SUBAGENTS.modeler.tools).not.toContain("cam_edit")
    // Committing and opening the pull request stay with the main agent.
    for (const id of SUBAGENT_IDS) expect(SUBAGENTS[id].tools).not.toContain("vcs_edit")
    for (const id of SUBAGENT_IDS) expect(SUBAGENTS[id].tools).not.toContain("agent")
    // A repeated id would silently widen (or narrow) a permission map, and the host config reflects the set it builds.
    for (const id of SUBAGENT_IDS) expect(new Set(SUBAGENTS[id].tools).size).toBe(SUBAGENTS[id].tools.length)
    // Every role that reasons about machining or parts reads the user's libraries.
    for (const id of SUBAGENT_IDS) expect(SUBAGENTS[id].tools, `${id} must read the libraries`).toContain("library")
    // Only the machinist writes them.
    expect(SUBAGENTS.machinist.tools).toContain("library_edit")
    for (const id of SUBAGENT_IDS.filter((other) => other !== "machinist")) expect(SUBAGENTS[id].tools).not.toContain("library_edit")
  })

  test("a tool's permission class is its strongest action, so a read-only role never reaches a write", () => {
    for (const tool of EXPOSED_TOOL_IDS) {
      const kinds = new Set(exposedActions(tool).map((action) => action.kind))
      // Honest reads may sit beside writes (listing delegated tasks); the tool is then a write tool and asks as one.
      expect(toolKind(tool), tool).toBe(kinds.has("destructive") ? "destructive" : kinds.has("write") ? "write" : "read")
    }
    for (const id of SUBAGENT_IDS.filter((other) => !SUBAGENTS[other].edits)) {
      for (const tool of SUBAGENTS[id].tools) expect(toolKind(tool), `${id} holds ${tool}`).toBe("read")
    }
  })

  test("the verifier's exposure carries generate and verify only, under their canonical ids", () => {
    expect(exposedActions("cam_verify").map((action) => action.id)).toEqual(["cam_edit.generate", "cam_edit.verify"])
    expect(ACTION_CATALOGUE.some((action) => action.id.startsWith("cam_verify."))).toBe(false)
    expect(toolKind("cam_verify")).toBe("write")
  })

  test("the host config has one deny-by-default agent per specialist with only its tools", () => {
    const config = buildHostConfig({ providers: defaultProviderSpecs(), toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { mode: string; permission: Record<string, string>; steps: number }> }
    for (const id of SUBAGENT_IDS) {
      const agent = config.agent[SUBAGENTS[id].host]!
      expect(agent.mode).toBe("subagent")
      expect(agent.permission["**"]).toBe("deny")
      const allowed = Object.keys(agent.permission).filter((k) => ["allow", "ask"].includes(agent.permission[k]!) && k !== "skill" && k !== "code_mode").sort()
      expect(allowed).toEqual([...SUBAGENTS[id].tools, "invalid", "search_tools", "question"].sort())
      expect(agent.permission["task"]).toBeUndefined()
    }
    expect(config.agent["cadcam-editor"]!.permission["cam_edit"]).toBeUndefined()
    expect(config.agent["cadcam"]!.permission["task"]).toBe("deny")
  })

  test("three primary agents (plus the internal memory consolidator), every other agent a subagent", () => {
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "base" }) as { agent: Record<string, { mode: string; prompt?: string; permission: Record<string, string> }> }
    expect(PRIMARY_IDS).toEqual(["general", "cad", "cam"])
    expect(Object.entries(config.agent).filter(([name, spec]) => spec.mode === "primary" && name !== "cadcam-memory" && !/-(ask|auto)$/.test(name)).map(([name]) => name).sort())
      .toEqual(PRIMARY_IDS.map((id) => PRIMARIES[id].host).sort())
    for (const id of SUBAGENT_IDS) expect(config.agent[SUBAGENTS[id].host]!.mode).toBe("subagent")
    // The legacy host name is the general agent, and a subagent id is not a primary.
    expect(resolvePrimary(undefined)).toBe("general")
    expect(resolvePrimary("cadcam")).toBe("general")
    expect(resolvePrimary("modeler")).toBeUndefined()
  })

  test("the CAD primary changes the drawing and the CAM primary the machining; both read both and delegate", () => {
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "base" }) as { agent: Record<string, { prompt?: string; permission: Record<string, string> }> }
    const general = config.agent[PRIMARIES.general.host]!
    const cad = config.agent[PRIMARIES.cad.host]!
    const cam = config.agent[PRIMARIES.cam.host]!
    for (const tool of ["cad_edit", "parts", "cam_edit", "library_edit"]) expect(general.permission[tool], `general ${tool}`).toBeDefined()
    expect(cad.permission["cad_edit"]).toBeDefined()
    expect(cad.permission["parts"]).toBeDefined()
    for (const tool of ["cam_edit", "library_edit"]) expect(cad.permission[tool], `cad ${tool}`).toBeUndefined()
    expect(cam.permission["cam_edit"]).toBeDefined()
    expect(cam.permission["library_edit"]).toBeDefined()
    for (const tool of ["cad_edit", "parts"]) expect(cam.permission[tool], `cam ${tool}`).toBeUndefined()
    for (const agent of [general, cad, cam]) for (const tool of ["cad", "cam", "library", "vcs", "memory", "agent"]) expect(agent.permission[tool]).toBeDefined()
    // Variants keep the narrowing, and the focus reaches the prompt.
    expect(config.agent["cadcam-cam-auto"]!.permission["cad_edit"]).toBeUndefined()
    expect(general.prompt).toBe("base")
    expect(cad.prompt).toContain("CAD agent")
    expect(cam.prompt).toContain("CAM agent")
  })

  test("permission modes use native evaluation and preserve role denials", () => {
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { permission_mode?: string; permission: Record<string, string> }> }
    expect(config.agent["cadcam-auto"]?.permission_mode).toBe("auto")
    expect(config.agent["cadcam-ask"]?.permission_mode).toBe("default")
    expect(config.agent["cadcam-ask"]?.permission["cad_edit"]).toBe("ask")
    expect(config.agent["cadcam"]?.permission["cad_edit"]).toBe("ask")
    expect(config.agent["cadcam"]?.permission["cam"]).toBe("allow")
    expect(config.agent["cadcam-modeler-auto"]?.permission["cam_edit"]).toBeUndefined()
    expect(config.agent["cadcam-modeler-auto"]?.permission["**"]).toBe("deny")
  })

  test("a tool the project did not register is left out of the specialist's permissions", () => {
    const config = buildHostConfig({ providers: defaultProviderSpecs(), toolIds: ["cad"], systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    expect(config.agent["cadcam-editor"]!.permission["cad_edit"]).toBeUndefined()
    expect(config.agent["cadcam-editor"]!.permission["cad"]).toBe("allow")
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

const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal, handlers: {} as never }
const start = (manager: BackgroundTaskManager) => backgroundToolContributions(manager)["agent.start"]!

describe("agent.start", () => {
  test("an editing specialist is waited for and its report is the call's result", async () => {
    const seen: BackgroundTaskRunnerInput[] = []
    const manager = new BackgroundTaskManager({ runner: async (input) => (seen.push(input), "moved the bracket") })
    const result = await start(manager)({ description: "move", prompt: "move box-1 up 20", agent: "editor" } as never, ctx)
    expect(result).toMatchObject({ status: "completed", text: "moved the bracket", agent: "editor" })
    expect(seen[0]).toMatchObject({ agent: "editor", edits: true, background: false })
    await manager.dispose()
  })

  test("a researcher returns at once; the nikcli spelling and the host name both resolve", async () => {
    const hold = gate()
    const manager = new BackgroundTaskManager({ runner: async () => (await hold.promise, "found") })
    const queued = await start(manager)({ description: "d", prompt: "p" } as never, ctx)
    expect(queued).toMatchObject({ background: true, agent: "researcher" })
    expect(["queued", "running"]).toContain((queued as { status: string }).status)
    const alias = await start(manager)({ description: "d", prompt: "p", subagent_type: "cadcam-machinist", background: "true" } as never, ctx)
    expect(alias).toMatchObject({ agent: "machinist", edits: true, background: true })
    hold.open()
    await manager.dispose()
  })

  test("an unknown agent is refused with the names to use, not thrown", async () => {
    const manager = new BackgroundTaskManager({ runner: async () => "x" })
    const refused = await start(manager)({ description: "d", prompt: "p", agent: "welder" } as never, ctx) as { ok: boolean; error: string }
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/researcher, editor, modeler, machinist, reviewer/)
    await manager.dispose()
  })
})

describe("specialist events reach the parent's stream", () => {
  const part = (sessionID: string, type: string, extra: Record<string, unknown>) => ({ type: "message.part.updated", properties: { part: { sessionID, messageID: "m", type, ...extra }, delta: extra["text"] } })

  test("a child's tool calls are forwarded with the agent; its text is not", () => {
    const release = adoptChildSession("parent", "child", "editor")
    const state = newMapperState()
    const call = part("child", "tool", { callID: "c1", tool: "cad_edit", state: { status: "running", input: { action: "modify" } } })
    const done = part("child", "tool", { callID: "c1", tool: "cad_edit", state: { status: "completed", output: "{\"ok\":true}" } })
    expect(mapHostEvent("parent", call, state)).toEqual([{ type: "tool_call", sessionId: "parent", agent: "editor", callId: "child:c1", tool: "cad_edit", input: { action: "modify" } }])
    expect(mapHostEvent("parent", done, state)).toEqual([{ type: "tool_result", sessionId: "parent", agent: "editor", callId: "child:c1", tool: "cad_edit", ok: true, output: "{\"ok\":true}" }])
    expect(mapHostEvent("parent", part("child", "text", { text: "hello" }), state)).toEqual([])
    expect(mapHostEvent("parent", part("child", "tool", { callID: "t", tool: "todowrite", state: { status: "running", input: {} } }), state)).toEqual([])
    release()
    expect(mapHostEvent("parent", part("child", "tool", { callID: "c2", tool: "cad", state: { status: "running", input: { action: "describe" } } }), state)).toEqual([])
  })

  test("a session that is nobody's child stays out", () => {
    expect(mapHostEvent("parent", part("stranger", "tool", { callID: "c", tool: "cad", state: { status: "running", input: { action: "describe" } } }), newMapperState())).toEqual([])
  })
})
describe("the nikcli-style roster for CAD/CAM", () => {
  const NIKCLI_STYLE = ["planner", "diagnostician", "verifier", "optimizer"] as const
  const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string>; prompt: string; mode: string }> }

  test("each has its own title, host agent and role prompt on top of the shared contract", () => {
    const prompts = new Set<string>()
    for (const id of NIKCLI_STYLE) {
      const spec = SUBAGENTS[id]
      expect(spec.title.length, id).toBeGreaterThan(3)
      expect(spec.host, id).toBe(`cadcam-${id}`)
      expect(spec.prompt, id).toContain("You are a specialist agent of the CAD/CAM assistant")
      expect(spec.prompt, id).toContain("Final message")
      prompts.add(spec.prompt)
      expect(config.agent[spec.host]!.mode, id).toBe("subagent")
      expect(config.agent[spec.host]!.prompt, id).toBe(spec.prompt)
    }
    expect(prompts.size).toBe(NIKCLI_STYLE.length)
  })

  test("the planner and the diagnostician read and never write, in every permission mode", () => {
    for (const id of ["planner", "diagnostician"] as const) {
      expect(SUBAGENTS[id].edits, id).toBe(false)
      for (const tool of WRITE_TOOL_IDS) expect(SUBAGENTS[id].tools, `${id} must not have ${tool}`).not.toContain(tool)
      for (const suffix of ["", "-auto", "-ask"]) {
        const permission = config.agent[`${SUBAGENTS[id].host}${suffix}`]!.permission
        expect(permission["**"]).toBe("deny")
        for (const tool of WRITE_TOOL_IDS) expect(permission[tool], `${id}${suffix} must keep ${tool} denied`).toBeUndefined()
      }
    }
  })

  test("the verifier and the optimizer change operations only: no drawing edits, no library rows, no commits", () => {
    expect(SUBAGENTS.optimizer.tools).toContain("cam_edit")
    // The verifier generates and verifies; it cannot create, update, set stock or release.
    expect(SUBAGENTS.verifier.tools).toContain("cam_verify")
    expect(SUBAGENTS.verifier.tools).not.toContain("cam_edit")
    for (const id of ["verifier", "optimizer"] as const) {
      expect(SUBAGENTS[id].edits, id).toBe(true)
      for (const tool of ["cad_edit", "library_edit", "parts", "vcs_edit", "memory_edit", "agent"]) expect(SUBAGENTS[id].tools, `${id} must not have ${tool}`).not.toContain(tool)
    }
  })

  test("the roles that gate the next step are waited for; the rest of the read-only roster runs in the background", () => {
    expect(SUBAGENTS.planner.background).toBe(false)
    expect(SUBAGENTS.diagnostician.background).toBe(false)
    expect(SUBAGENTS.researcher.background).toBe(true)
  })

  test("the agent tool names every role it can start", () => {
    for (const id of SUBAGENT_IDS) expect(subagentCatalogue(), id).toContain(id)
  })
})
