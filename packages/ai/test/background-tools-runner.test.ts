import { afterAll, describe, expect, test } from "bun:test"
import { Effect, Scope } from "effect"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { BackgroundToolsRunner } from "../src/nikcli/background-tools-runner.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

const fake = startFakeOpenAi(() => ({ text: "ok" }))
void fake
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
    systemPrompt: "You are the parent.",
    toolsFor: () => [],
    hostLogs: (level, line) => { if (level === "warn" || level === "error") console.log("HOSTLOG", line.slice(0, 300)) }
  }).pipe(Scope.provide(scope))
)
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))

afterAll(async () => {
  await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
  fake.stop()
})

const drain = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe("BackgroundToolsRunner", () => {
  test("scoped list / read: cross-project and cross-parent isolation", async () => {
    const runner = new BackgroundToolsRunner(runtime, "project-a")
    const a = runner.manager.enqueue({
      description: "scan",
      prompt: "look",
      projectId: "project-a",
      parentSessionId: "session-a"
    })
    const b = runner.manager.enqueue({
      description: "scan2",
      prompt: "look again",
      projectId: "project-a",
      parentSessionId: "session-a"
    })
    expect(["queued", "running", "completed"]).toContain(a.status)
    expect(["queued", "running", "completed"]).toContain(b.status)
    expect(runner.manager.list({ projectId: "project-a", parentSessionId: "session-a" }).length).toBe(2)
    expect(runner.manager.list({ projectId: "other", parentSessionId: "session-a" }).length).toBe(0)
    expect(() => runner.manager.read({ projectId: "project-a", parentSessionId: "session-b" }, a.id)).toThrow()
    runner.manager.cancel({ projectId: "project-a", parentSessionId: "session-a" }, b.id)
    expect(runner.manager.read({ projectId: "project-a", parentSessionId: "session-a" }, b.id).status).toBe("cancelled")
    await runner.dispose()
  })

  test("cancelled worker does not produce a wake to the parent", async () => {
    let resolveRunner: (text: string) => void = () => {}
    const runner = new BackgroundToolsRunner(runtime, "project-cancel", {
      runner: () => new Promise<string>((resolve) => (resolveRunner = resolve))
    })
    const parentId = "parent-cancel"

    const task = runner.manager.enqueue({
      description: "noop",
      prompt: "anything",
      projectId: "project-cancel",
      parentSessionId: parentId
    })
    await new Promise<void>((r) => setImmediate(r))
    runner.manager.cancel({ projectId: "project-cancel", parentSessionId: parentId }, task.id)
    await runner.cancelForParent(parentId)
    await drain(400)
    expect(runner.manager.read({ projectId: "project-cancel", parentSessionId: parentId }, task.id).status).toBe("cancelled")
    resolveRunner("late text")
    await runner.dispose()
  })

  test("completed worker delivers findings to the parent via promptAsync", async () => {
    const seen: Array<{ sessionID: string; agent: string; text: string }> = []
    const host = await Effect.runPromise(runtime.host("project-wake"))
    const parentId = "parent-wake"
    const originalPromptAsync = host.client["session-prompt"].promptAsync.bind(host.client["session-prompt"])
    host.client["session-prompt"].promptAsync = (async (input: unknown) => {
      const next = input as { sessionID: string; agent?: string; parts: Array<{ type: string; text: string }> }
      seen.push({
        sessionID: next.sessionID,
        agent: next.agent ?? "",
        text: next.parts.find((p) => p.type === "text")?.text ?? ""
      })
      return await originalPromptAsync(input as never)
    }) as never

    const runner = new BackgroundToolsRunner(runtime, "project-wake", {
      runner: async () => "verify toolpath notes"
    })
    const task = runner.manager.enqueue({
      description: "probe",
      prompt: "tell me",
      projectId: "project-wake",
      parentSessionId: parentId
    })
    await drain(200)
    expect(runner.manager.read({ projectId: "project-wake", parentSessionId: parentId }, task.id).status).toBe("completed")
    await runner.dispose()
    expect(seen.some((entry) => entry.sessionID === parentId && entry.agent === "cadcam" && entry.text.startsWith("[CADCAM_AGENT background findings]"))).toBe(true)
  })
})