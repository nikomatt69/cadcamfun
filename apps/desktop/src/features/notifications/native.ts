/**
 * Native OS delivery for synced notifications (Tauri `plugin-notification`).
 *
 * The DB row is delivered exactly once per device: ids already shown are kept in
 * `localStorage` (bounded, newest last), so a restart or an SSE replay never
 * replays an old popup. Outside Tauri (browser preview) this is a no-op.
 */
import { isNativeNotificationType, type NotificationRow } from "@cadcamfun/api"
import { isTauri } from "../../app/sidecar.ts"

const STORAGE_KEY = "cadcamfun.notifiedNotificationIds"
const MAX_REMEMBERED = 500

export const loadNotifiedIds = (): Set<string> => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [])
  } catch { return new Set() }
}

export const rememberNotifiedId = (ids: Set<string>, id: string): Set<string> => {
  const next = new Set(ids)
  next.add(id)
  const bounded = [...next].slice(-MAX_REMEMBERED)
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(bounded)) } catch { /* storage full/blocked: in-memory dedup still applies */ }
  return new Set(bounded)
}

/** True when this row should raise a native popup on this device right now. */
export const shouldNotifyNative = (row: NotificationRow, notified: ReadonlySet<string>): boolean =>
  isNativeNotificationType(row.type) && !row.isRead && !notified.has(row.id)

let notified = loadNotifiedIds()
let permission: boolean | undefined

/** Shows one OS notification; resolves false when unavailable, denied or already shown. */
export async function notifyNative(row: NotificationRow): Promise<boolean> {
  if (!isTauri() || !shouldNotifyNative(row, notified)) return false
  try {
    const plugin = await import("@tauri-apps/plugin-notification")
    permission ??= await plugin.isPermissionGranted()
    if (!permission) permission = (await plugin.requestPermission()) === "granted"
    if (!permission) return false
    plugin.sendNotification({ title: row.title, body: row.content })
    notified = rememberNotifiedId(notified, row.id)
    return true
  } catch { return false }
}

/** Marks a row as already delivered without showing it (initial feed load, tests). */
export const markNotified = (id: string): void => { notified = rememberNotifiedId(notified, id) }
export const wasNotified = (id: string): boolean => notified.has(id)
