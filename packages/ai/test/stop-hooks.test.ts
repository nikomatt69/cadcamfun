/**
 * Stop hooks (spec 08 "Stop hooks"): the operator file, Claude Code's exit-code contract against real processes, the minimal
 * environment, and the turn loop through the real embedded host.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { STOP_HOOK_PROMPT, createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { DEFAULT_STOP_REASON, decideStop, readStopHooksFile, runStopHook, runStopHooks, stopHookEnvironment, type StopHook, type StopHookInput, type StopHookSpec } from "../src/nikcli/stop-hooks.ts"
import { buildTools, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { startFakeOpenAi, type ChatRequestBody, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(60_000)

const dir = mkdtempSync(join(tmpdir(), "cadcam-stop-hooks-"))
const file = (name: string, content: string): string => {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}
/** A hook written as a Bun script, run by this very Bun binary so the test needs nothing on PATH. */
const script = (source: string, extra: Partial<StopHookSpec> = {}): StopHookSpec => ({ command: [process.execPath, file(`hook-${Math.random().toString(36).slice(2)}.ts`, source)], ...extra })
const input: StopHookInput = { sessionId: "s1", cwd: dir, stopHookActive: false, lastAssistantMessage: "Done.", openTodos: ["Check the fillets"] }

describe("the operator file", () => {
  test("a missing file means no hooks", async () => {
    expect(await Effect.runPromise(readStopHooksFile(join(dir, "absent.json")))).toEqual([])
  })
  test("a valid file is decoded as written", async () => {
    const path = file("valid.json", JSON.stringify({ stop: [{ command: ["bun", "run", "check"], timeoutMs: 30_000, environment: { STRICT: "1" } }] }))
    expect(await Effect.runPromise(readStopHooksFile(path))).toEqual([{ command: ["bun", "run", "check"], timeoutMs: 30_000, environment: { STRICT: "1" } }])
  })
  test("an unknown key, a shell string, an empty command, a bad timeout or bad JSON is a configuration error", async () => {
    for (const [name, content] of [
      ["extra.json", JSON.stringify({ stop: [{ command: ["x"], shell: true }] })],
      ["string.json", JSON.stringify({ stop: [{ command: "rm -rf /" }] })],
      ["empty.json", JSON.stringify({ stop: [{ command: [] }] })],
      ["timeout.json", JSON.stringify({ stop: [{ command: ["x"], timeoutMs: 10 }] })],
      ["top.json", JSON.stringify({ stop: [], preToolUse: [] })],
      ["bad.json", "{ stop: "]
    ] as const) {
      const exit = await Effect.runPromiseExit(readStopHooksFile(file(name, content)))
      expect(exit._tag, name).toBe("Failure")
      expect(JSON.stringify(exit), name).toContain("AiConfigError")
    }
  })
})

