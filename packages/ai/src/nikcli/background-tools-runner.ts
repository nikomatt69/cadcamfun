/// <reference path="./sdk-next.d.ts" />
import { Effect } from "effect"
import {
  BackgroundTaskManager,
  type BackgroundTask,
  type BackgroundTaskRunnerInput
} from "./background-tasks.ts"
import type { NikCliRuntime } from "./runtime.ts"

export const CADCAM_WORKER_AGENT = "cadcam-worker"
export const BACKGROUND_FINDINGS_PREFIX = "[CADCAM_AGENT background findings] "
const WORKER_TIMEOUT_MS = 5 * 60 * 1000

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

  async run(input: BackgroundTaskRunnerInput): Promise<string> {
    if (this.aborted) throw new Error("worker aborted")
    const work: Promise<string> = (async (): Promise<string> => {
      const host = await runPromise(this.runtime.host(this.projectId))
      const session = await host.client.session
        .create({ title: input.description, parentID: this.parentSessionId })
        .catch(async () => host.client.session.create({ title: input.description }))
      try {
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(new Error("worker timeout")),
          WORKER_TIMEOUT_MS
        )
        const onAbort = () => controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        if (input.signal.aborted) controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        input.signal.addEventListener("abort", onAbort, { once: true })
        try {
          const result = await host.client["session-prompt"].prompt(
            {
              sessionID: session.id,
              agent: CADCAM_WORKER_AGENT,
              delivery: "queue",
              parts: [{ type: "text", text: input.prompt }]
            },
            { signal: controller.signal }
          )
          if (result.info?.error?.name !== undefined) {
            throw new Error(result.info.error.data?.message ?? result.info.error.name)
          }
          if (result.name !== undefined) {
            throw new Error(describePromptFailure(result))
          }
          return extractWorkerText(result.parts)
        } finally {
          clearTimeout(timer)
          input.signal.removeEventListener("abort", onAbort)
        }
      } finally {
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
        runner,
        onCompletion: (task) => {
          void this.deliver(task).catch(() => undefined)
        }
      })
    this.manager = manager
  }

  async cancelForParent(parentSessionId: string): Promise<void> {
    this.manager.cancelParent({ projectId: this.projectId, parentSessionId })
    const runner = this.runners.get(parentSessionId)
    await runner?.abort()
  }

  async dispose(): Promise<void> {
    await this.manager.dispose()
    await Promise.all([...this.runners.values()].map((runner) => runner.abort()))
    this.runners.clear()
  }

  private async invoke(input: BackgroundTaskRunnerInput): Promise<string> {
    const key = input.parentSessionId
    let runner = this.runners.get(key)
    if (runner === undefined) {
      runner = new WorkerRunner(this.runtime, this.projectId, input.parentSessionId)
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
    const host = await runPromise(this.runtime.host(task.projectId))
    const body =
      task.status === "completed"
        ? `${BACKGROUND_FINDINGS_PREFIX}${task.text ?? ""}`
        : `${BACKGROUND_FINDINGS_PREFIX}status=${task.status}${task.error ? `; error=${task.error}` : ""}`
    try {
      await host.client["session-prompt"].promptAsync({
        sessionID: task.parentSessionId,
        agent: "cadcam",
        delivery: "queue",
        parts: [{ type: "text", text: body }]
      })
    } catch {
      // Parent session removed (404) or busy after dispose; the worker already settled.
    }
  }
}