/**
 * The modules the AI store is made of (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * The store used to answer "what does a streamed event do to the conversation?"
 * in one long chain that touched eight signals at once. That question now lives
 * in `store/events.ts`, the host's session commands in `store/controls.ts` and the
 * conversations in `store/sessions.ts` — each with an interface the test can
 * stand in for.
 */
import { describe, expect, test } from "bun:test"
import { createEventApplier } from "../src/features/ai/store/events.ts"
import { createControls } from "../src/features/ai/store/controls.ts"
import { createSessions } from "../src/features/ai/store/sessions.ts"
import type { EventContext } from "../src/features/ai/store/events.ts"
import type { AiActivity, AiEvent, AiGoal, AiMessage, AiPermission, AiPendingQuestion, AiStats, AiTask, AiTodo, AiToolCalls } from "../src/features/ai/lib/types.ts"

/** A store context that records what the applier did, with nothing else around it. */
interface Harness {
  readonly ctx: EventContext
  readonly messages: () => ReadonlyArray<AiMessage>
  readonly toolCalls: () => AiToolCalls
  readonly activity: () => AiActivity
  readonly plan: () => ReadonlyArray<AiTodo>
  readonly goal: () => AiGoal | undefined
  readonly stats: () => AiStats
  readonly permissions: () => ReadonlyArray<AiPermission>
  readonly questions: () => ReadonlyArray<AiPendingQuestion>
  readonly tasks: () => ReadonlyArray<AiTask>
  readonly error: () => string | undefined
  readonly saved: () => number
  readonly touched: ReadonlyArray<string>
}

const harness = (): Harness => {
  let messages: ReadonlyArray<AiMessage> = []
  let toolCalls: AiToolCalls = {}
  let activity: AiActivity = { step: 0, compacted: false }
  let plan: ReadonlyArray<AiTodo> = []
  let goal: AiGoal | undefined
  let stats: AiStats = { exchanges: 0, toolCalls: 0, thinkingSteps: 0, totalInputTokens: 0, totalOutputTokens: 0, totalLatencyMs: 0 }
  let permissions: ReadonlyArray<AiPermission> = []
  let questions: ReadonlyArray<AiPendingQuestion> = []
  let tasks: ReadonlyArray<AiTask> = []
  let error: string | undefined
  let saved = 0
  const touched: string[] = []
  let activeId: string | undefined

  const ctx: EventContext = {
    app: {} as never,
    activeAssistantId: () => activeId,
    setActiveAssistantId: (id) => { activeId = id },
    sessionId: () => "s1",
    messages: () => messages,
    toolCalls: () => toolCalls,
    activity: () => activity,
    pending: () => [],
    setPending: () => undefined,
    appendMessage: (message) => { messages = [...messages, message] },
    patchMessage: (id, patch) => { messages = messages.map((m) => (m.id === id ? patch(m) : m)) },
    setPermissions: (value) => { permissions = typeof value === "function" ? value(permissions) : value },
    setQuestions: (value) => { questions = typeof value === "function" ? value(questions) : value },
    setPlan: (value) => { plan = typeof value === "function" ? value(plan) : value },
    setGoal: ((value: AiGoal | undefined | ((previous: AiGoal | undefined) => AiGoal | undefined)) => { goal = typeof value === "function" ? value(goal) : value }) as never,
    setActivity: (value) => { activity = typeof value === "function" ? value(activity) : value },
    setToolCalls: (value) => { toolCalls = typeof value === "function" ? value(toolCalls) : value },
    setTasks: (value) => { tasks = typeof value === "function" ? value(tasks) : value },
    setStats: (value) => { stats = typeof value === "function" ? value(stats) : value },
    setError: ((value: string | undefined | ((previous: string | undefined) => string | undefined)) => { error = typeof value === "function" ? value(error) : value }) as never,
    setContextTokens: () => undefined,
    saveTranscript: () => { saved += 1 },
    touchSession: (id) => { touched.push(id) },
    refreshControls: async () => undefined
  }

  return {
    ctx,
    messages: () => messages,
    toolCalls: () => toolCalls,
    activity: () => activity,
    plan: () => plan,
    goal: () => goal,
    stats: () => stats,
    permissions: () => permissions,
    questions: () => questions,
    tasks: () => tasks,
    error: () => error,
    saved: () => saved,
    touched
  }
}

const event = (value: AiEvent): AiEvent => value

/** An editor owner that is never current: the mirrors do nothing. */
const owner = { current: () => false, projectId: () => undefined, drawingId: () => undefined, generation: () => 0 } as never