describe("Claude Code's decision contract", () => {
  test("exit codes and stdout decisions", () => {
    expect(decideStop(0, "", "")).toEqual({ decision: "allow" })
    expect(decideStop(0, "all good", "")).toEqual({ decision: "allow" })
    expect(decideStop(0, '{"decision":"block","reason":"Run the CAM verify first."}', "")).toEqual({ decision: "block", reason: "Run the CAM verify first." })
    expect(decideStop(0, '{"decision":"approve"}', "")).toEqual({ decision: "allow" })
    expect(decideStop(0, "{not json", "")).toEqual({ decision: "allow" })
    expect(decideStop(2, "", "  Two features fail the check.  ")).toEqual({ decision: "block", reason: "Two features fail the check." })
    expect(decideStop(2, "", "")).toEqual({ decision: "block", reason: DEFAULT_STOP_REASON })
    expect(decideStop(2, "", "x".repeat(10_000))).toMatchObject({ decision: "block", reason: "x".repeat(4_000) })
    expect(decideStop(1, "", "boom")).toEqual({ decision: "error", message: "exited with code 1: boom" })
    expect(decideStop(null, "", "")).toMatchObject({ decision: "error" })
  })

  test("real processes: allow, block on stdout, block on exit 2, a failing hook, a timeout and a missing program", async () => {
    expect(await Effect.runPromise(runStopHook(script("process.exit(0)"), input))).toEqual({ decision: "allow" })
    expect(await Effect.runPromise(runStopHook(script('console.log(JSON.stringify({ decision: "block", reason: "Verify the toolpath." }))'), input)))
      .toEqual({ decision: "block", reason: "Verify the toolpath." })
    expect(await Effect.runPromise(runStopHook(script('console.error("The part has no chamfer."); process.exit(2)'), input)))
      .toEqual({ decision: "block", reason: "The part has no chamfer." })
    expect(await Effect.runPromise(runStopHook(script('console.error("crashed"); process.exit(3)'), input))).toEqual({ decision: "error", message: "exited with code 3: crashed" })
    const started = Date.now()
    expect(await Effect.runPromise(runStopHook(script("await Bun.sleep(30_000)", { timeoutMs: 1_000 }), input))).toEqual({ decision: "error", message: "timed out after 1000 ms" })
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(await Effect.runPromise(runStopHook({ command: [join(dir, "no-such-program")] }, input))).toMatchObject({ decision: "error", message: expect.stringContaining("could not start") })
  })

  test("the hook reads the turn on stdin with Claude Code's field names", async () => {
    const outcome = await Effect.runPromise(runStopHook(script('const input = await Bun.stdin.json(); console.error(JSON.stringify(input)); process.exit(2)'), { ...input, stopHookActive: true }))
    expect(outcome.decision).toBe("block")
    expect(JSON.parse((outcome as { reason: string }).reason)).toEqual({
      hook_event_name: "Stop", session_id: "s1", cwd: dir, stop_hook_active: true, last_assistant_message: "Done.", open_todos: ["Check the fillets"]
    })
  })

  test("the environment holds no credential of the sidecar, only a path, its own variables and the event", async () => {
    process.env["CADCAMFUN_TEST_SECRET"] = "sk-must-not-leak"
    try {
      const env = stopHookEnvironment({ command: ["x"], environment: { STRICT: "1" } }, dir, { PATH: "/bin", HOME: "/home/u", OPENAI_API_KEY: "sk-x", CADCAMFUN_TEST_SECRET: "y" })
      expect(env).toEqual({ PATH: "/bin", HOME: "/home/u", STRICT: "1", CADCAMFUN_HOOK_EVENT: "stop", CADCAMFUN_PROJECT_DIR: dir })
      const outcome = await Effect.runPromise(runStopHook(script("console.error(JSON.stringify(process.env)); process.exit(2)"), input))
      const seen = JSON.parse((outcome as { reason: string }).reason) as Record<string, string>
      expect(seen["CADCAMFUN_TEST_SECRET"]).toBeUndefined()
      expect(seen["CADCAMFUN_HOOK_EVENT"]).toBe("stop")
      expect(seen["CADCAMFUN_PROJECT_DIR"]).toBe(dir)
    } finally { delete process.env["CADCAMFUN_TEST_SECRET"] }
  })

  test("hooks run in file order, the first block wins, and a failing hook never blocks", async () => {
    const marker = join(dir, "third-ran")
    const verdict = await Effect.runPromise(runStopHooks([
      script("process.exit(1)"),
      script('console.error("second"); process.exit(2)'),
      script(`await Bun.write(${JSON.stringify(marker)}, "ran")`)
    ])(input))
    expect(verdict).toEqual({ decision: "block", reason: "second" })
    expect(await Bun.file(marker).exists()).toBe(false)
    expect(await Effect.runPromise(runStopHooks([script("process.exit(1)")])(input))).toEqual({ decision: "allow" })
  })
})

