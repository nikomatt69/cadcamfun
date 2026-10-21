import * as Notifications from "expo-notifications"
import type { NotificationRow } from "@cadcamfun/api"
import { markNotificationShown, shouldPresentNotification } from "./notification-policy"

export { markNotificationShown, shouldPresentNotification } from "./notification-policy"

/**
 * Local native notifications for the paired companion: when the host stream announces a
 * new important DB row, the phone shows the same OS popup the desktop shows. Dedup and
 * importance rules live in `notification-policy.ts`. No remote push: while unpaired or
 * offline there is no channel, by design.
 */

let configured = false
export function configureNotificationHandler(): void {
  if (configured) return
  configured = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  })
}

let permission: boolean | undefined
/** Presents one local notification now; resolves false when denied or already shown. */
export async function presentNotification(row: NotificationRow): Promise<boolean> {
  if (!shouldPresentNotification(row)) return false
  try {
    permission ??= (await Notifications.getPermissionsAsync()).granted
    if (!permission) permission = (await Notifications.requestPermissionsAsync()).granted
    if (!permission) return false
    markNotificationShown(row.id)
    await Notifications.scheduleNotificationAsync({
      identifier: row.id,
      content: { title: row.title, body: row.content, data: { notificationId: row.id, linkUrl: row.linkUrl, projectId: row.projectId } },
      trigger: null,
    })
    return true
  } catch { return false }
}

/** Badge count mirrors the DB unread count; -1 hides it, matching Activity tab state. */
export async function syncNotificationBadge(unreadCount: number): Promise<void> {
  try { await Notifications.setBadgeCountAsync(Math.max(0, unreadCount)) } catch { /* badge is best-effort */ }
}
