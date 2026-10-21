import { isNativeNotificationType, type NotificationRow } from "@cadcamfun/api"

/**
 * Pure native-pop-up policy for the paired phone: important, unread, never shown.
 * Kept free of Expo imports so it is testable without a device runtime. The stream
 * replays recent frames on reconnect, so dedupe by row id is part of the policy.
 */
const shown = new Set<string>()
const MAX_SHOWN = 500

export const shouldPresentNotification = (row: NotificationRow): boolean =>
  isNativeNotificationType(row.type) && !row.isRead && !shown.has(row.id)

export const markNotificationShown = (id: string): void => {
  shown.add(id)
  if (shown.size > MAX_SHOWN) for (const old of [...shown].slice(0, shown.size - MAX_SHOWN)) shown.delete(old)
}
