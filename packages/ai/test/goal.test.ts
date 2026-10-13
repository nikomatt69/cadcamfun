import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { formatGoalStatus, goalArgumentsOf, goalSubcommandTexts, parseGoalArguments, type HostGoalState } from "../src/nikcli/goal.ts"
import { hostChatStream } from "../src/nikcli/chat.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { startFakeOpenAi, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

const goal = (extra: Partial<HostGoalState> = {}): HostGoalState => ({ sessionID: "s", objective: "Machine the bracket", status: "active", tokensUsed: 1200, timeUsedSeconds: 125, iterationCount: 3, ...extra })

describe("/goal, as nikcli parses it", () => {
  test("a subcommand, or an objective with an optional token budget", () => {
    for (const command of ["pause", "resume", "clear", "status"] as const) expect(parseGoalArguments(` ${command} `)).toEqual({ type: "subcommand", command })
    expect(parseGoalArguments("Make the plate 140 mm wide")).toEqual({ type: "objective", objective: "Make the plate 140 mm wide" })
    expect(parseGoalArguments("Rough the pocket --token-budget 50000 and verify")).toEqual({ type: "objective", objective: "Rough the pocket  and verify", tokenBudget: 50000 })
    expect(parseGoalArguments("--token-budget 10 Do it")).toEqual({ type: "objective", objective: "Do it", tokenBudget: 10 })
  })

  test("a bad budget is refused with nikcli's wording", () => {
    for (const bad of ["x --token-budget", "x --token-budget abc", "x --token-budget 0", "x --token-budget -5", "x --token-budget 1.5"]) {
      expect(() => parseGoalArguments(bad), bad).toThrow("--token-budget must be a positive integer")
    }
  })

  test("a message is a goal line only when it starts with /goal", () => {
    expect(goalArgumentsOf("/goal Build a flange")).toBe("Build a flange")
    expect(goalArgumentsOf("  /goal   pause  ")).toBe("pause")
    expect(goalArgumentsOf("/goal")).toBe("status")
    expect(goalArgumentsOf("/GOAL clear")).toBe("clear")
    expect(goalArgumentsOf("/goals now")).toBeUndefined()
    expect(goalArgumentsOf("please /goal x")).toBeUndefined()
    expect(goalArgumentsOf("make a goal")).toBeUndefined()
  })

  test("the status and the host's own texts read as nikcli's", () => {
    expect(formatGoalStatus(undefined)).toBe("No active goal is set for this session.")
    expect(formatGoalStatus(goal())).toBe(["Objective: Machine the bracket", "Status: active", "Tokens: 1200", "Iterations: 3 / 50", "Time used: 2m 5s"].join("\n"))
    expect(formatGoalStatus(goal({ tokenBudget: 5000, status: "budget_limited" }))).toContain("Tokens: 1200 / 5000")
    expect(goalSubcommandTexts("pause", goal())).toEqual(["Goal paused: Machine the bracket"])
    expect(goalSubcommandTexts("resume", undefined)).toEqual(["No paused goal to resume."])
    expect(goalSubcommandTexts("clear", goal())).toEqual(["Goal cleared: Machine the bracket"])
  })
})

