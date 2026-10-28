import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { PRIMARIES } from "../src/nikcli/primaries.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** The plan-mode and build-switch reminders (spec 64) against the pinned host: sent when the primary changes, never repeated. */
const fake = startFakeOpenAi(() => ({ text: "ok" }))
const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.", toolsFor: () => []
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const model = { providerID: "fake", modelID: "fake-model" } as const
const count = (request: { messages: ReadonlyArray<unknown> }, needle: string): number => JSON.stringify(request.messages).split(needle).length - 1
const PLAN = "Plan mode is active"
const SWITCH = "mode has changed from plan to build"

describe("primary-change reminders in the host session", () => {
  test("Plan gets its rules once, the switch to Build gets its reminder once", async () => {
    const host = await Effect.runPromise(runtime.host("reminders-host"))
    const sessionId = await Effect.runPromise(createHostSession(host, "reminders"))
    const turn = async (agent: string, message: string) => {
      const before = fake.requests.length
      await Effect.runPromise(Stream.runDrain(hostChatStream({ host, sessionId, message, model, autoContinues: 0, agent })))
      return fake.requests[before]!
    }
    const one = await turn(PRIMARIES.plan.host, "plan a bracket")
    expect(count(one, PLAN)).toBe(1)
    expect(count(one, SWITCH)).toBe(0)

    const two = await turn(PRIMARIES.plan.host, "and the holes")
    expect(count(two, PLAN)).toBe(1)

    const three = await turn(PRIMARIES.build.host, "go")
    expect(count(three, PLAN)).toBe(1)
    expect(count(three, SWITCH)).toBe(1)

    const four = await turn(PRIMARIES.build.host, "continue")
    expect(count(four, SWITCH)).toBe(1)

    // Back to Plan: its rules are due again, once more.
    const five = await turn(PRIMARIES.plan.host, "re-plan")
    expect(count(five, PLAN)).toBe(2)
  })

  test("a first Build turn adds no reminder, and the permission-mode suffix does not change the answer", async () => {
    const host = await Effect.runPromise(runtime.host("reminders-host"))
    const sessionId = await Effect.runPromise(createHostSession(host, "reminders-build"))
    const before = fake.requests.length
    await Effect.runPromise(Stream.runDrain(hostChatStream({ host, sessionId, message: "build it", model, autoContinues: 0, agent: `${PRIMARIES.build.host}-auto` })))
    const request = fake.requests[before]!
    // The host adds its own reminder in Auto mode; ours must be absent.
    expect(count(request, PLAN)).toBe(0)
    expect(count(request, SWITCH)).toBe(0)

    const planSession = await Effect.runPromise(createHostSession(host, "reminders-plan-ask"))
    const start = fake.requests.length
    await Effect.runPromise(Stream.runDrain(hostChatStream({ host, sessionId: planSession, message: "plan it", model, autoContinues: 0, agent: `${PRIMARIES.plan.host}-ask` })))
    expect(count(fake.requests[start]!, PLAN)).toBe(1)
  })
})
