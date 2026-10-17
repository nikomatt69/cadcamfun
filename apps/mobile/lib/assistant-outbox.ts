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

/**
 * Serial delivery preserves conversation order; checkpoints survive suspension or process death.
 * nikcli mobile architecture: a queued message is delivered by `sessions/prompt`, which returns as soon as the desktop
 * owns the turn, and the conversation shows it from the session stream. A checkpointed (`submitted`) message whose
 * delivery is uncertain is never posted again: it may already be running on the desktop.
 */
export async function deliverOutbox(
  queue: readonly OfflineAssistantOp[],
  deps: {
    client: Pick<CompanionClient, "promptSession">
    fingerprint: string
    active(): boolean
    save(previous: OfflineAssistantOp, next: OfflineAssistantOp | null): Promise<void>
    session(projectId: string): string | undefined
    remember(projectId: string, sessionId: string): void
    /** True when the request certainly never reached the desktop (no route, radio off). */
    unsent?(error: unknown): boolean
  },
): Promise<number> {
  let sent = 0
  for (const op of queue) {
    if (!deps.active()) break
    if (op.desktopFingerprint && op.desktopFingerprint !== deps.fingerprint) continue
    if (op.submitted) {
      // Uncertain delivery: the session read shows whether it ran; resending could repeat a CAD/CAM change.
      await deps.save(op, null)
      continue
    }
    const sessionId = deps.session(op.projectId) ?? op.sessionId
    const receipt: OfflineAssistantOp = { ...op, submitted: true, ...(sessionId ? { sessionId } : {}) }
    await deps.save(op, receipt)
    try {
      const started = await deps.client.promptSession({ projectId: op.projectId, message: op.text, ...(sessionId ? { sessionId } : {}), agent: op.agent, mode: op.mode ?? "general", model: op.model, permissionMode: op.permissionMode, includeContext: op.includeContext })
      deps.remember(op.projectId, started.sessionId)
      await deps.save(receipt, null)
      sent += 1
    } catch (error) {
      if (deps.unsent?.(error)) await deps.save(receipt, { ...op })
      // Later messages must not overtake one whose delivery is still unknown.
      break
    }
  }
  return sent
}
