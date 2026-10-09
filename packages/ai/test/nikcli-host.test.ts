import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { AiEvent } from "../src/events.ts"
import { hostChatStream, createHostSession } from "../src/nikcli/chat.ts"
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

const added: Array<{ projectId: string; elements: ReadonlyArray<Record<string, unknown>> }> = []
const stubHandlers = new Proxy({} as ToolHandlersShape, {
  get: (_target, name: string) => async (projectId: string, elements: ReadonlyArray<Record<string, unknown>>) => {
    if (name === "addElements") { added.push({ projectId, elements }); return { ok: true, ids: elements.map((_, i) => `id-${i}`), elements } }
    return { ok: true }
  }
})

let script: (index: number, turn: number, lastRole: string) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((request, index) => {
  const turn = chatTurns(request ? [request] : []).length
  const lastRole = request.messages.at(-1)?.role ?? ""
  return script(index, turn, lastRole)
})
const fakeProvider: HostProviderSpec = {
  id: "fake",
  name: "Fake",
  protocol: "openai-compatible",
  baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
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
const PROGRESS = new Set(["step", "tool_progress", "reasoning", "todo", "retry", "compacted"])
const content = (events: ReadonlyArray<AiEvent>) => events.filter((e) => !PROGRESS.has(e.type))

describe("embedded nikcli host", () => {
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
      expect(names).toContain("cad_probe")
      for (const forbidden of ["bash", "edit", "write", "read", "webfetch", "websearch", "task", "glob", "grep", "apply_patch", "plugin", "monitor"]) {
        expect(names).not.toContain(forbidden)
      }
      // `skill` loads the playbooks this package installed (skills/index.ts); nothing else is offered.
      // The host's own planning tools (plan, goal, skills) are offered besides ours; nothing that touches files or a shell is.
      // `code_mode` is the confined program runner: its tools are ours, and shell, files and web calls from it are refused (agent-persistence.test.ts).
      const HOST_PLANNING = ["skill", "todowrite", "todoread", "create_goal", "get_goal", "update_goal", "code_mode"]
      expect(names.every((n) => n === "cad_probe" || n === "invalid" || HOST_PLANNING.includes(n) || (TOOL_IDS as ReadonlyArray<string>).includes(n))).toBe(true)
    }
    expect(existsSync(marker)).toBe(false)
    expect(executed.some((e) => e.tool !== "cad_probe")).toBe(false)
    expect(events.at(-1)?.type).toBe("done")
  })

  test("the model builds in 3D: cad_add_elements goes through the real host with a revolved bottle and a cube", async () => {
    const host = await Effect.runPromise(runtime.host("project-3d"))
    added.length = 0
    const profile = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 150 }, { x: 10, y: 200 }, { x: 10, y: 260 }]
    script = (_index, _turn, lastRole) =>
      lastRole === "tool"
        ? { text: "Built." }
        : { toolCalls: [{ name: "cad_add_elements", args: { elements: [{ type: "revolution", name: "Bottle", profile }, { type: "cube", width: 40, height: 40, depth: 40, color: "#cc0000" }] } }] }
    const before = fake.requests.length
    const sessionId = await Effect.runPromise(createHostSession(host, "3d"))
    const events = await collect(hostChatStream({ host, sessionId, message: "make a bottle and a block", model }))
    expect(added).toHaveLength(1)
    expect(added[0]!.projectId).toBe("project-3d")
    expect(added[0]!.elements.map((e) => e["type"])).toEqual(["revolution", "cube"])
    // Defaults are filled by the catalogue before the handler sees the elements.
    expect(added[0]!.elements[0]).toMatchObject({ axis: "y", segments: 32, name: "Bottle" })
    expect(added[0]!.elements[1]).toMatchObject({ depth: 40, color: "#cc0000", x: 0 })
    expect(events.at(-1)?.type).toBe("done")
    // The model is offered the 3D tool first and told, in the tool list itself, which one is for objects.
    const first = chatTurns(fake.requests.slice(before))[0]!
    const names = toolNames(first)
    expect(names.indexOf("cad_add_elements")).toBeLessThan(names.indexOf("cad_add_entities"))
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
    expect(events.at(-1)).toMatchObject({ type: "done", text: "All done", usage: { inputTokens: 21, outputTokens: 9 } })
    // The JSON Schema nikcli sent to the model comes from our zod schema.
    const sent = chatTurns(fake.requests).at(-1)?.tools?.find((t) => t.function.name === "cad_probe")
    expect(JSON.stringify(sent?.function.parameters)).toContain("value")
  })

  test("provider failures surface as a final error event", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    script = () => ({ status: 500, body: JSON.stringify({ error: { message: "boom" } }) })
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
