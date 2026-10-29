import { AppState } from "react-native"
import { CompanionClient } from "./client"
import { pinnedTransport } from "./native"
import { pairingScope, validatePairing, type Pairing } from "./pairing"
import { accountStore } from "./account"
import { mutateStored, readOfflineQueueRaw, writeOfflineQueueRaw } from "./storage"
import { isOfflineSendError } from "./offline-errors"
import { useUIStore } from "./store"
import { deliverOutbox, newMobileSessionId, outboxKey, type OfflineAssistantOp } from "./assistant-outbox"
export type { AssistantMode, OfflineAssistantOp } from "./assistant-outbox"

export { isOfflineSendError }

/**
 * Offline assistant queue (nikcli: lib/offline.ts, CADCAMFUN domain).
 *
 * When the desktop is unreachable the assistant composer queues the steer/prompt
 * in SecureStore instead of dropping it. The queue drains on foreground and when
 * connectivity returns to online; each op opens a fresh turn (server owns session
 * continuity via sessionId). A process kill never loses the queue.
 */

const MAX_ENTRIES = 50

const isOp = (value: unknown): value is OfflineAssistantOp => {
  if (!value || typeof value !== "object") return false
  const op = value as Record<string, unknown>
  return op.type === "assistant-message" && typeof op.projectId === "string" && typeof op.text === "string"
}

async function readQueue(): Promise<OfflineAssistantOp[]> {
  const raw = await readOfflineQueueRaw()
  return raw.filter(isOp)
}

function syncQueueCount(queue: readonly OfflineAssistantOp[]): void {
  useUIStore.getState().setOfflineQueue(queue.length)
}

export async function refreshOfflineQueueCount(): Promise<number> {
  const queue = await readQueue()
  syncQueueCount(queue)
  return queue.length
}

export async function countOfflineQueueForProject(projectId: string): Promise<number> {
  const queue = await readQueue()
  return queue.filter((op) => op.projectId === projectId).length
}

/** Texts still waiting for one project, oldest first: the assistant marks exactly those rows as waiting. */
export async function queuedTextsForProject(projectId: string): Promise<string[]> {
  const queue = await readQueue()
  return queue.filter((op) => op.projectId === projectId).map((op) => op.text)
}

export async function enqueueAssistantOp(op: Omit<OfflineAssistantOp, "type" | "queuedAt">): Promise<void> {
  const entry: OfflineAssistantOp = { ...op, id: newMobileSessionId(), desktopFingerprint: useUIStore.getState().assistantDesktopId ?? undefined, type: "assistant-message", queuedAt: Date.now() }
  const next = await mutateStored(readQueue, writeOfflineQueueRaw, (queue) => {
    const grown = [...queue, entry]
    return grown.length > MAX_ENTRIES ? grown.slice(grown.length - MAX_ENTRIES) : grown
  })
  syncQueueCount(next)
}

/**
 * Discards every queued message (Settings). A message the outbox is delivering right now is not recalled: its
 * checkpoint is dropped with the rest, and the conversation on the desktop shows whether it ran.
 */
export async function clearOfflineQueue(): Promise<number> {
  let removed = 0
  const next = await mutateStored(readQueue, writeOfflineQueueRaw, (queue) => { removed = queue.length; return [] })
  syncQueueCount(next)
  return removed
}

/** Drain with a pairing supplied by the caller (provider owns the live client). */
let draining: Promise<void> | undefined
export function drainQueueWith(pairing: Pairing, onSent?: (sent: number) => void): Promise<void> {
  if (draining) return draining
  draining = drainQueue(pairing, onSent).finally(() => { draining = undefined })
  return draining
}

async function drainQueue(pairing: Pairing, onSent?: (sent: number) => void): Promise<void> {
  const validated = validatePairing(pairing)
  const queue = await readQueue()
  if (queue.length === 0) {
    syncQueueCount(queue)
    return
  }
  const client = new CompanionClient(pinnedTransport(validated))
  const sent = await deliverOutbox(queue, {
    client, fingerprint: pairingScope(validated, accountStore.account()?.subject),
    active: () => AppState.currentState === "active",
    session: (projectId) => useUIStore.getState().assistantSessions[projectId],
    remember: (projectId, sessionId) => useUIStore.getState().setAssistantSession(projectId, sessionId),
    unsent: isOfflineSendError,
    save: async (previous, next) => {
      await mutateStored(readQueue, writeOfflineQueueRaw, (current) => current.flatMap((entry) => outboxKey(entry) === outboxKey(previous) ? next ? [next] : [] : [entry]))
    },
  })
  const remaining = await readQueue()
  syncQueueCount(remaining)
  if (sent > 0) onSent?.(sent)
}

export function setupOfflineDrainOnForeground(getPairing: () => Pairing | null): () => void {
  void refreshOfflineQueueCount()
  let draining = false
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active" || draining) return
    const pairing = getPairing()
    if (!pairing) return
    draining = true
    drainQueueWith(pairing, (sent) => {
      useUIStore.getState().showToast(sent === 1 ? "Queued message sent" : `${sent} queued messages sent`, "success")
    })
      .catch(() => undefined)
      .finally(() => {
        draining = false
      })
  })
  return () => subscription.remove()
}
