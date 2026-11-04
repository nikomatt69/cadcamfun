import type { AssistantPreferences } from "./assistant-preferences"
import { CompanionError, type CompanionClient } from "./client"

export type AssistantMode = "general" | "cad" | "cam" | "gcode" | "toolpath"
export interface OfflineAssistantOp {
  readonly type: "assistant-message"
  readonly id?: string
  readonly desktopFingerprint?: string
  readonly projectId: string
  readonly drawingId?: string
  readonly text: string
  readonly sessionId?: string
  /** Groups messages composed in the same new offline conversation until the host names its session. */
  readonly localConversationId?: string
  readonly agent?: string
  readonly mode?: AssistantMode
  readonly model?: AssistantPreferences["model"]
  readonly permissionMode?: AssistantPreferences["permissionMode"]
  readonly includeContext?: boolean
  readonly queuedAt: number
  /** Checkpointed before transport starts: an ambiguous delivery is only ever recovered. */
  readonly submitted?: boolean
}

/** `sessions/prompt` refused a prompt because the session already runs a turn: a certain "not sent". */
export const isBusyRefusal = (error: unknown): boolean => error instanceof CompanionError && error.status === 409

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
    /** Persist the host session on all still-queued messages from this local conversation. */
    bindConversation(op: OfflineAssistantOp, sessionId: string): Promise<void>
    session(projectId: string): string | undefined
    remember(projectId: string, sessionId: string): void
    isCurrentLocalConversation(projectId: string, localConversationId: string): boolean
    /** True when the request certainly never reached the desktop (no route, radio off). */
    unsent?(error: unknown): boolean
  },
): Promise<number> {
  let sent = 0
  const resolved = new Map<string, string>()
  for (const op of queue) {
    if (!deps.active()) break
    if (op.desktopFingerprint && op.desktopFingerprint !== deps.fingerprint) continue
    const localKey = op.localConversationId ? JSON.stringify([op.desktopFingerprint ?? "", op.projectId, op.localConversationId]) : undefined
    if (op.submitted) {
      // Uncertain delivery: the session read shows whether it ran; resending could repeat a CAD/CAM change.
      // A host session checkpoint written after acceptance can still bind its siblings on recovery.
      if (localKey && op.sessionId) {
        await deps.bindConversation(op, op.sessionId)
        resolved.set(localKey, op.sessionId)
      }
      await deps.save(op, null)
      continue
    }
    // Never infer a queued message's conversation from the current selection:
    // it may have changed while the desktop was offline.
    const sessionId = op.sessionId ?? (localKey ? resolved.get(localKey) : undefined)
    const receipt: OfflineAssistantOp = { ...op, submitted: true, ...(sessionId ? { sessionId } : {}) }
    await deps.save(op, receipt)
    try {
      const started = await deps.client.promptSession({ projectId: op.projectId, message: op.text, ...(op.drawingId ? { drawingId: op.drawingId } : {}), ...(sessionId ? { sessionId } : {}), agent: op.agent, mode: op.mode ?? "general", model: op.model, permissionMode: op.permissionMode, includeContext: op.includeContext })
      let accepted = receipt
      if (localKey) {
        accepted = { ...receipt, sessionId: started.sessionId }
        await deps.save(receipt, accepted)
        await deps.bindConversation(op, started.sessionId)
        resolved.set(localKey, started.sessionId)
      }
      // Follow only if the person is still viewing this conversation.
      if (op.localConversationId
        ? !deps.session(op.projectId) && deps.isCurrentLocalConversation(op.projectId, op.localConversationId)
        : !!op.sessionId && deps.session(op.projectId) === op.sessionId) {
        deps.remember(op.projectId, started.sessionId)
      }
      await deps.save(accepted, null)
      sent += 1
    } catch (error) {
      // 409: the session is running a turn and the desktop refused this one before it started. Nothing ran, so the
      // message stays queued for the next drain, after that turn ends.
      if (deps.unsent?.(error) || isBusyRefusal(error)) await deps.save(receipt, { ...op })
      // Later messages must not overtake one whose delivery is still unknown.
      break
    }
  }
  return sent
}
