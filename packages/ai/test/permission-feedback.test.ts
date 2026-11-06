/**
 * Rejecting a permission with feedback (spec 08 "Rejecting a permission with feedback"): nikcli's `PermissionCorrectedError`
 * keeps the host's step loop going, and the turn loop treats the correction as something to act on, never as a final refusal.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { continuationFor, correctionOf, createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { buildTools, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { startFakeOpenAi, type ChatRequestBody, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90_000)

const CORRECTED = "The user rejected permission to use this specific tool call with the following feedback: Use a 30 mm cube instead."
const REJECTED = "The user rejected permission to use this specific tool call."

describe("the loop reads a correction as work to do", () => {
  test("the correction is extracted from nikcli's text; a plain rejection has none", () => {
    expect(correctionOf(CORRECTED)).toBe("Use a 30 mm cube instead.")
    expect(correctionOf(REJECTED)).toBeUndefined()
    expect(correctionOf("Error: " + CORRECTED)).toBe("Use a 30 mm cube instead.")
  })

  test("a correction sends the agent back with the person's words; a plain rejection never does", () => {
    const base = { todos: [], toolErrors: new Map<string, string>() }
    const nudge = continuationFor({ ...base, lastToolError: CORRECTED }, "Understood.", "stop")
    expect(nudge).toContain('said what to do instead: "Use a 30 mm cube instead."')
    expect(nudge).toContain("do not repeat the rejected one")
    expect(continuationFor({ ...base, lastToolError: REJECTED }, "Understood.", "stop")).toBeUndefined()
  })

  test("with an open plan the correction comes first, and a corrected tool is not listed as refused", () => {
    const state = { todos: [{ content: "Add the cube", status: "pending" }], lastToolError: CORRECTED, toolErrors: new Map([["cad_edit", CORRECTED]]) }
    const nudge = continuationFor(state, "Noted.", "stop")!
    expect(nudge).toContain("Use a 30 mm cube instead.")
    expect(nudge).not.toContain("refused by the permission mode")
  })
})

describe("through the real host", () => {
  const added: unknown[] = []
  const handlers = new Proxy({} as ToolHandlersShape, {
    get: (_t, name: string) => async (...args: unknown[]) => {
      if (name === "addElements") {
        const batch = args[1] as ReadonlyArray<Record<string, unknown>>
        added.push(batch)
        return { ok: true, ids: batch.map((_, i) => `e${i}`), elements: batch.map((e, i) => ({ ...e, id: `e${i}` })), drawingId: "d", projectId: "p" }
      }
      return { total: 1, counts: { cube: 1 }, drawingId: "d", projectId: "p" }
    }
  })
  let model: (request: ChatRequestBody) => Completion = () => ({ text: "hi" })
  const requests: ChatRequestBody[] = []
  const fake = startFakeOpenAi((request) => { requests.push(request); return model(request) })
  const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
  const scope = Effect.runSync(Scope.make())
  let runtime: NikCliRuntime | undefined
  afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

  const cube = (width: number) => ({ toolCalls: [{ name: "cad_edit", args: { action: "add", elements: [{ type: "cube", width, height: width, depth: width }] } }] })
  const lastText = (request: ChatRequestBody) => JSON.stringify(request.messages.at(-1))
  const run = async (project: string, answer: (event: Extract<AiEvent, { type: "permission_request" }>, index: number) => { reply: "once" | "always" | "reject"; message?: string }) => {
    runtime ??= await Effect.runPromise(makeNikCliRuntime({ dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are the main agent.", toolsFor: (projectId) => buildTools(handlers, projectId) }).pipe(Scope.provide(scope)))
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
    const host = await Effect.runPromise(runtime.host(project))
    const sessionId = await Effect.runPromise(createHostSession(host, "feedback"))
    const events: AiEvent[] = []
    let asked = 0
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, agent: "cadcam-build-ask", message: "Add a cube", model: { providerID: "fake", modelID: "fake-model" }, continues: 0 }), (event) => Effect.promise(async () => {
      events.push(event)
      if (event.type === "permission_request") {
        const { reply, message } = answer(event, asked++)
        await host.client.permission.reply({ requestID: event.requestId, reply, ...(message ? { message } : {}) })
      }
    })))
    return events
  }

  test("a rejection with feedback keeps the turn going: the model reads the correction and the next call follows it", async () => {
    added.length = 0
    requests.length = 0
    model = (request) => {
      const last = lastText(request)
      if (last.includes("with the following feedback")) return { text: "Understood, a smaller cube." }
      if (last.includes("said what to do instead")) return cube(30)
      if (request.messages.at(-1)?.role === "tool") return { text: "Added a 30 mm cube." }
      return cube(50)
    }
    const events = await run("feedback-correction", (_event, index) => index === 0 ? { reply: "reject", message: "Use a 30 mm cube instead." } : { reply: "once" })
    // The host kept its loop going after the corrected rejection: the model was asked again, with the person's words.
    expect(requests.some((request) => lastText(request).includes("Use a 30 mm cube instead."))).toBe(true)
    // The model only acknowledged it; the turn loop sent it back to act on the correction.
    expect(events.some((e) => e.type === "turn" && e.phase === "continuing" && (e.reason ?? "").includes("Use a 30 mm cube instead."))).toBe(true)
    expect(added).toHaveLength(1)
    expect(JSON.stringify(added[0])).toContain('"width":30')
    expect(events.at(-1)).toMatchObject({ type: "done" })
  })

  test("a plain rejection stays final: no correction nudge, no second attempt", async () => {
    added.length = 0
    requests.length = 0
    model = (request) => request.messages.at(-1)?.role === "tool" ? { text: "The cube was not added." } : cube(50)
    const events = await run("feedback-plain", () => ({ reply: "reject" }))
    expect(events.filter((e) => e.type === "permission_request")).toHaveLength(1)
    expect(events.some((e) => e.type === "turn" && e.phase === "continuing")).toBe(false)
    expect(added).toHaveLength(0)
  })
})
