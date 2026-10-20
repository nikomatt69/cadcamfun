import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { AiEvent } from "../src/events.ts"
import { hostChatStream, createHostSession } from "../src/nikcli/chat.ts"
import { replySessionQuestion } from "../src/nikcli/session-controls.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { compactHostSession, readHostContextPolicy } from "../src/nikcli/context.ts"
import { buildTools, TOOL_IDS, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { makeNikCliRuntime, type HostToolSpec, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { chatTurns, startFakeOpenAi, toolNames, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

// The host bundle is imported when the first host is needed (not while the runtime is built), and a loaded machine is slow at it.
setDefaultTimeout(60000)

const executed: Array<{ tool: string; input: unknown; projectId: string }> = []

const probeTool: HostToolSpec = {
  id: "cad_probe",
  description: "Echo a number.",
  parameters: z.object({ value: z.number() }),
  execute: async (input, ctx) => {
    executed.push({ tool: "cad_probe", input, projectId: ctx.projectId })
    return JSON.stringify({ ok: true })
  }
}

const viewportPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg=="

const added: Array<{ projectId: string; elements: ReadonlyArray<Record<string, unknown>> }> = []
const modified: Array<{ projectId: string; changes: ReadonlyArray<Record<string, unknown>> }> = []
const handlerCalls: string[] = []
const stubHandlers = new Proxy({} as ToolHandlersShape, {
  get: (_target, name: string) => async (projectId: string, elements: ReadonlyArray<Record<string, unknown>>) => {
    handlerCalls.push(name)
    if (name === "vision") return { ok: true, capture: { data: viewportPng, mime: "image/png", width: 1, height: 1 }, evidence: { ok: true, sceneRevision: "fixture-revision", image: { width: 1, height: 1 } } }
    if (name === "addElements") { added.push({ projectId, elements }); return { ok: true, ids: elements.map((_, i) => `id-${i}`), elements } }
    if (name === "modifyEntities") modified.push({ projectId, changes: elements })
    return { ok: true }
  }
})

let script: (index: number, turn: number, lastRole: string) => Completion = () => ({ text: "hi" })
let classify: ((prompt: string) => Completion) | undefined
const fake = startFakeOpenAi((request, index) => {
  const prompt = request.messages.map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n")
  if (classify && prompt.includes("<pending_action>") && /Stage [12] —/.test(prompt)) return classify(prompt)
  const turn = chatTurns(request ? [request] : []).length
  const lastRole = request.messages.at(-1)?.role ?? ""
  return script(index, turn, lastRole)
})
const fakeProvider: HostProviderSpec = {
  id: "fake",
  name: "Fake",
  protocol: "openai-compatible",
  baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096, vision: true }]
}

const scope = Effect.runSync(Scope.make())
const runtime: NikCliRuntime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir: sharedDataDir,
    providers: [...defaultProviderSpecs(), fakeProvider],
    systemPrompt: "You are a CAD test assistant.",
    toolsFor: (projectId) => [probeTool, ...buildTools(stubHandlers, projectId)],
    hostLogs: (level, line) => { if (level === 'warn' || level === 'error') console.log('HOSTLOG', line.slice(0, 300)) }
  }).pipe(Scope.provide(scope))
)
const model = { providerID: "fake", modelID: "fake-model" } as const
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))

afterAll(async () => {
  await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
  fake.stop()
})

const collect = (stream: Stream.Stream<AiEvent, unknown>) => Effect.runPromise(Stream.runCollect(stream)).then((c) => [...c])
/** What the agent shows besides the answer itself: steps, progress of a tool call being written, plan, retries. */
const PROGRESS = new Set(["step", "tool_progress", "reasoning", "todo", "retry", "compacted", "turn", "session_status", "compaction", "permission_resolved", "tool_diagnostic", "context_snapshot"])
const content = (events: ReadonlyArray<AiEvent>) => events.filter((e) => !PROGRESS.has(e.type))

