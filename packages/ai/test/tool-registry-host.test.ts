import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { z } from "zod"
import type { AiEvent } from "../src/events.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { defineTool } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { makeToolRegistry } from "../src/tools/tool-registry.ts"
import { startFakeOpenAi, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** The central registry drives a live host: a tool registered after the host started is callable in the next turn. */
const ran: string[] = []
const registry = makeToolRegistry({ handlers: {} as ToolHandlersShape })
const late = defineTool("ext_late_probe", {
  description: "Probe registered after the host started; answers with the value it was given.",
  parameters: z.object({ n: z.number() }),
  execute: async ({ n }) => { ran.push(`late:${n}`); return { ok: true, n } }
})

let script: (index: number) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((_request, index) => script(index))
const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.",
  toolsFor: registry.snapshot,
  toolChanges: registry.subscribe
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const turn = async (host: Awaited<ReturnType<typeof hostOf>>, sessionId: string) => {
  const events: AiEvent[] = []
  await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, message: "Call the probe", model: { providerID: "fake", modelID: "fake-model" }, autoContinues: 0 }), (event) => Effect.sync(() => { events.push(event) })))
  return events
}
const hostOf = (projectId: string) => Effect.runPromise(runtime.host(projectId))

describe("the tool registry and a live host", () => {
  test("a tool registered after the host started is published to it, runs, and is denied again once closed", async () => {
    const host = await hostOf("registry-live")
    const sessionId = await Effect.runPromise(createHostSession(host, "registry-live"))
    const callProbe = (n: number) => {
      let stage = 0
      script = () => ++stage === 1 ? { toolCalls: [{ name: "ext_late_probe", args: { n } }] } : { text: "Done." }
    }

    callProbe(1)
    await turn(host, sessionId)
    expect(ran).toEqual([]) // not registered yet: the host denies it

    const handle = await Effect.runPromise(registry.register(late))
    await Effect.runPromise(runtime.reloadTools()) // the subscription already queued it; this waits for the publication
    callProbe(2)
    const events = await turn(host, sessionId)
    expect(ran).toEqual(["late:2"])
    expect(events.at(-1)?.type).toBe("done")

    await Effect.runPromise(handle.close)
    await Effect.runPromise(runtime.reloadTools())
    callProbe(3)
    await turn(host, sessionId)
    expect(ran).toEqual(["late:2"])
  })
})
