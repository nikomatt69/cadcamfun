/// <reference path="./sdk-next.d.ts" />
import { Effect } from "effect"
import {
  BackgroundTaskManager,
  type BackgroundTask,
  type BackgroundTaskRunnerInput
} from "./background-tasks.ts"
import { adoptChildSession, subagentById, SUBAGENTS } from "./agents.ts"
import { isTransientFailure } from "./chat.ts"
import type { NikCliRuntime } from "./runtime.ts"

export const CADCAM_WORKER_AGENT = SUBAGENTS.researcher.host
export const BACKGROUND_FINDINGS_PREFIX = "[CADCAM_AGENT background findings] "
/** A specialist whose provider call failed for a reason that passes is asked again this many times. */
const WORKER_RESUMES = 2
const WORKER_BACKOFF_MS = 3_000

const extractWorkerText = (
  parts: ReadonlyArray<{ type: string; text?: string }> | undefined
): string => {
  if (!parts || parts.length === 0) return ""
  let text = ""
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) text = part.text
  }
  return text
}

const describePromptFailure = (result: { name?: string; data?: { message?: string } } | undefined): string => {
  if (!result) return ""
  if (result.data?.message) return result.data.message
  if (result.name) return result.name
  return "Worker prompt rejected by the host"
}

const runPromise = <A, E>(eff: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(eff as never)

/**
 * One (projectId, parentSessionId) runner. Creates a child session via the
 * real pinned SDK, prompts it with the `cadcam-worker` agent (defined in
 * `config.ts`), and waits for the host's `prompt` stream to settle. The host
 * already enforces the read-only permission whitelist on the worker agent; this
 * class only handles the child-session lifecycle and the abort contract.
 *
 * The `parentID` argument is part of the pinned bundle's session.create schema
 * (we pass it when the host's generation allows it; otherwise the child still
 * works but is unlinked from the parent session lineage).
 */
class WorkerRunner {
  private current?: Promise<string>
  private aborted = false

  constructor(
    private readonly runtime: NikCliRuntime,
    private readonly projectId: string,
    private readonly parentSessionId: string
  ) {}

  /** The model the parent conversation is using, so a specialist works with a model that is known to be connected. */
  private async parentModel(host: Awaited<ReturnType<typeof this.hostOf>>): Promise<{ providerID: string; modelID: string } | undefined> {
    try {
      const messages = await host.client.session.messages({ sessionID: this.parentSessionId, limit: 20 })
      for (const message of [...messages].reverse()) {
        const model = message.info.role === "user" ? message.info.model : undefined
        if (model?.providerID && model.modelID) return { providerID: model.providerID, modelID: model.modelID }
      }
    } catch {
      // No record of the parent: the host picks its default model.
    }
    return undefined
  }

  private hostOf() {
    return runPromise(this.runtime.host(this.projectId))
  }

  async run(input: BackgroundTaskRunnerInput): Promise<string> {
    if (this.aborted) throw new Error("worker aborted")
    const spec = subagentById(input.agent)
    const work: Promise<string> = (async (): Promise<string> => {
      const host = await this.hostOf()
      const model = await this.parentModel(host)
      const session = await host.client.session
        .create({ title: input.description, parentID: this.parentSessionId })
        .catch(async () => host.client.session.create({ title: input.description }))
      // The parent's stream carries this session's tool calls, so what the specialist edits shows up in the editor live.
      const release = adoptChildSession(this.parentSessionId, session.id, spec.id)
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(new Error(`${spec.id} timeout`)), spec.timeoutMs)
        const onAbort = () => controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        if (input.signal.aborted) controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        input.signal.addEventListener("abort", onAbort, { once: true })
        try {
          let text = input.prompt
          for (let attempt = 0; ; attempt += 1) {
            try {
              const result = await host.client["session-prompt"].prompt(
                {
                  sessionID: session.id,
                  agent: spec.host,
                  delivery: "queue",
                  ...(model ? { model } : {}),
                  parts: [{ type: "text", text }]
                },
                { signal: controller.signal }
              )
              if (result.info?.error?.name !== undefined) throw new Error(result.info.error.data?.message ?? result.info.error.name)
              if (result.name !== undefined) throw new Error(describePromptFailure(result))
              return extractWorkerText(result.parts)
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : String(cause)
              if (attempt >= WORKER_RESUMES || controller.signal.aborted || !isTransientFailure(message)) throw cause
              // The conversation of the child is intact: ask it to carry on after a pause.
              await new Promise((r) => setTimeout(r, WORKER_BACKOFF_MS * 2 ** attempt))
              text = "The connection to the model failed and has been restored. Continue from where you stopped: do not repeat steps that already completed (read the conversation and the tool results), and finish the job."
            }
          }
        } finally {
          clearTimeout(timer)
          input.signal.removeEventListener("abort", onAbort)
        }
      } finally {
        release()
        await host.client.session.remove({ sessionID: session.id }).catch(() => undefined)
      }
    })() as Promise<string>
    this.current = work
    try {
      return await work
    } finally {
      if (this.current === work) this.current = undefined
    }
  }

  async abort(): Promise<void> {
    this.aborted = true
    await this.current?.catch(() => undefined)
  }
}