describe("embedded nikcli host", () => {
  test("Auto creates and edits without approval, while Code Mode cannot delete or write version control", async () => {
    const host = await Effect.runPromise(runtime.host("project-auto-edits"))
    let stage = 0
    const reviews: string[] = []
    classify = (prompt) => {
      reviews.push(prompt)
      // Force both native stages: the classifier reviews the actual action and user's request.
      if (prompt.includes("Stage 1 —")) return { text: "block" }
      const pending = prompt.match(/<pending_action>([\s\S]*?)<\/pending_action>/)?.[1] ?? ""
      if (pending.includes('"width": 99999')) return { text: "<thinking>The user requested a scoped part edit. Resizing the existing part to width 99999 is disproportionate and unsupported by the request.</thinking><verdict>block</verdict><rule>Unscoped CAD modification</rule><reason>The extreme dimension is outside the requested modification and would damage the part.</reason>" }
      return { text: "<thinking>The user requested creating and modifying CAD geometry. This action stays within that request.</thinking><verdict>allow</verdict><rule>CAD editing</rule><reason>The requested creation or modification is authorized.</reason>" }
    }
    const program = `const blocked = {};
for (const [tool, input] of [["cad_edit", {action:"delete", ids:["id-0"], confirm:true}], ["vcs_edit", {action:"commit", message:"Forbidden"}], ["mods_edit", {action:"remove", id:"x", confirm:true}]]) {
  try { const value = await tools[tool](input); blocked[tool] = value && value.ok === false ? "refused" : "ran" } catch { blocked[tool] = "refused" }
}
return blocked;`
    script = () => {
      stage++
      if (stage === 1) return { toolCalls: [{ name: "search_tools", args: { query: "cad_edit" } }] }
      if (stage === 2) return { toolCalls: [{ name: "cad_edit", args: { action: "add", elements: [{ type: "cube", width: 10, height: 10, depth: 10 }] } }] }
      if (stage === 3) return { toolCalls: [{ name: "cad_edit", args: { action: "modify", changes: [{ id: "id-0", changes: { width: 20 } }] } }] }
      if (stage === 4) return { toolCalls: [{ name: "cad_edit", args: { action: "modify", changes: [{ id: "id-0", changes: { width: 99999 } }] } }] }
      if (stage === 5) return { toolCalls: [{ name: "code_mode", args: { code: program } }] }
      return { text: "Created and edited; forbidden changes refused." }
    }
    const sessionId = await Effect.runPromise(createHostSession(host, "Auto permissions"))
    handlerCalls.length = 0
    modified.length = 0
    const events: AiEvent[] = []
    try {
      await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, agent: "cadcam-auto", message: "Create and edit the part", model, autoContinues: 0 }), (event) => Effect.promise(async () => {
        events.push(event)
        // Never hang the test if a regression introduces an approval wait.
        if (event.type === "permission_request") await host.client.permission.reply({ requestID: event.requestId, reply: "reject" })
      })))
    } finally {
      classify = undefined
    }
    const carefulReviews = reviews.filter((prompt) => prompt.includes("Stage 2 —"))
    for (const action of ["add", "modify"]) {
      expect(carefulReviews.some((prompt) => {
        const pending = prompt.match(/<pending_action>([\s\S]*?)<\/pending_action>/)?.[1] ?? ""
        return pending.includes("permission: cad_edit") && pending.includes(`"action": "${action}"`)
      })).toBe(true)
    }
    const deniedReview = carefulReviews.map((prompt) => prompt.match(/<pending_action>([\s\S]*?)<\/pending_action>/)?.[1] ?? "")
      .find((pending) => pending.includes('"width": 99999'))
    expect(deniedReview).toContain('"application": "CADCAMFUN"')
    expect(deniedReview).toContain('"projectId": "project-auto-edits"')
    expect(deniedReview).toContain('"id": "cad_edit.modify"')
    expect(deniedReview).toContain('"kind": "write"')
    expect(deniedReview).toMatch(/"effects":\s*\[\s*"drawing"\s*\]/)
    expect(modified).toEqual([{ projectId: "project-auto-edits", changes: [{ id: "id-0", changes: { width: 20 } }] }])
    expect(events.filter((event) => event.type === "permission_request")).toEqual([])
    expect(handlerCalls).toContain("addElements")
    expect(handlerCalls).toContain("modifyEntities")
    expect(handlerCalls).not.toContain("deleteEntities")
    const result = events.find((event) => event.type === "tool_result" && event.tool === "code_mode")
    expect(result?.type === "tool_result" && result.ok).toBe(true)
    if (result?.type === "tool_result") expect(JSON.parse(result.output)).toEqual({ cad_edit: "refused", vcs_edit: "refused", mods_edit: "refused" })
  })
  test("one runtime single-flights project clients and rejects cross-workspace worker parents", async () => {
    const peers = await Effect.runPromise(Effect.all([runtime.host("workspace-single"), runtime.host("workspace-single"), runtime.host("workspace-other")], { concurrency: "unbounded" }))
    expect(peers[0]).toBe(peers[1])
    expect(peers[0]?.directory).not.toBe(peers[2]?.directory)
    const a = peers[0], b = peers[2]
    if (!a || !b) throw new Error("Missing project host")
    const session = await a.client.session.create({ title: "Workspace continuity" })
    expect((await a.client.session.get({ sessionID: session.id })).directory).toBe(a.directory)
    await expect(Effect.runPromise(runtime.worker({ projectId: b.projectId, parentSessionId: session.id }))).rejects.toThrow("different project workspace")
    const worker = await Effect.runPromise(runtime.worker({ projectId: a.projectId, parentSessionId: session.id }))
    expect((await worker.client.session.get({ sessionID: worker.workerSessionId })).parentID).toBe(session.id)
    await worker.client.session.remove({ sessionID: worker.workerSessionId })
    await a.client.session.remove({ sessionID: session.id })
  })
  test("domain schemas load on demand through the native registry and remain session-scoped", async () => {
    const host = await Effect.runPromise(runtime.host("project-discovery"))
    const before = fake.requests.length
    let stage = 0
    script = () => {
      stage += 1
      if (stage === 1) return { toolCalls: [{ name: "search_tools", args: { query: "cad_probe" } }] }
      if (stage === 2) return { toolCalls: [{ name: "cad_probe", args: { value: 7 } }] }
      return { text: "Discovered and executed." }
    }
    const sessionId = await Effect.runPromise(createHostSession(host, "discovery"))
    const events = await collect(hostChatStream({ host, sessionId, message: "Discover the probe", model, autoContinues: 0 }))
    const requests = fake.requests.slice(before)
    expect(toolNames(requests[0]!)).toContain("search_tools")
    expect(toolNames(requests[0]!)).not.toContain("cad_probe")
    expect(toolNames(requests[1]!)).toContain("cad_probe")
    for (const request of requests) for (const forbidden of ["bash", "write", "edit", "webfetch"]) expect(toolNames(request)).not.toContain(forbidden)
    expect(events.find((event) => event.type === "tool_result" && event.tool === "cad_probe")).toMatchObject({ ok: true })
    script = () => ({ text: "Fresh session." })
    const fresh = await Effect.runPromise(createHostSession(host, "fresh discovery"))
    const start = fake.requests.length
    await collect(hostChatStream({ host, sessionId: fresh, message: "Hello", model, autoContinues: 0 }))
    expect(toolNames(fake.requests[start]!)).not.toContain("cad_probe")
  })
  test("keeps state under the isolated app data dir", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    expect(runtime.paths.root.startsWith(sharedDataDir)).toBe(true)
    expect(host.directory.includes("projects")).toBe(true)
    expect(existsSync(join(runtime.paths.config, "nikcli.json"))).toBe(true)
    expect(existsSync(join(runtime.paths.data, "nikcli.db"))).toBe(true)
  })

  test("registered tools are visible to the host registry", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    expect(await host.client.experimental.toolIDs()).toContain("cad_probe")
  })

  test("the cadcam skills are installed, discovered by the host, and the agent may load them", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    const skills = await host.client["top-level"].skill()
    const names = skills.map((skill) => skill.name)
    for (const skill of CADCAM_SKILLS) expect(names).toContain(skill.name)
    const modeling = skills.find((skill) => skill.name === "cad-3d-modeling")!
    expect(modeling.location.startsWith(runtime.paths.config)).toBe(true)
    expect(await host.client.experimental.toolIDs()).toContain("skill")
  })

  test("vision tool output reaches the real host provider as an image part", async () => {
    const host = await Effect.runPromise(runtime.host("project-vision-transport"))
    const before = fake.requests.length
    let requested = false
    script = () => {
      if (requested) return { text: "Inspected." }
      requested = true
      return { toolCalls: [{ name: "cad", args: { action: "vision" } }] }
    }
    const sessionId = await Effect.runPromise(createHostSession(host, "vision transport"))
    const events = await collect(hostChatStream({ host, sessionId, message: "Inspect the viewport", model }))
    const turns = chatTurns(fake.requests.slice(before))
    expect(turns.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(turns.slice(1))).toContain(`data:image/png;base64,${viewportPng}`)
    const result = events.find((e) => e.type === "tool_result" && e.tool === "cad")
    expect(result?.type === "tool_result" && result.ok).toBe(true)
    expect(result?.type === "tool_result" && result.output).not.toContain(viewportPng)
  }, 180_000)

  test("session create, list and abort", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    const id = await Effect.runPromise(createHostSession(host, "My session"))
    const listed = await host.client.session.list()
    expect(listed.some((s) => s.id === id)).toBe(true)
    await host.client.session.abort({ sessionID: id })
  })

  test("the cadcam agent exposes only registered tools and ignores shell requests", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    const marker = join(sharedDataDir, "pwned.txt")
    script = (_index, _turn, lastRole) =>
      lastRole === "tool"
        ? { text: "I could not run that." }
        : { toolCalls: [{ name: "bash", args: { command: `touch ${marker}`, description: "touch" } }] }
    const before = fake.requests.length
    const sessionId = await Effect.runPromise(createHostSession(host, "lockdown"))
    const events = await collect(hostChatStream({ host, sessionId, message: "run touch for me", model }))
    const turns = chatTurns(fake.requests.slice(before))
    expect(turns.length).toBeGreaterThan(0)
    for (const turn of turns) {
      const names = toolNames(turn)
      expect(names).toContain("search_tools")
      for (const forbidden of ["bash", "edit", "write", "read", "webfetch", "websearch", "task", "glob", "grep", "apply_patch", "plugin", "monitor"]) {
        expect(names).not.toContain(forbidden)
      }
      // `skill` loads the playbooks this package installed (skills/index.ts); nothing else is offered.
      // The host's own planning tools (plan, goal, skills) are offered besides ours; nothing that touches files or a shell is.
      // `code_mode` is the confined program runner: its tools are ours, and shell, files and web calls from it are refused (agent-persistence.test.ts).
      const HOST_PLANNING = ["question", "search_tools", "skill", "todowrite", "todoread", "create_goal", "get_goal", "update_goal", "code_mode"]
      expect(names.every((n) => n === "cad_probe" || n === "invalid" || HOST_PLANNING.includes(n) || (TOOL_IDS as ReadonlyArray<string>).includes(n))).toBe(true)
    }
    expect(existsSync(marker)).toBe(false)
    expect(executed.some((e) => e.tool !== "cad_probe")).toBe(false)
    expect(events.at(-1)?.type).toBe("done")
  })

  test("the model builds in 3D: cad_edit.add goes through the real host with a revolved bottle and a cube", async () => {
    const host = await Effect.runPromise(runtime.host("project-3d"))
    added.length = 0
    const profile = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 150 }, { x: 10, y: 200 }, { x: 10, y: 260 }]
    let stage = 0
    script = () => ++stage === 1
      ? { toolCalls: [{ name: "search_tools", args: { query: "cad, cad_edit" } }] }
      : stage === 2
        ? { toolCalls: [{ name: "cad_edit", args: { action: "add", elements: [{ type: "revolution", name: "Bottle", profile }, { type: "cube", width: 40, height: 40, depth: 40, color: "#cc0000" }] } }] }
        : { text: "Built." }
    const before = fake.requests.length
    // `cad_edit` carries a destructive action, so the host asks before it runs. The ask role waits for a real
    // answer; nothing executes until it arrives, which is what this test also proves by answering it.
    const sessionId = await Effect.runPromise(createHostSession(host, "3d"))
    const events: AiEvent[] = []
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, agent: "cadcam-ask", message: "make a bottle and a block", model, autoContinues: 0 }), (event) => Effect.promise(async () => {
      events.push(event)
      if (event.type === "permission_request") await host.client.permission.reply({ requestID: event.requestId, reply: "once" })
    })))
    expect(events.some((event) => event.type === "permission_request")).toBe(true)
    expect(added).toHaveLength(1)
    expect(added[0]!.projectId).toBe("project-3d")
    expect(added[0]!.elements.map((e) => e["type"])).toEqual(["revolution", "cube"])
    // Defaults are filled by the catalogue before the handler sees the elements.
    expect(added[0]!.elements[0]).toMatchObject({ axis: "y", segments: 32, name: "Bottle" })
    expect(added[0]!.elements[1]).toMatchObject({ depth: 40, color: "#cc0000", x: 0 })
    expect(events.at(-1)?.type).toBe("done")
    const turns = chatTurns(fake.requests.slice(before))
    expect(toolNames(turns[0]!)).not.toContain("cad_edit")
    expect(toolNames(turns[1]!)).toContain("cad_edit")
  })

  test("tool call -> handler -> result -> final text", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    executed.length = 0
    script = (_index, _turn, lastRole) =>
      lastRole === "tool" ? { text: "All done", chunks: ["All ", "done"] } : { toolCalls: [{ name: "cad_probe", args: { value: 42 } }] }
    const sessionId = await Effect.runPromise(createHostSession(host, "e2e"))
    const events = await collect(hostChatStream({ host, sessionId, message: "probe 42", model }))
    expect(executed).toEqual([{ tool: "cad_probe", input: { value: 42 }, projectId: "project-b" }])
    const types = content(events).map((e) => e.type)
    expect(types).toEqual(["tool_call", "tool_result", "delta", "delta", "done"])
    const result = events.find((e) => e.type === "tool_result")
    expect(result).toMatchObject({ ok: true, tool: "cad_probe" })
    const usage = events.reduce((total, event) => event.type === "step" && event.phase === "finish" && event.usage ? { inputTokens: total.inputTokens + event.usage.inputTokens, outputTokens: total.outputTokens + event.usage.outputTokens } : total, { inputTokens: 0, outputTokens: 0 })
    expect(events.at(-1)).toMatchObject({ type: "done", text: "All done", usage })
    // The JSON Schema nikcli sent to the model comes from our zod schema.
    const sent = chatTurns(fake.requests).at(-1)?.tools?.find((t) => t.function.name === "cad_probe")
    expect(JSON.stringify(sent?.function.parameters)).toContain("value")
  })

  test("malformed history is rejected by the host with actionable recovery and no handler call", async () => {
    const host = await Effect.runPromise(runtime.host("project-invalid-history"))
    script = (_index, _turn, lastRole) => lastRole === "tool" ? { text: "Payload requires correction." } : { toolCalls: [{ name: "cad", args: { action: "parametric_validate", history: "{}" } }] }
    const sessionId = await Effect.runPromise(createHostSession(host, "invalid history"))
    handlerCalls.length = 0
    const events = await collect(hostChatStream({ host, sessionId, message: "validate", model, autoContinues: 0 }))
    const result = events.find((event) => event.type === "tool_result" && event.tool === "cad")
    expect(result?.type === "tool_result" && result.ok).toBe(false)
    const output = result?.type === "tool_result" ? result.output : ""
    // The refusal names each missing field, not only a sentence of advice, and nothing behind the action ran.
    expect(output).toContain("history.parameters")
    expect(output).toContain("history.features")
    expect(output).toContain("No mutation")
    expect(handlerCalls).toEqual([])
  })

  test("Ask waits for native approval before executing and Reject prevents mutation", async () => {
    const host = await Effect.runPromise(runtime.host("project-permissions"))
    for (const decision of ["once", "reject"] as const) {
      const before = executed.length
      script = (_index, _turn, lastRole) => lastRole === "tool" ? { text: "Settled." } : { toolCalls: [{ name: "cad_probe", args: { value: 42 } }] }
      const sessionId = await Effect.runPromise(createHostSession(host, decision))
      const events: AiEvent[] = []
      await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, agent: "cadcam-ask", message: "Probe", model, autoContinues: 0 }), (event) => Effect.promise(async () => {
        events.push(event)
        if (event.type === "permission_request") {
          expect(executed.length).toBe(before)
          await host.client.permission.reply({ requestID: event.requestId, reply: decision })
        }
      })))
      expect(events.some((event) => event.type === "permission_request")).toBe(true)
      expect(executed.length).toBe(before + (decision === "once" ? 1 : 0))
    }
  })

  test("native questions wait for an owned answer and resume the same turn", async () => {
    const host = await Effect.runPromise(runtime.host("project-questions"))
    let asked = false
    script = () => { if (asked) return { text: "Stock confirmed." }; asked = true; return { toolCalls: [{ name: "question", args: { questions: [{ header: "Stock", question: "Choose stock", options: [{ label: "Aluminium", description: "Use the aluminium stock" }] }] } }] } }
    const sessionId = await Effect.runPromise(createHostSession(host, "question"))
    const events: AiEvent[] = []
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, message: "Choose stock", model, autoContinues: 0 }), (event) => Effect.promise(async () => {
      events.push(event)
      if (event.type === "question_request") await replySessionQuestion(host, sessionId, { sessionId, action: "answer_question", requestId: event.requestId, answers: [["Aluminium"]] })
    })))
    expect(events.filter((event) => event.type === "tool_result" && !event.ok).map((event) => event.type === "tool_result" ? event.output : "")).toEqual([])
    expect(events.some((event) => event.type === "question_request")).toBe(true)
    expect(events.at(-1)?.type).toBe("done")
    expect((await host.client.question.list()).some((question) => question.sessionID === sessionId)).toBe(false)
  })

  test("native Brain learns project habits with its own permissions and the caller model", async () => {
    const host = await Effect.runPromise(runtime.host("project-memory-brain"))
    const caller = await Effect.runPromise(createHostSession(host, "memory caller"))
    script = () => ({ text: "The confirmed project unit is millimetres." })
    await collect(hostChatStream({ host, sessionId: caller, message: "Remember units", model, autoContinues: 0 }))
    const status = await host.client.brain.status()
    expect(status).toMatchObject({ enabled: true, memoryEnabled: true, minHours: 24, minSessions: 5 })
    const before = fake.requests.length
    const filePath = join(host.directory, ".nikcli", "habits.md")
    let stage = 0
    script = () => stage++ === 0 ? { toolCalls: [{ name: "read", args: { filePath } }] }
      : stage === 2 ? { toolCalls: [{ name: "edit", args: { filePath, oldString: "# User habits", newString: "# User habits\n\nConfirmed CAD/CAM units: millimetres." } }] }
        : { text: "Project units consolidated." }
    const result = await host.client.brain.trigger({ force: true, sessionID: caller })
    expect(result.success).toBe(true)
    const turns = chatTurns(fake.requests.slice(before))
    expect(turns.length).toBeGreaterThanOrEqual(3)
    expect(toolNames(turns[0]!)).toContain("read")
    expect(toolNames(turns[0]!)).not.toContain("cad_add_elements")
    expect(readFileSync(filePath, "utf8")).toContain("Confirmed CAD/CAM units")
  }, 60_000)

  test("provider failures surface as a final error event", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    script = () => ({ status: 401, body: JSON.stringify({ error: { message: "boom" } }) })
    const sessionId = await Effect.runPromise(createHostSession(host, "failing"))
    const events = await collect(hostChatStream({ host, sessionId, message: "hello", model, continues: 0 }))
    expect(events.at(-1)?.type).toBe("error")
  }, 60_000)

  test("a second message sent while the first is still being answered is never reported as a provider error", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    script = () => ({ text: "answer", chunks: ["ans", "wer"] })
    const sessionId = await Effect.runPromise(createHostSession(host, "two at once"))
    const [first, second] = await Promise.all([
      collect(hostChatStream({ host, sessionId, message: "first", model })),
      collect(hostChatStream({ host, sessionId, message: "second", model }))
    ])
    for (const events of [first, second]) {
      const last = events.at(-1)
      // Answered, or told plainly that it was interrupted; the host's "Session interrupted" never reaches the user as a provider error.
      expect(last?.type === "done" || (last?.type === "error" && last.code === "aborted")).toBe(true)
      expect(events.some((e) => e.type === "error" && e.code === "provider")).toBe(false)
    }
  }, 60_000)

  test("real host automatically compacts overflow and keeps summaries out of chat", async () => {
    const host = await Effect.runPromise(runtime.host("project-context"))
    expect(await Effect.runPromise(readHostContextPolicy(host))).toEqual({ source: "host-config", auto: true, prune: true })
    let calls = 0
    script = () => {
      calls++
      if (calls === 1) return { text: "Initial answer", usage: { prompt_tokens: 99_000, completion_tokens: 9, total_tokens: 99_009 } }
      if (calls === 2) return { text: "INTERNAL CONTEXT SUMMARY" }
      return { text: "Continued answer" }
    }
    const sessionId = await Effect.runPromise(createHostSession(host, "auto context"))
    const firstEvents = await collect(hostChatStream({ host, sessionId, message: "Remember the plate is 40 mm wide", model }))
    const events = await collect(hostChatStream({ host, sessionId, message: "Continue", model }))
    const messages = await host.client.session.messages({ sessionID: sessionId })
    expect(messages.some((message) => message.info.summary === true && !message.info.error)).toBe(true)
    expect([...firstEvents, ...events].filter((event) => event.type === "delta").map((event) => event.text).join("")).not.toContain("INTERNAL CONTEXT SUMMARY")
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Continued answer" })
    // Overflow is handled in the first prompt loop: answer, summary, continuation;
    // the second user prompt then makes its own normal request.
    expect(calls).toBe(4)
    script = () => ({ text: "Explicit summary" })
    const before = fake.requests.length
    await Effect.runPromise(compactHostSession(host, sessionId, model))
    expect(fake.requests.length - before).toBe(1)
  }, 30_000)

  test("keys are pushed to the host and removed again", async () => {
    await Effect.runPromise(runtime.host("project-b"))
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-test-host-key"))
    const authFile = join(runtime.paths.data, "auth.json")
    expect(readFileSync(authFile, "utf8")).toContain("fake")
    await Effect.runPromise(runtime.clearProviderKey("fake"))
    expect(existsSync(authFile) ? readFileSync(authFile, "utf8") : "").not.toContain("sk-test-host-key")
  })
})

