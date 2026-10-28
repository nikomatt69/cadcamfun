import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { readDeliveredObservation } from "../src/nikcli/context.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { OBSERVATION_METADATA_KEY, planObservation, type ObservationInput } from "../src/context-assembly.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** Spec 64 Phase 1 against the pinned host: the observation is one synthetic part, sent only when it changed, history append-only. */
const fake = startFakeOpenAi(() => ({ text: "ok" }))
const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.", toolsFor: () => []
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const model = { providerID: "fake", modelID: "fake-model" } as const
const stable = "Project rules: ISO 2768-mK."
const stateA: ObservationInput = { text: "Workspace: CAD editor, drawing \"Bracket\".\nModel: 2 elements; 1 selected (e-1).", drawingId: "d-1" }
const stateB: ObservationInput = { ...stateA, text: `${stateA.text}\nModel: 3 elements; 2 selected (e-1, e-2).` }

describe("the observation part in the host session", () => {
  test("sent when new, absent when unchanged, one more part when it changed; earlier messages are never rewritten", async () => {
    const host = await Effect.runPromise(runtime.host("observation-host"))
    const sessionId = await Effect.runPromise(createHostSession(host, "observation"))
    const turn = async (message: string, observation: ObservationInput | undefined) => {
      const delivered = await Effect.runPromise(readDeliveredObservation(host, sessionId))
      const plan = planObservation(observation, delivered)
      const before = fake.requests.length
      await Effect.runPromise(Stream.runDrain(hostChatStream({ host, sessionId, message, system: stable, model, autoContinues: 0, ...(plan.part ? { observation: plan.part } : {}) })))
      return { plan, request: fake.requests[before]!, count: fake.requests.length - before }
    }
    const text = (value: unknown) => JSON.stringify(value)
    const states = (request: { messages: ReadonlyArray<unknown> }) => text(request.messages).split("<editor_state").length - 1

    const one = await turn("first question", stateA)
    expect(one.plan.status).toBe("sent")
    expect(states(one.request)).toBe(1)
    expect(text(one.request.messages)).toContain("supersedes every earlier editor_state")
    // The host stored the part with its attribute: that is where the next turn reads the digest from.
    const stored = await host.client.session.messages({ sessionID: sessionId })
    const part = stored.flatMap((message) => message.parts).find((candidate) => candidate.type === "text" && candidate.text?.startsWith("<editor_state"))
    expect(part?.metadata?.[OBSERVATION_METADATA_KEY]).toBe(one.plan.digest!)
    expect(await Effect.runPromise(readDeliveredObservation(host, sessionId))).toBe(one.plan.digest!)

    // Same state: nothing is appended, and the whole earlier request is the prefix of this one.
    const two = await turn("second question", stateA)
    expect(two.plan.status).toBe("unchanged")
    expect(states(two.request)).toBe(1)
    const prefix = one.request.messages.filter((message) => message.role !== "system")
    expect(two.request.messages.filter((message) => message.role !== "system").slice(0, prefix.length)).toEqual(prefix)
    expect(two.request.messages.filter((message) => message.role === "system")).toEqual(one.request.messages.filter((message) => message.role === "system"))

    // A change appends exactly one part; the first one is still byte-identical in the history.
    const three = await turn("third question", stateB)
    expect(three.plan.status).toBe("sent")
    expect(states(three.request)).toBe(2)
    const kept = two.request.messages.filter((message) => message.role !== "system")
    expect(three.request.messages.filter((message) => message.role !== "system").slice(0, kept.length)).toEqual(kept)
    expect(three.request.messages.filter((message) => message.role === "system")).toEqual(one.request.messages.filter((message) => message.role === "system"))
    expect(await Effect.runPromise(readDeliveredObservation(host, sessionId))).toBe(three.plan.digest!)

    // Going back to the first state is a change again: the newest delivery is what the session holds.
    const four = await turn("fourth question", stateA)
    expect(four.plan.status).toBe("sent")
    expect(states(four.request)).toBe(3)
  })

  test("the user's typed message stays the turn's text: the synthetic part never shows as a user message", async () => {
    const host = await Effect.runPromise(runtime.host("observation-host"))
    const sessionId = await Effect.runPromise(createHostSession(host, "observation-visible"))
    const plan = planObservation(stateA, undefined)
    const events: Array<{ type: string }> = []
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, message: "typed words", system: stable, model, autoContinues: 0, observation: plan.part! }), (event) => Effect.sync(() => { events.push(event) })))
    expect(events.filter((event) => event.type === "user_message")).toEqual([])
    const user = (await host.client.session.messages({ sessionID: sessionId })).find((message) => message.info.role === "user")!
    expect(user.parts.map((candidate) => [candidate.type, (candidate as { synthetic?: boolean }).synthetic ?? false])).toEqual([["text", false], ["text", true]])
    expect(user.parts[0]?.text).toBe("typed words")
  })
})
