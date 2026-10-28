/// <reference path="./sdk-next.d.ts" />
import { hostAgentWithPermissions, inheritedPermissionMode } from "./permission-modes.ts"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import {
  BackgroundTaskManager,
  type BackgroundTask,
  type BackgroundTaskOwner,
  type BackgroundTaskRunnerInput
} from "./background-tasks.ts"
import { adoptChildSession, subagentById, SUBAGENTS } from "./agents.ts"
import { isTransientFailure } from "./chat.ts"
import { CADCAM_AGENT } from "./config.ts"
import { currentHostAgent } from "./primaries.ts"
import type { NikCliRuntime } from "./runtime.ts"

export const CADCAM_WORKER_AGENT = SUBAGENTS.researcher.host
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

/** One task invocation owns one real child session, parent lineage and cancellation lifecycle. */
class WorkerRunner {
  constructor(
    private readonly runtime: NikCliRuntime,
    private readonly projectId: string,
    private readonly parentSessionId: string
  ) {}

  /** The model the parent conversation is using, so a specialist works with a model that is known to be connected. */
  private async parentModel(host: Awaited<ReturnType<typeof this.hostOf>>): Promise<{ model: { providerID: string; modelID: string }; system?: string; variant?: string; agent?: string } | undefined> {
    try {
      const messages = await host.client.session.messages({ sessionID: this.parentSessionId, limit: 20 })
      for (const message of [...messages].reverse()) {
        const model = message.info.role === "user" ? message.info.model : undefined
        if (model?.providerID && model.modelID) return { agent: message.info.agent, model: { providerID: model.providerID, modelID: model.modelID }, ...(message.info.system ? { system: message.info.system } : {}), ...(message.info.variant ? { variant: message.info.variant } : {}) }
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
    input.signal.throwIfAborted()
    const spec = subagentById(input.agent)
    const work: Promise<string> = (async (): Promise<string> => {
      const host = await this.hostOf()
      input.signal.throwIfAborted()
      const model = await this.parentModel(host)
      input.signal.throwIfAborted()
      const session = await host.client.session
        .create({ title: input.description, parentID: this.parentSessionId })

      // The parent's stream carries this session's tool calls, so what the specialist edits shows up in the editor live.
      const release = adoptChildSession(this.parentSessionId, session.id, spec.id)
      let report: string | undefined
      try {
        await input.childSession?.(session.id)
        await input.checkLease?.()
        if (input.target !== undefined) await this.runtime.bindBackgroundTask?.({ projectId: this.projectId, parentSessionId: this.parentSessionId }, input.target, session.id, input.checkLease)
        const controller = new AbortController()
        let aborting: Promise<unknown> | undefined
        const abortChild = () => { aborting ??= host.client.session.abort({ sessionID: session.id }).catch(() => undefined) }
        controller.signal.addEventListener("abort", abortChild, { once: true })
        const timer = setTimeout(() => controller.abort(new Error(`${spec.id} timeout`)), spec.timeoutMs)
        const onAbort = () => controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        if (input.signal.aborted) controller.abort(input.signal.reason ?? new Error("parent cancelled"))
        input.signal.addEventListener("abort", onAbort, { once: true })
        try {
          let text = input.prompt
          for (let attempt = 0; ; attempt += 1) {
            try {
              controller.signal.throwIfAborted()
              const result = await host.client["session-prompt"].prompt(
                {
                  sessionID: session.id,
                  ...(model ?? {}),
                  agent: hostAgentWithPermissions(spec.host, inheritedPermissionMode(model?.agent)),
                  delivery: "queue",
                  parts: [{ type: "text", text }]
                },
                { signal: controller.signal }
              )
              if (result.info?.error?.name !== undefined) throw new Error(result.info.error.data?.message ?? result.info.error.name)
              if (result.name !== undefined) throw new Error(describePromptFailure(result))
              report = extractWorkerText(result.parts)
              return report
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : String(cause)
              if (attempt >= WORKER_RESUMES || controller.signal.aborted || !isTransientFailure(message)) throw cause
              // The conversation of the child is intact: ask it to carry on after a pause.
              await new Promise<void>((resolve, reject) => {
                const abort = () => { clearTimeout(timer); reject(controller.signal.reason) }
                const timer = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve() }, WORKER_BACKOFF_MS * 2 ** attempt)
                controller.signal.addEventListener("abort", abort, { once: true })
                if (controller.signal.aborted) abort()
              })
              text = "The connection to the model failed and has been restored. Continue from where you stopped: do not repeat steps that already completed (read the conversation and the tool results), and finish the job."
            }
          }
        } finally {
          clearTimeout(timer)
          input.signal.removeEventListener("abort", onAbort)
          controller.signal.removeEventListener("abort", abortChild)
          await aborting
        }
      } finally {
        release()
        // Failed storage retains the native evidence. Removing it here would make an acknowledged result unrecoverable.
        if (report !== undefined) {
          await input.report?.(report)
          await host.client.session.remove({ sessionID: session.id }).catch(() => undefined)
        } else if (input.childSession === undefined) {
          await host.client.session.remove({ sessionID: session.id }).catch(() => undefined)
        }
      }
    })() as Promise<string>
    return await work
  }
}

