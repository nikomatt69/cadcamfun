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

/** Stub a nikcli host so tests do not actually open the embedded client. */
const stubHost = (overrides?: {
  promptAsync?: (input: unknown) => Promise<unknown>
}): NikCliRuntime => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const promptAsync = overrides?.promptAsync ?? (async () => undefined)
  const host = {
    host: () =>
      Effect.tryPromise({
        try: async () => ({
          projectId: "p",
          directory: "/tmp",
          client: {
            session: {
              create: async (input: unknown) => {
                calls.push({ method: "session.create", args: [input] })
                return { id: "child" }
              },
              remove: async () => true
            },
            "session-prompt": {
              prompt: async (input: unknown) => {
                calls.push({ method: "prompt", args: [input] })
                return { parts: [{ type: "text", text: "ok" }] }
              },
              promptAsync: (async (input: unknown) => {
                calls.push({ method: "promptAsync", args: [input] })
                return await promptAsync(input)
              }) as never
            }
          }
        }),
        catch: () => new Error("host")
      })
  }
  return host as unknown as NikCliRuntime
}

/** A controllable runner: returns a promise per task that the test can settle. */
const controllableRunner = () => {
  const resolvers: Array<(text: string) => void> = []
  return {
    runner: () => new Promise<string>((resolve) => resolvers.push(resolve)),
    resolveAll: (text: string) => resolvers.forEach((resolve) => resolve(text)),
    /** Resolves once the runner has been invoked at least once (or timeout). */
    awaitInvoked: (timeoutMs = 1000) =>
      new Promise<void>((resolve) => {
        const start = Date.now()
        const tick = () => {
          if (resolvers.length > 0 || Date.now() - start > timeoutMs) return resolve()
          setTimeout(tick, 5)
        }
        tick()
      })
  }
}

describe("BackgroundToolsRunner", () => {
  test("scoped list / read: cross-project and cross-parent isolation", async () => {
    const stub = controllableRunner()
    const runner = new BackgroundToolsRunner(stubHost(), "project-a", { runner: stub.runner })
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
    await stub.awaitInvoked()
    stub.resolveAll("done")
    await runner.dispose()
  })

  test("cancelled worker does not produce a wake to the parent", async () => {
    let resolveRunner: (text: string) => void = () => {}
    const stub = stubHost()
    const runner = new BackgroundToolsRunner(stub, "project-cancel", {
      runner: () => new Promise<string>((resolve) => (resolveRunner = resolve))
    })
    const parentId = "parent-cancel"

    const task = runner.manager.enqueue({
      description: "noop",
      prompt: "anything",
      projectId: "project-cancel",
      parentSessionId: parentId
    })
    await drain(50)
    runner.manager.cancel({ projectId: "project-cancel", parentSessionId: parentId }, task.id)
    await runner.cancelForParent(parentId)
    await drain(100)
    expect(runner.manager.read({ projectId: "project-cancel", parentSessionId: parentId }, task.id).status).toBe("cancelled")
    resolveRunner("late text")
    await runner.dispose()
  })

  test("completed worker delivers findings to the parent via promptAsync", async () => {
    const seen: Array<{ sessionID: string; agent: string; text: string }> = []
    const stub = stubHost({
      promptAsync: async (input: unknown) => {
        const next = input as { sessionID: string; agent?: string; parts: Array<{ type: string; text: string }> }
        seen.push({
          sessionID: next.sessionID,
          agent: next.agent ?? "",
          text: next.parts.find((p) => p.type === "text")?.text ?? ""
        })
        return undefined
      }
    })
    const runner = new BackgroundToolsRunner(stub, "project-wake", {
      runner: async () => "verify toolpath notes"
    })
    const parentId = "parent-wake"
    const task = runner.manager.enqueue({
      description: "probe",
      prompt: "tell me",
      projectId: "project-wake",
      parentSessionId: parentId
    })
    await drain(80)
    expect(runner.manager.read({ projectId: "project-wake", parentSessionId: parentId }, task.id).status).toBe("completed")
    await runner.dispose()
    expect(seen.some((entry) => entry.sessionID === parentId && entry.agent === "cadcam" && entry.text.startsWith("[CADCAM_AGENT background findings]"))).toBe(true)
  })
})