/** The stream against a scripted host: what the application does with the line, before any model is involved. */
describe("/goal in the chat stream", () => {
  const run = (host: unknown, message: string) => Effect.runPromise(Stream.runCollect(hostChatStream({
    host: host as never, sessionId: "s", message, goalArguments: goalArgumentsOf(message), model: { providerID: "fake", modelID: "fake-model" }, agent: "cadcam-ask", continues: 0, autoContinues: 0
  }))).then((events) => [...events] as AiEvent[])
  /** A host whose goal answers the commands the way the pinned one does: it changes, and the command's own reply is the part that fails. */
  const fakeHost = (initial: HostGoalState | null, commands: unknown[] = [], prompts: unknown[] = [], replyFails = false) => {
    let current = initial
    return { client: {
      events: { subscribe: async function* () { yield { type: "server.connected", properties: {} } } },
      session: {
        goal: async () => current,
        command: async (input: { arguments: string }) => {
          commands.push(input)
          if (current !== null && input.arguments === "pause") current = { ...current, status: "paused" }
          if (current !== null && input.arguments === "resume") current = { ...current, status: "active" }
          if (input.arguments === "clear") current = null
          if (replyFails) throw new Error("UnexpectedStatus")
          return { info: { id: "m", role: "user" }, parts: [] }
        },
        messages: async () => []
      },
      "session-prompt": { prompt: async (input: unknown) => { prompts.push(input); return { info: { id: "a", role: "assistant", finish: "stop" }, parts: [{ type: "text", id: "t", text: "ok" }] } } }
    } }
  }

  test("status is read from the host and never starts a turn", async () => {
    const commands: unknown[] = [], prompts: unknown[] = []
    const events = await run(fakeHost(goal(), commands, prompts), "/goal")
    expect(commands).toEqual([])
    expect(prompts).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: "done", text: formatGoalStatus(goal()) })
  })

  test("pause, resume and clear go through the host's own command, with the role and model of the turn", async () => {
    const commands: unknown[] = []
    const events = await run(fakeHost(goal(), commands), "/goal pause")
    expect(commands).toEqual([{ sessionID: "s", command: "goal", arguments: "pause", agent: "cadcam-ask", model: "fake/fake-model" }])
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Goal paused: Machine the bracket" })
    // The pinned host applies the change and then fails to encode its reply: the effect, read back, is what counts.
    const encoded = await run(fakeHost(goal(), [], [], true), "/goal pause")
    expect(encoded.at(-1)).toMatchObject({ type: "done", text: "Goal paused: Machine the bracket" })
    const none = await run(fakeHost(null), "/goal clear")
    expect(none.at(-1)).toMatchObject({ type: "done", text: "No active goal to clear." })
  })

  test("a command that changed nothing and failed is an error", async () => {
    const host = fakeHost(goal(), [], [], true)
    host.client.session.command = async () => { throw new Error("The host is gone") }
    const events = await run(host, "/goal pause")
    expect(events.at(-1)).toMatchObject({ type: "error", code: "provider" })
    expect((events.at(-1) as { message: string }).message).toContain("The host is gone")
  })

  test("a bad budget or an empty objective is a configuration error, and nothing reaches the host", async () => {
    const commands: unknown[] = [], prompts: unknown[] = []
    for (const line of ["/goal fix it --token-budget nope", "/goal --token-budget 5"]) {
      const events = await run(fakeHost(null, commands, prompts), line)
      expect(events.at(-1), line).toMatchObject({ type: "error", code: "config" })
    }
    expect(commands).toEqual([])
    expect(prompts).toEqual([])
  })

  test("an objective runs as the host's goal command instead of a prompt, once, and its brief is not reported as the user's words", async () => {
    const commands: unknown[] = [], prompts: unknown[] = []
    const host = fakeHost(null, commands, prompts)
    const events = await run({ client: { ...host.client, events: { subscribe: async function* () {
      yield { type: "server.connected", properties: {} }
      // What the host writes when it runs the command: its own brief as a user message of the session.
      yield { type: "message.updated", properties: { info: { id: "u1", sessionID: "s", role: "user" } } }
      yield { type: "message.part.updated", properties: { part: { id: "p1", sessionID: "s", messageID: "u1", type: "text", text: "<objective>Build a flange</objective> work until done" } } }
    } } } }, "/goal Build a flange --token-budget 9000")
    expect(prompts).toEqual([])
    expect(commands).toEqual([{ sessionID: "s", command: "goal", arguments: "Build a flange --token-budget 9000", agent: "cadcam-ask", model: "fake/fake-model" }])
    expect(events.some((e) => e.type === "user_message")).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "done" })
  })
})

/** The pinned host itself: its `goal` command, our config, the agent's own goal tools. */
describe("/goal on the embedded host", () => {
  let script: (index: number) => Completion = () => ({ text: "hi" })
  const fake = startFakeOpenAi((_request, index) => script(index))
  const provider: HostProviderSpec = { id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }] }
  const scope = Effect.runSync(Scope.make())
  afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

  test("sets the goal, the agent completes it with its own tool, and the status reads it back", async () => {
    const runtime = await Effect.runPromise(makeNikCliRuntime({ dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider], systemPrompt: "You are a CAD test assistant.", toolsFor: () => [] }).pipe(Scope.provide(scope)))
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
    const host = await Effect.runPromise(runtime.host("goal-host"))
    const session = await host.client.session.create({ title: "Goal" })
    const stream = (message: string) => Effect.runPromise(Stream.runCollect(hostChatStream({
      host, sessionId: session.id, message, goalArguments: goalArgumentsOf(message), model: { providerID: "fake", modelID: "fake-model" }, continues: 0, autoContinues: 0
    }))).then((events) => [...events] as AiEvent[])

    expect((await stream("/goal status")).at(-1)).toMatchObject({ type: "done", text: "No active goal is set for this session." })

    script = (index) => index === 0 ? { toolCalls: [{ name: "update_goal", args: { status: "complete" } }] } : { text: "The plate is finished and checked." }
    const events = await stream("/goal Make a 140 x 50 plate --token-budget 90000")
    const goals = events.filter((e): e is Extract<AiEvent, { type: "goal" }> => e.type === "goal")
    expect(goals[0]?.goal).toMatchObject({ objective: "Make a 140 x 50 plate", status: "active", tokenBudget: 90000 })
    expect(goals.at(-1)?.goal).toMatchObject({ objective: "Make a 140 x 50 plate", status: "complete" })
    expect(events.at(-1)).toMatchObject({ type: "done" })
    expect(events.some((e) => e.type === "user_message")).toBe(false)

    const status = await stream("/goal status")
    expect((status.at(-1) as { text: string }).text).toContain("Status: complete")
    const cleared = await stream("/goal clear")
    expect(cleared.at(-1)).toMatchObject({ type: "done", text: "Goal cleared: Make a 140 x 50 plate" })
    expect((await stream("/goal status")).at(-1)).toMatchObject({ text: "No active goal is set for this session." })
  })
})