/**
 * Wraps a shared `BackgroundTaskManager` with the worker runner and the parent
 * wake path. `runtime` and `projectId` are fixed per tool registration: one
 * instance is created by the sidecar's per-project `toolsFor`, and the manager
 * singleton ensures the 4 / 16 limit is respected across the whole app.
 */
export class BackgroundToolsRunner {
  private readonly runners = new Map<string, WorkerRunner>()

  readonly manager: BackgroundTaskManager

  constructor(
    private readonly runtime: NikCliRuntime,
    private readonly projectId: string,
    options?: { manager?: BackgroundTaskManager; runner?: (input: BackgroundTaskRunnerInput) => Promise<string> }
  ) {
    const runner = options?.runner ?? ((input) => this.invoke(input))
    const manager =
      options?.manager ??
      new BackgroundTaskManager({
        runner
      })
    this.manager = manager
    // Always layer the wake callback on the manager we end up with — whether
    // the caller supplied it or we just built it — so completion deliveries
    // happen regardless of who owns the manager.
    this.manager.setOnCompletion((task) => {
      void this.deliver(task).catch(() => undefined)
    })
    // If the manager we were given has no runner yet (lazy wiring), install ours.
    this.manager.setRunner(runner)
  }

  async cancelForParent(parentSessionId: string): Promise<number> {
    const cancelled = this.manager.cancelParent({ projectId: this.projectId, parentSessionId })
    for (const [key, runner] of this.runners) if (key.endsWith(`\u0000${parentSessionId}`)) await runner.abort()
    return cancelled
  }

  async dispose(): Promise<void> {
    await this.manager.dispose()
    await Promise.all([...this.runners.values()].map((runner) => runner.abort()))
    this.runners.clear()
  }

  private async invoke(input: BackgroundTaskRunnerInput): Promise<string> {
    // The specialist works in the host of the project that asked for it: its tools act on that project's drawing.
    const key = `${input.projectId}\u0000${input.parentSessionId}`
    let runner = this.runners.get(key)
    if (runner === undefined) {
      runner = new WorkerRunner(this.runtime, input.projectId, input.parentSessionId)
      this.runners.set(key, runner)
    }
    return await runner.run(input)
  }

  /**
   * Wakes the parent with a synthetic queued text part. The host's `prompt_async`
   * endpoint returns 204 and admits the message to the native pending queue; if
   * the parent session is busy, the message waits for the parent's agent loop
   * to be idle. Cancelled tasks do not wake the parent.
   */
  private async deliver(task: BackgroundTask): Promise<void> {
    if (task.status === "cancelled" || task.status === "running" || task.status === "queued") return
    // A caller that waited for the result already has it.
    if (task.background === false) return
    const host = await runPromise(this.runtime.host(task.projectId))
    const body =
      task.status === "completed"
        ? `${BACKGROUND_FINDINGS_PREFIX}agent=${task.agent ?? "researcher"}; task=${task.description}\n${task.text ?? ""}`
        : `${BACKGROUND_FINDINGS_PREFIX}agent=${task.agent ?? "researcher"}; status=${task.status}${task.error ? `; error=${task.error}` : ""}`
    try {
      await host.client["session-prompt"].promptAsync({
        sessionID: task.parentSessionId,
        agent: "cadcam",
        delivery: "queue",
        parts: [{ type: "text", text: body, synthetic: true }]
      })
    } catch {
      // Parent session removed (404) or busy after dispose; the worker already settled.
    }
  }
}