describe("a turn does not depend on the client staying connected", () => {
  test("the consumer walks away mid-turn: the host finishes the turn and its state can be read back", async () => {
    const { readHostSessionState } = await import("../src/nikcli/chat.ts")
    // An earlier test removes the key again; this one needs it.
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
    const host = await Effect.runPromise(runtime.host("project-leave"))
    script = (_index, _turn, lastRole) => (lastRole === "tool" ? { text: "All built: a plate with two holes." } : { toolCalls: [{ name: "cad_probe", args: { value: 1 } }] })
    const sessionId = await Effect.runPromise(createHostSession(host, "leave"))
    // Read only the first event, then drop the stream like a closed connection would.
    await Effect.runPromise(Stream.runCollect(Stream.take(hostChatStream({ host, sessionId, message: "build it", model }), 1)))
    let state = await Effect.runPromise(readHostSessionState(host, sessionId))
    // Right after the first event the host may not have stored anything yet; wait for the turn itself, not just for "idle".
    for (let i = 0; i < 150 && (state.busy || state.text === ""); i++) {
      await new Promise((r) => setTimeout(r, 100))
      state = await Effect.runPromise(readHostSessionState(host, sessionId))
    }
    expect(state.busy).toBe(false)
    expect(state.text).toContain("All built: a plate with two holes.")
  }, 30000)
})
