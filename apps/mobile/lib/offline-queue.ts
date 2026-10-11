import { AppState } from "react-native"
import { CompanionClient } from "./client"
import { pinnedTransport } from "./native"
import { validatePairing, type Pairing } from "./pairing"
import { mutateStored, readOfflineQueueRaw, writeOfflineQueueRaw } from "./storage"
import { isOfflineSendError } from "./offline-errors"
import { useUIStore } from "./store"

export { isOfflineSendError }

/**
 * Offline assistant queue (nikcli: lib/offline.ts, CADCAMFUN domain).
 *
 * When the desktop is unreachable the assistant composer queues the steer/prompt
 * in SecureStore instead of dropping it. The queue drains on foreground and when
 * connectivity returns to online; each op opens a fresh turn (server owns session
 * continuity via sessionId). A process kill never loses the queue.
 */

export type AssistantMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

export interface OfflineAssistantOp {
  readonly type: "assistant-message"
  readonly projectId: string
  readonly text: string
  readonly sessionId?: string
  readonly agent?: string
  readonly mode?: AssistantMode
  readonly queuedAt: number
}

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

export async function enqueueAssistantOp(op: Omit<OfflineAssistantOp, "type" | "queuedAt">): Promise<void> {
  const entry: OfflineAssistantOp = { ...op, type: "assistant-message", queuedAt: Date.now() }
  const next = await mutateStored(readQueue, writeOfflineQueueRaw, (queue) => {
    const grown = [...queue, entry]
    return grown.length > MAX_ENTRIES ? grown.slice(grown.length - MAX_ENTRIES) : grown
  })
  syncQueueCount(next)
}

/** Drain with a pairing supplied by the caller (provider owns the live client). */
export async function drainQueueWith(pairing: Pairing, onSent?: (sent: number) => void): Promise<void> {
  const validated = validatePairing(pairing)
  const queue = await readQueue()
  if (queue.length === 0) {
    syncQueueCount(queue)
    return
  }
  const client = new CompanionClient(pinnedTransport(validated))
  const results = await Promise.allSettled(
    queue.map(async (op) => {
      if (AppState.currentState !== "active") throw new Error("App is not active")
      for await (const event of client.chat(
        {
          projectId: op.projectId,
          message: op.text,
          sessionId: op.sessionId,
          agent: op.agent,
          mode: op.mode ?? "general",
        },
      )) {
        if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "Assistant failed")
        if (event.type === "done") break
      }
    }),
  )
  const remaining = queue.filter((_, index) => results[index]?.status === "rejected")
  await writeOfflineQueueRaw(remaining)
  syncQueueCount(remaining)
  const sent = queue.length - remaining.length
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