describe("what a streamed event does to the conversation", () => {
  test("a delta writes into the answer", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "delta", sessionId: "s1", text: "Hello" }), owner)
    applier.apply(event({ type: "delta", sessionId: "s1", text: " world" }), owner)
    expect(h.messages()).toHaveLength(1)
    expect(h.messages()[0]?.text).toBe("Hello world")
    expect(h.messages()[0]?.status).toBe("streaming")
  })

  test("a tool call is registered and counted, and its result marks it done", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "tool_call", sessionId: "s1", callId: "c1", tool: "cad", input: { action: "describe" } }), owner)
    expect(h.toolCalls()["c1"]?.status).toBe("running")
    expect(h.stats().toolCalls).toBe(1)
    applier.apply(event({ type: "tool_result", sessionId: "s1", callId: "c1", tool: "cad", ok: true, output: "{}" }), owner)
    expect(h.toolCalls()["c1"]?.status).toBe("ok")
    expect(h.toolCalls()["c1"]?.output).toBe("{}")
  })

  test("the plan of the agent is what it last said it was", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "todo", sessionId: "s1", todos: [{ content: "rough it", status: "in_progress" }] }), owner)
    expect(h.plan()).toHaveLength(1)
    expect(h.plan()[0]?.content).toBe("rough it")
  })

  test("the end of the turn closes the answer and counts the exchange", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "delta", sessionId: "s1", text: "Done" }), owner)
    applier.apply(event({ type: "done", sessionId: "s1", text: "Done", usage: { inputTokens: 10, outputTokens: 4 } }), owner)
    expect(h.messages()[0]?.status).toBe("done")
    expect(h.messages()[0]?.finishedAt).toBeDefined()
    expect(h.stats().exchanges).toBe(1)
    expect(h.stats().totalOutputTokens).toBe(4)
    expect(h.touched).toEqual(["s1"])
    expect(h.saved()).toBeGreaterThan(0)
  })

  test("a provider failure is said plainly and the answer is marked wrong", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "error", sessionId: "s1", code: "provider", message: "The provider is unreachable." }), owner)
    expect(h.error()).toBe("The provider is unreachable.")
    expect(h.messages()[0]?.status).toBe("error")
  })

  test("a retry is shown where it happened", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "delta", sessionId: "s1", text: "try" }), owner)
    applier.apply(event({ type: "retry", sessionId: "s1", attempt: 2, message: "rate limited" }), owner)
    expect(h.activity().retry?.attempt).toBe(2)
  })

  test("a goal the agent set is remembered", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "goal", sessionId: "s1", goal: { objective: "machine the bracket", status: "active", iteration: 1, tokensUsed: 0 } }), owner)
    expect(h.goal()?.objective).toBe("machine the bracket")
  })

  test("the thinking of a turn is counted once, however many deltas it arrives in", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "reasoning", sessionId: "s1", text: "thinking" }), owner)
    applier.apply(event({ type: "reasoning", sessionId: "s1", text: " more" }), owner)
    expect(h.stats().thinkingSteps).toBe(1)
  })

  test("a new turn starts the counters again", () => {
    const h = harness()
    const applier = createEventApplier(h.ctx)
    applier.apply(event({ type: "reasoning", sessionId: "s1", text: "thinking" }), owner)
    expect(h.stats().thinkingSteps).toBe(1)
    applier.resetTurn()
    applier.apply(event({ type: "reasoning", sessionId: "s1", text: "thinking" }), owner)
    expect(h.stats().thinkingSteps).toBe(2)
  })
})

