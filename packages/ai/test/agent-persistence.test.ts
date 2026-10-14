/**
 * The agent does not stop on its own. The embedded host ends a turn when the model answers without a tool call, when a
 * permission is denied (the doom-loop guard asks one after three identical calls) or when a step fails. These run a scripted
 * model through the real host and check what the stream does in each case.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync } from "node:fs"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { DEFAULT_AUTO_CONTINUES, announcesWork, continuationFor, createHostSession, hostChatStream, queueHostMessage, resumeDelay } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { buildTools, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { startFakeOpenAi, type ChatRequestBody, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

let failing = false
let slow = 0
let handlerCalls: string[] = []
const handlers = new Proxy({} as ToolHandlersShape, { get: (_t, name: string) => async () => (handlerCalls.push(name), slow > 0 && (await new Promise((r) => setTimeout(r, slow))), failing ? { ok: false, error: "The drawing is locked." } : name === "describeDrawing" ? { total: 1, counts: { cube: 1 }, drawingId: "d", projectId: "p" } : { ok: true, count: 1 }) })
let script: (request: ChatRequestBody, index: number) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((request, index) => script(request, index))
const fakeProvider: HostProviderSpec = {
  id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}
const scope = Effect.runSync(Scope.make())
const runtime: NikCliRuntime = await Effect.runPromise(
  makeNikCliRuntime({ dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), fakeProvider], systemPrompt: "You are the main agent.", toolsFor: (projectId) => buildTools(handlers, projectId) }).pipe(Scope.provide(scope))
)
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
const model = { providerID: "fake", modelID: "fake-model" } as const
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const run = async (message: string, project: string, extra: Partial<Parameters<typeof hostChatStream>[0]> = {}): Promise<ReadonlyArray<AiEvent>> => {
  const host = await Effect.runPromise(runtime.host(project))
  const sessionId = await Effect.runPromise(createHostSession(host, "persistence"))
  return Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message, model, continues: 0, ...extra }))).then((c) => [...c])
}

describe("the turn goes on", () => {
  test("five identical read calls in a row do not end the turn (the doom-loop guard must not deny)", async () => {
    let calls = 0
    script = (request) => {
      const last = request.messages.at(-1)?.role
      if (last === "tool") { calls += 1; return calls < 5 ? { toolCalls: [{ name: "cad_describe_drawing", args: {} }] } : { text: "Checked five times and all is well." } }
      return { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
    }
    const events = await run("check the drawing", "persist-1")
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Checked five times and all is well." })
    expect(events.filter((e) => e.type === "tool_result").length).toBe(5)
  })
})

const textOf = (request: ChatRequestBody): string => JSON.stringify(request.messages.at(-1))
const lastIsTool = (request: ChatRequestBody): boolean => request.messages.at(-1)?.role === "tool"

describe("announcements and open work are recognised", () => {
  test("only an announcement without action counts", () => {
    for (const yes of ["I'll build the base first.", "Ok. Now I will add the wheels.", "Procedo con le ruote.", "Here is the plan:", "Let me check the result.", "Adesso creo il corpo."]) expect(announcesWork(yes), yes).toBe(true)
    for (const no of ["The plate is 40 mm wide with two 6 mm holes.", "Done: hole-1 radius 3 -> 4.", "Which material should I use?", "", "Let me know if you want it thicker?"]) expect(announcesWork(no), no).toBe(false)
  })
  test("an open plan item or an unfixed failure asks to go on; a finished answer does not", () => {
    const base = { todos: [], lastToolError: undefined }
    expect(continuationFor({ ...base, todos: [{ content: "Drill the holes", status: "pending" }, { content: "Model", status: "completed" }] }, "Done.")).toContain("Drill the holes")
    expect(continuationFor({ ...base, lastToolError: "The drawing is locked." }, "I could not.")).toContain("The drawing is locked.")
    expect(continuationFor({ ...base, todos: [{ content: "Model", status: "completed" }] }, "All built and checked.")).toBeUndefined()
    expect(continuationFor(base, "Building the", "length")).toContain("cut off by the output limit")
    expect(continuationFor(base, "All built.", "stop")).toBeUndefined()
  })
})

describe("what counts as a failed call", () => {
  test("a refusal does, a finding about the model does not", async () => {
    const { toolFailure } = await import("../src/nikcli/event-mapper.ts")
    expect(toolFailure("completed", JSON.stringify({ ok: false, error: "Unknown element ids: 9" }))).toBe("Unknown element ids: 9")
    expect(toolFailure("completed", JSON.stringify({ ok: false, problems: ["elements[0]: bad"] }))).toBe("elements[0]: bad")
    expect(toolFailure("completed", JSON.stringify({ ok: false, issues: [{ severity: "error", code: "NON_POSITIVE_SIZE" }] }))).toBeUndefined()
    expect(toolFailure("completed", JSON.stringify({ ok: true }))).toBeUndefined()
    expect(toolFailure("error", "boom")).toBe("boom")
  })
})

describe("the turn does not end on words", () => {
  test("an announced step is taken: the agent is asked to do it and then does", async () => {
    let turns = 0
    script = (request) => {
      if (lastIsTool(request)) return { text: "The base is built and checked." }
      turns += 1
      return turns === 1 ? { text: "Now I'll build the base:" } : { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
    }
    const events = await run("build a bracket", "persist-2")
    expect(events.filter((e) => e.type === "tool_call").length).toBe(1)
    const done = events.at(-1) as Extract<AiEvent, { type: "done" }>
    expect(done.type).toBe("done")
    expect(done.text).toContain("Now I'll build the base:")
    expect(done.text).toContain("The base is built and checked.")
  })

  test("a plan with items left is carried on until it is finished", async () => {
    let stage = 0
    script = (request) => {
      const last = textOf(request)
      if (last.includes("unfinished items")) { stage = 2; return { toolCalls: [{ name: "todowrite", args: { todos: [{ content: "Model", status: "completed", priority: "high" }, { content: "Verify", status: "completed", priority: "high" }] } }] } }
      if (stage === 2 && lastIsTool(request)) return { text: "Both steps are done." }
      if (lastIsTool(request) && stage === 1) return { text: "Modelled the part." }
      stage = 1
      return { toolCalls: [{ name: "todowrite", args: { todos: [{ content: "Model", status: "completed", priority: "high" }, { content: "Verify", status: "pending", priority: "high" }] } }] }
    }
    const events = await run("model and verify", "persist-3")
    const done = events.at(-1) as Extract<AiEvent, { type: "done" }>
    expect(done.text).toContain("Both steps are done.")
    expect(events.filter((e) => e.type === "todo").length).toBeGreaterThanOrEqual(2)
  })

  test("a call that failed is retried after the agent gave up on it", async () => {
    let asked = 0
    script = (request) => {
      if (textOf(request).includes("Your last tool call failed")) { failing = false; asked += 1; return { toolCalls: [{ name: "cad", args: { action: "describe" } }] } }
      if (lastIsTool(request)) return failing ? { text: "I could not read the drawing." } : { text: "The drawing has one element." }
      failing = true
      return { toolCalls: [{ name: "cad", args: { action: "describe" } }] }
    }
    const events = await run("describe it", "persist-4")
    failing = false
    expect(asked).toBe(1)
    expect((events.at(-1) as Extract<AiEvent, { type: "done" }>).text).toContain("The drawing has one element.")
  })

  test("it asks once or twice and then lets go if the agent keeps announcing without acting", async () => {
    let prompts = 0
    script = () => { prompts += 1; return { text: "Let me start:" } }
    const events = await run("build it", "persist-5")
    expect(events.at(-1)).toMatchObject({ type: "done" })
    expect(prompts).toBeLessThanOrEqual(4)
  })

  test("a finished answer and a question are left alone", async () => {
    let prompts = 0
    script = () => { prompts += 1; return { text: "Which material is the plate made of?" } }
    await run("make it machinable", "persist-6")
    expect(prompts).toBe(1)
    prompts = 0
    script = () => { prompts += 1; return { text: "The plate is 40 mm wide." } }
    await run("how wide is it", "persist-7")
    expect(prompts).toBe(1)
  })

  test("a long job is carried on far past the old six-continuation cap while every nudge makes progress", async () => {
    // Nine stages: after each tool result the agent announces the next stage instead of doing it, the way a long machining
    // job reads. Every nudge brings a tool call, so it is progress and the loop does not let go.
    let nudges = 0
    script = (request) => {
      if (textOf(request).includes("You said what you would do next")) { nudges += 1; return { toolCalls: [{ name: "cad_describe_drawing", args: {} }] } }
      if (lastIsTool(request)) return nudges < 9 ? { text: `Stage ${nudges + 1} is done. Next, I will start stage ${nudges + 2}:` } : { text: "All nine stages are done and checked." }
      return { text: "Let me start stage 1:" }
    }
    const events = await run("machine the whole part", "persist-long")
    expect(nudges).toBe(9)
    expect(events.at(-1)).toMatchObject({ type: "done" })
    expect((events.at(-1) as Extract<AiEvent, { type: "done" }>).text).toContain("All nine stages are done and checked.")
  })

  test("autoContinues: 0 gives the host's own behaviour", async () => {
    let prompts = 0
    script = () => { prompts += 1; return { text: "Let me start:" } }
    await run("build it", "persist-8", { autoContinues: 0 })
    expect(prompts).toBe(1)
  })
})

describe("the loop's limits are nikcli's", () => {
  test("resumes follow nikcli's retry curve: 2 s, doubling, never past 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(resumeDelay)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
  })
  test("one request may be carried on as often as nikcli's goal loop iterates", () => {
    expect(DEFAULT_AUTO_CONTINUES).toBe(50)
  })
})

describe("code_mode, the confined program runner", () => {
  test("a program loops over the agent's tools and returns one value; the host's other tools are refused", async () => {
    handlerCalls = []
    const program = `const results = []
for (let i = 0; i < 3; i++) { results.push(await tools.cad({ action: "describe" })) }
const refused = {}
for (const name of ["bash", "write", "task"]) {
  try { await tools[name]({ command: "echo hi", description: "x", filePath: "/tmp/cadcam-refused.txt", content: "x", prompt: "x", subagent_type: "general" }); refused[name] = "ran" } catch (e) { refused[name] = "refused" }
}
return { described: results.length, refused, fetch: typeof fetch, process: typeof process }`
    script = (request) => lastIsTool(request) ? { text: "Program finished." } : { toolCalls: [{ name: "code_mode", args: { code: program } }] }
    const events = await run("run a program", "persist-9")
    const result = events.find((e) => e.type === "tool_result" && e.tool === "code_mode") as Extract<AiEvent, { type: "tool_result" }>
    expect(result.ok, result.output).toBe(true)
    expect(JSON.parse(result.output)).toEqual({ described: 3, refused: { bash: "refused", write: "refused", task: "refused" }, fetch: "undefined", process: "undefined" })
    expect(handlerCalls.filter((c) => c === "describeDrawing").length).toBe(3)
    expect(existsSync("/tmp/cadcam-refused.txt")).toBe(false)
  })
})

describe("a message written while the agent works", () => {
  test("is taken in at the next step, reported once, and answered by the same turn", async () => {
    slow = 700
    const seen: string[] = []
    script = (request) => {
      seen.push(textOf(request))
      if (JSON.stringify(request.messages).includes("also make it 5 mm thick") && lastIsTool(request) === false) return { text: "Thickness set to 5 mm." }
      if (lastIsTool(request)) return JSON.stringify(request.messages).includes("also make it 5 mm thick") ? { text: "Thickness set to 5 mm." } : { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
      return { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
    }
    const host = await Effect.runPromise(runtime.host("persist-11"))
    const sessionId = await Effect.runPromise(createHostSession(host, "queue"))
    const collected = Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message: "describe the drawing", model, continues: 0, autoContinues: 0 })))
    await new Promise((r) => setTimeout(r, 400))
    await Effect.runPromise(queueHostMessage(host, sessionId, "also make it 5 mm thick", "queue"))
    const events = [...(await collected)]
    slow = 0
    expect(events.filter((e) => e.type === "user_message")).toEqual([{ type: "user_message", sessionId, text: "also make it 5 mm thick" }])
    expect(events.at(-1)).toMatchObject({ type: "done" })
    expect((events.at(-1) as Extract<AiEvent, { type: "done" }>).text).toContain("Thickness set to 5 mm.")
  })
})
