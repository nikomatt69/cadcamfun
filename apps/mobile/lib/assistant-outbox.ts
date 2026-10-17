import type { AssistantPreferences } from "./assistant-preferences"
import type { CompanionClient } from "./client"

export type AssistantMode = "general" | "cad" | "cam" | "gcode" | "toolpath"
export interface OfflineAssistantOp {
  readonly type: "assistant-message"
  readonly id?: string
  readonly desktopFingerprint?: string
  readonly projectId: string
  readonly text: string
  readonly sessionId?: string
  readonly agent?: string
  readonly mode?: AssistantMode
  readonly model?: AssistantPreferences["model"]
  readonly permissionMode?: AssistantPreferences["permissionMode"]
  readonly includeContext?: boolean
  readonly queuedAt: number
  /** Checkpointed before transport starts: an ambiguous delivery is only ever recovered. */
  readonly submitted?: boolean
}

export const outboxKey = (op: OfflineAssistantOp): string => op.id ?? JSON.stringify([op.queuedAt, op.projectId, op.text])
export const newMobileSessionId = (): string => `s-mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Serial delivery preserves conversation order; checkpoints survive suspension or process death. */
export async function deliverOutbox(
  queue: readonly OfflineAssistantOp[],
  deps: {
    client: Pick<CompanionClient, "chat" | "resumeChat">
    fingerprint: string
    active(): boolean
    save(previous: OfflineAssistantOp, next: OfflineAssistantOp | null): Promise<void>
    session(projectId: string): string | undefined
    remember(projectId: string, sessionId: string): void
  },
): Promise<number> {
  let sent = 0
  for (const op of queue) {
    if (!deps.active()) break
    if (op.desktopFingerprint && op.desktopFingerprint !== deps.fingerprint) continue
    const sessionId = (op.submitted ? op.sessionId : deps.session(op.projectId) ?? op.sessionId) ?? newMobileSessionId()
    let receipt: OfflineAssistantOp = { ...op, submitted: true, sessionId }
    await deps.save(op, receipt)
    try {
      const events = op.submitted
        ? deps.client.resumeChat(sessionId)
        : deps.client.chat({ projectId: op.projectId, message: op.text, sessionId: receipt.sessionId, agent: op.agent, mode: op.mode ?? "general", model: op.model, permissionMode: op.permissionMode, includeContext: op.includeContext })
      let completed = false
      for await (const event of events) {
        if (typeof event.sessionId === "string" && event.sessionId) {
          deps.remember(op.projectId, event.sessionId)
          if (receipt.sessionId !== event.sessionId) {
            const next = { ...receipt, sessionId: event.sessionId }
            await deps.save(receipt, next)
            receipt = next
          }
        }
        if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "Assistant failed")
        if (event.type === "done") { completed = true; break }
      }
      if (!completed) break
      await deps.save(receipt, null)
      sent += 1
    } catch {
      // Later messages must not overtake a turn whose result is still unknown.
      break
    }
  }
  return sent
}