describe("the turn loop", () => {
  const handlers = new Proxy({} as ToolHandlersShape, { get: () => async () => ({ total: 1, counts: { cube: 1 }, drawingId: "d", projectId: "p" }) })
  let model: (request: ChatRequestBody) => Completion = () => ({ text: "hi" })
  const fake = startFakeOpenAi((request) => model(request))
  const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
  const scope = Effect.runSync(Scope.make())
  let runtime: NikCliRuntime | undefined
  afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

  const run = async (project: string, stopHook: StopHook): Promise<ReadonlyArray<AiEvent>> => {
    runtime ??= await Effect.runPromise(makeNikCliRuntime({ dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are the main agent.", toolsFor: (projectId) => buildTools(handlers, projectId) }).pipe(Scope.provide(scope)))
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
    const host = await Effect.runPromise(runtime.host(project))
    const sessionId = await Effect.runPromise(createHostSession(host, "stop hooks"))
    return Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message: "Build the bracket", model: { providerID: "fake", modelID: "fake-model" }, continues: 0, stopHook }))).then((c) => [...c])
  }
  const lastIsTool = (request: ChatRequestBody) => request.messages.at(-1)?.role === "tool"
  const sawHookPrompt = (request: ChatRequestBody) => JSON.stringify(request.messages.at(-1)).includes("A stop hook reported")

  test("a block sends the agent back with the reason; the hook then allows the stop", async () => {
    const calls: StopHookInput[] = []
    const hook: StopHook = (call) => Effect.sync(() => {
      calls.push(call)
      return calls.length === 1 ? { decision: "block" as const, reason: "The fillets are not checked." } : { decision: "allow" as const }
    })
    model = (request) => sawHookPrompt(request) ? { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
      : lastIsTool(request) ? { text: "Fillets checked." } : { text: "The bracket is built." }
    const events = await run("stop-hook-block", hook)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ stopHookActive: false, lastAssistantMessage: "The bracket is built." })
    expect(calls[1]).toMatchObject({ stopHookActive: true, lastAssistantMessage: "Fillets checked." })
    expect(events.some((e) => e.type === "turn" && e.phase === "continuing" && e.reason === `${STOP_HOOK_PROMPT}The fillets are not checked.`)).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "done", text: "The bracket is built.\n\nFillets checked." })
  })

  test("a hook that always blocks cannot keep the turn alive: it ends at the stall bound with an error", async () => {
    let calls = 0
    const hook: StopHook = () => Effect.sync(() => { calls += 1; return { decision: "block" as const, reason: "Not yet." } })
    model = () => ({ text: "I think it is finished." })
    const events = await run("stop-hook-always", hook)
    expect(calls).toBe(3)
    expect(events.at(-1)).toMatchObject({ type: "error", code: "internal", message: expect.stringContaining("no progress") })
  })

  test("a turn that failed is never handed to the hooks", async () => {
    let calls = 0
    const hook: StopHook = () => Effect.sync(() => { calls += 1; return { decision: "allow" as const } })
    model = () => ({ status: 401, body: JSON.stringify({ error: { message: "invalid api key" } }) })
    const events = await run("stop-hook-error", hook)
    expect(calls).toBe(0)
    expect(events.at(-1)).toMatchObject({ type: "error" })
  })

  test("end to end with a real command: exit 2 sends the agent back, exit 0 lets it stop", async () => {
    const flag = join(dir, "e2e-blocked-once")
    const hook = runStopHooks([script(`
      const input = await Bun.stdin.json()
      if (!input.stop_hook_active && !(await Bun.file(${JSON.stringify(flag)}).exists())) {
        await Bun.write(${JSON.stringify(flag)}, "1")
        console.error("Run cad_describe_drawing to verify the model.")
        process.exit(2)
      }
    `)])
    model = (request) => sawHookPrompt(request) ? { toolCalls: [{ name: "cad_describe_drawing", args: {} }] }
      : lastIsTool(request) ? { text: "Verified: one cube." } : { text: "Built." }
    const events = await run("stop-hook-e2e", hook)
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Built.\n\nVerified: one cube." })
    expect(events.some((e) => e.type === "tool_result" && e.ok)).toBe(true)
  })
})
