import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { buildTools } from "../src/tools/registry.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { definePluginTool, pluginToolId } from "../src/tools/plugin-tool.ts"
import { startFakeOpenAi, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** A plugin's tools in the pinned host: the read tool runs, the write tool waits for the person, and a refusal changes nothing. */
const ran: string[] = []
const listing = (id: string, kind: "read" | "write") => ({ pluginId: "com.example.gear", pluginName: "Gear", id, kind, description: `Plugin tool ${id}, called by the assistant.`, parameters: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } })
const readTool = definePluginTool(listing("look", "read"), async (args) => { ran.push("look"); return { ok: true, args } })
const writeTool = definePluginTool(listing("change", "write"), async (args) => { ran.push("change"); return { ok: true, args } })

let script: (index: number) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((_request, index) => script(index))
const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.",
  toolsFor: (projectId) => buildTools({} as ToolHandlersShape, projectId, [readTool, writeTool])
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

describe("plugin tools in the embedded host", () => {
  for (const decision of ["once", "reject"] as const) {
    test(`default role: the read tool runs unasked, the write tool asks once and ${decision === "once" ? "runs after approval" : "does nothing when refused"}`, async () => {
      ran.length = 0
      const host = await Effect.runPromise(runtime.host(`plugin-tools-${decision}`))
      let stage = 0
      script = () => ++stage === 1
        ? { toolCalls: [{ name: pluginToolId("com.example.gear", "look"), args: { n: 1 } }] }
        : stage === 2 ? { toolCalls: [{ name: pluginToolId("com.example.gear", "change"), args: { n: 2 } }] } : { text: "Done." }
      const sessionId = await Effect.runPromise(createHostSession(host, decision))
      const events: AiEvent[] = []
      const asked: string[] = []
      await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, message: "Use the plugin", model: { providerID: "fake", modelID: "fake-model" }, autoContinues: 0 }), (event) => Effect.promise(async () => {
        events.push(event)
        if (event.type === "permission_request") {
          asked.push(event.permission)
          // Nothing of the write tool has run while the person is being asked.
          expect(ran).toEqual(["look"])
          await host.client.permission.reply({ requestID: event.requestId, reply: decision })
        }
      })))
      expect(asked).toEqual([pluginToolId("com.example.gear", "change")])
      expect(ran).toEqual(decision === "once" ? ["look", "change"] : ["look"])
      expect(events.at(-1)?.type).toBe("done")
    })
  }
})
