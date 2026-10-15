import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { projectHabitsFile } from "../src/nikcli/project-files.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { renderUserHabits } from "../src/project-context.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** The gate of AI-11 Step 6: the provider's effective request carries each source once, and none when context is disabled. */
const fake = startFakeOpenAi(() => ({ text: "ok" }))
const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.", toolsFor: () => []
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const model = { providerID: "fake", modelID: "fake-model" } as const
const SENTINEL = "HABIT_SENTINEL_prefers_climb_milling"
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe("the host's effective request", () => {
  test("Brain's habits never reach the model through the host; the application's assembly delivers them once", async () => {
    const host = await Effect.runPromise(runtime.host("context-native"))
    const habits = projectHabitsFile(host.directory)
    mkdirSync(join(host.directory, ".nikcli"), { recursive: true })
    writeFileSync(habits, `# User habits\n\n${SENTINEL}\n`)
    const turn = async (system?: string) => {
      const before = fake.requests.length
      const sessionId = await Effect.runPromise(createHostSession(host, "context"))
      await Effect.runPromise(Stream.runDrain(hostChatStream({ host, sessionId, message: "hello", model, autoContinues: 0, ...(system ? { system } : {}) })))
      return JSON.stringify(fake.requests.slice(before))
    }
    // Context disabled: the application sends nothing, and the host's automatic reminder adds nothing either.
    expect(occurrences(await turn(), SENTINEL)).toBe(0)
    // Context enabled: the one block the assembly rendered, once per request.
    const requests = await turn(renderUserHabits(`${SENTINEL}\n`))
    const first = JSON.stringify(fake.requests.at(-1))
    expect(occurrences(first, SENTINEL)).toBe(1)
    expect(occurrences(requests, SENTINEL)).toBeGreaterThan(0)
  })
})