describe("the commands the host's session answers", () => {
  const controlsHarness = (calls: Array<{ readonly action: string; readonly payload: Record<string, unknown> }>) => {
    let busy = false
    let controlError: string | undefined
    const ctx = {
      app: {
        // The typed client returns an Effect; the runtime runs it. The stub reads
        // the payload the client was given, so the test sees the real request.
        runtime: { run: async (effect: { readonly input?: { readonly payload: Record<string, unknown> } }) => {
          const payload = effect.input?.payload ?? {}
          calls.push({ action: String(payload["action"]), payload })
          return { busy: false, text: "", tasks: [], questions: [], context: { auto: true, prune: false, compacted: false } }
        } },
        client: { ai: { sessionControl: (input: { readonly payload: Record<string, unknown> }) => ({ input }) } }
      },
      sessionId: () => "s1",
      projectId: () => "p1",
      model: () => undefined,
      status: () => "idle" as const,
      conversationGeneration: () => 0,
      controlBusy: () => busy,
      controlError: () => controlError,
      setControlBusy: (value: boolean | ((previous: boolean) => boolean)) => { busy = typeof value === "function" ? value(busy) : value },
      setControlError: (value: string | undefined | ((previous: string | undefined) => string | undefined)) => { controlError = typeof value === "function" ? value(controlError) : value },
      setPermissions: () => undefined,
      setQuestions: () => undefined,
      setTasks: () => undefined,
      setPluginModes: () => undefined,
      setGoal: () => undefined,
      setHostContext: () => undefined,
      setContextTokens: () => undefined,
      setActivity: () => undefined,
      watchTasks: () => undefined
    }
    return { ctx, busy: () => busy, error: () => controlError }
  }

  test("a read never blocks a command and never raises the banner", async () => {
    const calls: Array<{ readonly action: string; readonly payload: Record<string, unknown> }> = []
    const h = controlsHarness(calls)
    const controls = createControls(h.ctx as never)
    await controls.refreshControls()
    expect(calls[0]?.action).toBe("status")
    expect(h.busy()).toBe(false)
    expect(h.error()).toBeUndefined()
  })

  test("a write is exclusive and says what went wrong", async () => {
    const calls: Array<{ readonly action: string; readonly payload: Record<string, unknown> }> = []
    const h = controlsHarness(calls)
    const controls = createControls(h.ctx as never)
    await controls.compact()
    expect(calls[0]?.action).toBe("compact")
    expect(h.busy()).toBe(false)
    expect(h.error()).toBeUndefined()
  })

  test("the command that answers a question carries the answers", async () => {
    const calls: Array<{ readonly action: string; readonly payload: Record<string, unknown> }> = []
    const h = controlsHarness(calls)
    const controls = createControls(h.ctx as never)
    await controls.replyQuestion("q1", [["yes"]])
    expect(calls[0]?.action).toBe("answer_question")
    expect(calls[0]?.payload["answers"]).toEqual([["yes"]])
  })

  test("a question that is dismissed is refused, not answered", async () => {
    const calls: Array<{ readonly action: string; readonly payload: Record<string, unknown> }> = []
    const h = controlsHarness(calls)
    const controls = createControls(h.ctx as never)
    await controls.replyQuestion("q1")
    expect(calls[0]?.action).toBe("reject_question")
  })
})

describe("the conversations of the assistant", () => {
  const sessionsHarness = () => {
    let all: ReadonlyArray<{ readonly id: string; readonly title: string; readonly startedAt: string; readonly updatedAt: string; readonly exchanges: number; readonly projectId?: string }> = []
    let messages: ReadonlyArray<AiMessage> = []
    const ctx = {
      app: { runtime: { run: async () => { throw new Error("offline") } }, client: { ai: { removeSession: () => ({}) } } },
      sessionId: () => "s1",
      projectId: () => "p1",
      status: () => "idle" as const,
      conversationGeneration: () => 0,
      messages: () => messages,
      setMessages: (value: ReadonlyArray<AiMessage> | ((previous: ReadonlyArray<AiMessage>) => ReadonlyArray<AiMessage>)) => { messages = typeof value === "function" ? value(messages) : value },
      setToolCalls: () => undefined,
      setPlan: () => undefined,
      allSessions: () => all,
      setAllSessions: (next: ReadonlyArray<never>) => { all = next as never },
      isDisposed: () => false
    }
    return { ctx, all: () => all, messages: () => messages }
  }

  test("a conversation of the project is the one on screen", () => {
    const h = sessionsHarness()
    const sessions = createSessions(h.ctx as never)
    sessions.upsertSession("s1", "Bracket", "2026-01-01T00:00:00.000Z", "p1")
    sessions.upsertSession("s2", "Other project", "2026-01-01T00:00:00.000Z", "p2")
    expect(sessions.sessions().map((s) => s.id)).toEqual(["s1"])
  })

  test("a conversation that is renamed keeps its name", () => {
    const h = sessionsHarness()
    const sessions = createSessions(h.ctx as never)
    sessions.upsertSession("s1", "Bracket", "2026-01-01T00:00:00.000Z", "p1")
    sessions.renameSession("s1", "  Machine   the bracket  ")
    expect(sessions.sessions()[0]?.title).toBe("Machine the bracket")
  })

  test("a name that is empty leaves the conversation as it was", () => {
    const h = sessionsHarness()
    const sessions = createSessions(h.ctx as never)
    sessions.upsertSession("s1", "Bracket", "2026-01-01T00:00:00.000Z", "p1")
    sessions.renameSession("s1", "   ")
    expect(sessions.sessions()[0]?.title).toBe("Bracket")
  })

  test("the newest conversation comes first", () => {
    const h = sessionsHarness()
    const sessions = createSessions(h.ctx as never)
    sessions.upsertSession("s1", "First", "2026-01-01T00:00:00.000Z", "p1")
    sessions.upsertSession("s2", "Second", "2026-01-02T00:00:00.000Z", "p1")
    expect(sessions.sessions().map((s) => s.id)).toEqual(["s2", "s1"])
  })
})