/**
 * Wraps a shared `BackgroundTaskManager` with the worker runner and the parent
 * wake path. `runtime` and `projectId` are fixed per tool registration: one
 * instance is created by the sidecar's per-project `toolsFor`, and the manager
 * singleton ensures the 4 / 16 limit is respected across the whole app.
 */
export class BackgroundToolsRunner {
  private readonly retired = new Set<string>()
  private disposed = false

  readonly manager: BackgroundTaskManager

  constructor(
    private readonly runtime: NikCliRuntime,
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
    this.manager.setOnCompletion((task) => this.deliver(task))
    this.manager.setRecoveryReader((task) => this.recoverReport(task))
    // If the manager we were given has no runner yet (lazy wiring), install ours.
    this.manager.setRunner(runner)
  }

  async cancelForParent(owner: BackgroundTaskOwner): Promise<number> {
    this.retired.add(this.ownerKey(owner))
    const cancelled = this.manager.cancelParent(owner)
    await Promise.all(this.manager.list(owner).map((task) => this.manager.wait(owner, task.id)))
    return cancelled
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.manager.dispose()
  }

  private ownerKey(owner: BackgroundTaskOwner): string {
    return JSON.stringify([owner.projectId, owner.parentSessionId])
  }

  private async invoke(input: BackgroundTaskRunnerInput): Promise<string> {
    if (this.disposed || this.retired.has(this.ownerKey(input))) throw new Error("Worker owner is closed")
    return await new WorkerRunner(this.runtime, input.projectId, input.parentSessionId).run(input)
  }

  private async recoverReport(task: BackgroundTask): Promise<string | undefined> {
    if (task.childSessionId === undefined || this.disposed || this.retired.has(this.ownerKey(task))) return undefined
    const host = await runPromise(this.runtime.host(task.projectId))
    let messages
    try { messages = await host.client.session.messages({ sessionID: task.childSessionId, limit: 40 }) }
    catch (cause) {
      // A deleted child has no recoverable report. A transport/storage failure is not evidence that it never finished.
      const status = typeof cause === "object" && cause !== null && "status" in cause ? cause.status : undefined
      if (status === 404) return undefined
      throw cause
    }
    const last = messages.findLast((message) => message.info.role === "assistant" && message.info.summary !== true)
    if (!last || last.info.error || !["stop", "end_turn", "stop_sequence"].includes(last.info.finish ?? "")) return undefined
    if (last.parts.some((part) => part.type === "tool" && (part.state?.status === "pending" || part.state?.status === "running"))) return undefined
    const report = extractWorkerText(last.parts)
    return report === "" ? undefined : report
  }

  /**
   * Wakes the parent with a synthetic queued text part, in nikcli's own wake format (`tool/task.ts` `wakeParentSession`):
   * what finished, its status and id, the result up to 100 lines, and how to read the rest. The host's `prompt_async`
   * endpoint returns 204 and admits the message to the native pending queue; if the parent session is busy, the message
   * waits for the parent's agent loop to be idle. Cancelled tasks do not wake the parent.
   */
  private async deliver(task: BackgroundTask): Promise<void> {
    if (this.disposed || this.retired.has(this.ownerKey(task))) return
    if (task.status === "cancelled" || task.status === "running" || task.status === "queued") return
    // A caller that waited for the result already has it.
    if (task.background === false) return
    const host = await runPromise(this.runtime.host(task.projectId))
    if (this.disposed || this.retired.has(this.ownerKey(task))) return
    const summary = task.status === "completed" ? task.text ?? "" : task.error ?? ""
    const summaryLines = summary.split("\n")
    const body = [
      `Background task "${task.description}" finished.`,
      `Status: ${task.status}`,
      `Task ID: ${task.id}`,
      "",
      "Result:",
      summaryLines.slice(0, 100).join("\n"),
      summaryLines.length > 100 ? "\n...(truncated)" : "",
      "",
      `Use agent action read (taskId="${task.id}") for the full result.`
    ].join("\n")
    const agent = task.deliveryAgent ?? await this.manager.prepareDelivery(task, task.id,
      currentHostAgent([...await host.client.session.messages({ sessionID: task.parentSessionId, limit: 20 })].reverse().find((message) => message.info.role === "user")?.info.agent) ?? CADCAM_AGENT)
    // The message identity and role survive a crash between native admission and recording delivered=true. A retry
    // admits the same outcome, never a second wake, even if the parent changed roles in the meantime.
    const notification = {
        sessionID: task.parentSessionId,
        messageID: `msg_${createHash("sha256").update(`cadcam-task:${task.id}`).digest("hex").slice(0, 24)}`,
        agent,
        delivery: "queue" as const,
        parts: [{ type: "text" as const, text: body, synthetic: true }]
    }
    const admitted = await host.client["session-prompt"].promptAsync(notification)
    // Generated clients may resolve an error wrapper instead of rejecting. Only actual admission acknowledges delivery.
    if (admitted !== null && typeof admitted === "object") {
      const response = "response" in admitted ? admitted.response : undefined
      const status = typeof response === "object" && response !== null && "status" in response ? response.status
        : "status" in admitted ? admitted.status : undefined
      const failed = "error" in admitted && admitted.error !== undefined && admitted.error !== null
      if (failed || typeof status === "number" && status >= 400 || "name" in admitted && typeof admitted.name === "string") {
        throw new Error(`The parent did not admit the background task outcome${typeof status === "number" ? ` (${status})` : ""}`)
      }
    }
  }
}
