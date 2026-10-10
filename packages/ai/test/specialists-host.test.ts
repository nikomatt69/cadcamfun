/**
 * The specialist agents against the real embedded host (a fake model in place of the provider): the main agent hands a job to
 * the editor, the editor runs in its own session with only its tools, its tool calls reach the main agent's stream, and the
 * report comes back as the `agent_task` result.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Layer, Redacted, Scope, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel } from "../src/direct-model.ts"
import { AiBackground, AiHost, AiService } from "../src/service.ts"
import type { AiEvent } from "../src/events.ts"
import { SUBAGENTS } from "../src/nikcli/agents.ts"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { BackgroundTaskManager } from "../src/nikcli/background-tasks.ts"
import { BackgroundToolsRunner } from "../src/nikcli/background-tools-runner.ts"
import { backgroundTools } from "../src/nikcli/background-tools.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { buildTools, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { startFakeOpenAi, toolNames, type ChatRequestBody, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

const handlerCalls: Array<{ name: string; projectId: string }> = []
const handlers = new Proxy({} as ToolHandlersShape, {
  get: (_target, name: string) => async (projectId: string) => {
    handlerCalls.push({ name, projectId })
    return { ok: true, count: 1 }
  }
})

const isParent = (request: ChatRequestBody): boolean => toolNames(request).includes("agent_task")
let editorRequests: ChatRequestBody[] = []
let failChildOnce = false
const script = (request: ChatRequestBody): Completion => {
  const lastRole = request.messages.at(-1)?.role
  if (isParent(request)) {
    return lastRole === "tool"
      ? { text: "The editor finished." }
      : { toolCalls: [{ name: "agent_task", args: { description: "Make hole-1 8 mm", prompt: "Set hole-1 diameter to 8 mm and change nothing else.", agent: "editor" } }] }
  }
  editorRequests.push(request)
  if (failChildOnce) { failChildOnce = false; return { status: 503, body: "overloaded" } }
  return lastRole === "tool" ? { text: "Done: hole-1 radius 3 -> 4." } : { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
}
const fake = startFakeOpenAi((request) => script(request))
const fakeProvider: HostProviderSpec = {
  id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}

const manager = new BackgroundTaskManager({})
const scope = Effect.runSync(Scope.make())
const runtime: NikCliRuntime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir: sharedDataDir,
    providers: [...defaultProviderSpecs(), fakeProvider],
    systemPrompt: "You are the main agent.",
    toolsFor: (projectId) => [...buildTools(handlers, projectId), ...backgroundTools(manager)]
  }).pipe(Scope.provide(scope))
)
const runner = new BackgroundToolsRunner(runtime, { manager })
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
const model = { providerID: "fake", modelID: "fake-model" } as const

afterAll(async () => {
  await runner.dispose()
  await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
  fake.stop()
})

const collect = (stream: Stream.Stream<AiEvent, unknown>): Promise<ReadonlyArray<AiEvent>> => Effect.runPromise(Stream.runCollect(stream)).then((chunk) => [...chunk])

describe("an editing specialist inside a real host turn", () => {
  test("removing a client alias joins its real host children and removes the resolved parent", async () => {
    const projectId = "project-alias-removal"
    const alias = "ui-conversation-alias"
    const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: sharedDataDir, forceGateway: false }))
    const service = AiService.layer.pipe(Layer.provideMerge(Layer.mergeAll(
      DirectModel.layer.pipe(Layer.provideMerge(base)),
      Layer.succeed(AiHost, { runtime, scheduler: manager }),
      Layer.succeed(AiBackground, {
        runner, cancelForParent: (owner) => Effect.promise(() => runner.cancelForParent(owner)),
        dispose: () => Effect.promise(() => runner.dispose())
      })
    )))
    await Effect.runPromise(Effect.gen(function* () {
      yield* (yield* AiCredentials).set("fake", Redacted.make("sk-fake-test-key"))
      const ai = yield* AiService
      const events = yield* Stream.runCollect(ai.chat({ projectId, sessionId: alias, message: "make hole-1 8 mm", model: { provider: "fake", model: "fake-model" } }))
      const parentId = events.find((event) => event.type === "done")?.sessionId
      if (!parentId) throw new Error("Missing resolved parent")
      expect(parentId).not.toBe(alias)
      const crossed = yield* Stream.runCollect(ai.chat({ projectId: "another-project", sessionId: alias, message: "edit", model: { provider: "fake", model: "fake-model" } })).pipe(Effect.flip)
      expect(crossed.message).toContain("different project")
      const owner = { projectId, parentSessionId: parentId }
      const task = manager.enqueue({ ...owner, description: "cancel with parent", prompt: "inspect", background: true })
      expect(yield* ai.removeSession(alias, "untrusted-project-hint")).toBe(true)
      expect(manager.read(owner, task.id).status).toBe("cancelled")
      const host = yield* runtime.host(projectId)
      expect((yield* Effect.promise(() => host.client.session.list({}))).some((session) => session.id === parentId)).toBe(false)
    }).pipe(Effect.provide(service)))
  })

  test("it runs with only its tools in the parent's project, streams its tool calls to the parent and returns its report", async () => {
    editorRequests = []
    handlerCalls.length = 0
    const host = await Effect.runPromise(runtime.host("project-42"))
    const sessionId = await Effect.runPromise(createHostSession(host, "specialist test"))
    const events = await collect(hostChatStream({ host, sessionId, message: "make hole-1 8 mm", model, continues: 0 }))

    // The parent saw its own delegation call and the specialist's report as its result.
    const call = events.find((e) => e.type === "tool_call" && e.tool === "agent_task")
    expect(call).toBeDefined()
    const result = events.find((e) => e.type === "tool_result" && e.tool === "agent_task")
    expect(result).toMatchObject({ ok: true })
    const task = JSON.parse((result as Extract<AiEvent, { type: "tool_result" }>).output)
    expect(task).toMatchObject({ status: "completed", text: "Done: hole-1 radius 3 -> 4.", agent: "editor", background: false })

    // The specialist's own tool call is in the parent's stream, labelled, under a call id of its own session.
    const child = events.find((e) => e.type === "tool_call" && e.tool === "cad_describe_drawing")
    expect(child).toMatchObject({ type: "tool_call", agent: "editor" })
    expect((child as Extract<AiEvent, { type: "tool_call" }>).callId).toContain(":")
    expect(events.find((e) => e.type === "tool_result" && e.tool === "cad_describe_drawing")).toMatchObject({ ok: true, agent: "editor" })
    // Its text and reasoning are not mixed into the parent's answer.
    const answer = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")
    expect(answer).not.toContain("hole-1 radius")
    expect(events.at(-1)).toMatchObject({ type: "done", text: "The editor finished." })

    // The specialist had the editor's tools and nothing else, and used the parent's model.
    const names = toolNames(editorRequests[0]!)
    expect(names).toContain("cad_modify_entities")
    expect(names).toContain("cad_describe_drawing")
    for (const forbidden of ["cam_generate_gcode", "cad_add_elements", "agent_task", "task", "bash"]) expect(names).not.toContain(forbidden)
    expect(names.filter((n) => !SUBAGENTS.editor.tools.includes(n) && n !== "skill" && n !== "invalid" && n !== "code_mode" && n !== "search_tools" && n !== "question")).toEqual([])
    expect(editorRequests[0]!.model).toBe("fake-model")
    // Its instructions are the editor's, not the main agent's.
    expect(JSON.stringify(editorRequests[0]!.messages[0])).toContain("smallest change")

    // The tool ran against the project that asked, not a shared one.
    expect(handlerCalls).toContainEqual({ name: "describeDrawing", projectId: "project-42" })
    // The child session is gone and the parent's conversation was not touched by it.
    const remaining = await host.client.session.list({})
    expect(remaining.filter((s) => s.parentID === sessionId)).toEqual([])
  })

  test("a provider hiccup in the specialist is retried and the report still arrives", async () => {
    editorRequests = []
    failChildOnce = true
    const host = await Effect.runPromise(runtime.host("project-43"))
    const sessionId = await Effect.runPromise(createHostSession(host, "retry test"))
    const events = await collect(hostChatStream({ host, sessionId, message: "make hole-1 8 mm", model, continues: 0 }))
    const result = events.find((e) => e.type === "tool_result" && e.tool === "agent_task") as Extract<AiEvent, { type: "tool_result" }>
    expect(JSON.parse(result.output)).toMatchObject({ status: "completed", text: "Done: hole-1 radius 3 -> 4." })
    expect(editorRequests.length).toBeGreaterThanOrEqual(3)
  })
})
