/**
 * The synced notification center: one Solid store fed by the DB (`GET /api/notifications`)
 * and kept current by `notification.*` live frames, so desktop, paired phone and DB agree
 * on rows and unread count without polling. Writes go through the API first; the live
 * frame the sidecar publishes for our own write is applied idempotently by id.
 */
import { createSignal, type Accessor } from "solid-js"
import { Effect } from "effect"
import { isNativeNotificationType, type LiveEvent, type NotificationRow } from "@cadcamfun/api"
import type { AppRuntime, Client } from "../../shared/state/client.ts"
import { notifyNative, shouldNotifyNative, wasNotified } from "./native.ts"

export interface NotificationFeedState {
  readonly rows: ReadonlyArray<NotificationRow>
  readonly unreadCount: number
}

const unreadOf = (rows: ReadonlyArray<NotificationRow>): number => rows.filter((row) => !row.isRead).length

/** Applies one live frame to a feed; pure, so sync rules are tested without a runtime. */
export function applyNotificationEvent(state: NotificationFeedState, event: LiveEvent): NotificationFeedState {
  switch (event.type) {
    case "notification.created": {
      if (state.rows.some((row) => row.id === event.notification.id)) return state
      const rows = [event.notification, ...state.rows]
      return { rows, unreadCount: unreadOf(rows) }
    }
    case "notification.updated": {
      if (!state.rows.some((row) => row.id === event.notification.id)) return state
      const rows = state.rows.map((row) => (row.id === event.notification.id ? event.notification : row))
      return { rows, unreadCount: unreadOf(rows) }
    }
    case "notification.deleted": {
      if (!state.rows.some((row) => row.id === event.notificationId)) return state
      const rows = state.rows.filter((row) => row.id !== event.notificationId)
      return { rows, unreadCount: unreadOf(rows) }
    }
    case "notification.readAll": {
      if (state.unreadCount === 0) return state
      return { rows: state.rows.map((row) => (row.isRead ? row : { ...row, isRead: true })), unreadCount: 0 }
    }
    default: return state
  }
}

export interface NotificationCenter {
  readonly rows: Accessor<ReadonlyArray<NotificationRow>>
  readonly unreadCount: Accessor<number>
  readonly loading: Accessor<boolean>
  refresh(): Promise<void>
  markRead(row: NotificationRow, isRead?: boolean): Promise<void>
  markAllRead(): Promise<void>
  remove(row: NotificationRow): Promise<void>
  handleLiveEvent(event: LiveEvent): void
}

export function createNotificationCenter(options: {
  readonly client: Client
  readonly runtime: AppRuntime
  readonly nativeEnabled: Accessor<boolean>
}): NotificationCenter {
  const [feed, setFeed] = createSignal<NotificationFeedState>({ rows: [], unreadCount: 0 })
  const [loading, setLoading] = createSignal(false)
  let started = false

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const page = await options.runtime.run(options.client.notifications.list({ query: { limit: "50" } }))
      setFeed({ rows: page.notifications, unreadCount: page.unreadCount })
      // Rows that already exist on first load are history, not news: never pop them up.
      started = true
    } catch { /* the live stream and the next refresh repair a missed load */ } finally { setLoading(false) }
  }

  return {
    rows: () => feed().rows,
    unreadCount: () => feed().unreadCount,
    loading,
    refresh,
    markRead: async (row, isRead = true) => {
      const updated = await options.runtime.run(options.client.notifications.update({ params: { id: row.id }, payload: { isRead } }))
      setFeed((state) => applyNotificationEvent(state, { type: "notification.updated", notification: updated, at: updated.createdAt }))
    },
    markAllRead: async () => {
      await options.runtime.run(options.client.notifications.markAllRead())
      setFeed((state) => applyNotificationEvent(state, { type: "notification.readAll", userId: "", count: state.unreadCount, at: new Date().toISOString() }))
    },
    remove: async (row) => {
      await options.runtime.run(options.client.notifications.remove({ params: { id: row.id } }))
      setFeed((state) => applyNotificationEvent(state, { type: "notification.deleted", notificationId: row.id, userId: row.userId, at: new Date().toISOString() }))
    },
    handleLiveEvent: (event) => {
      if (!event.type.startsWith("notification.")) return
      setFeed((state) => applyNotificationEvent(state, event))
      if (started && event.type === "notification.created" && options.nativeEnabled() && isNativeNotificationType(event.notification.type) && !wasNotified(event.notification.id)) {
        void notifyNative(event.notification)
      }
    }
  }
}

export { shouldNotifyNative }
