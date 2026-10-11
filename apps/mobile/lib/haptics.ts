import * as Haptics from "expo-haptics"
import { Platform } from "react-native"
import { useUIStore } from "./store"

/**
 * One haptic per user action, always paired with a visual (Apple §13 — multimodal feedback).
 * Haptics are off system-wide for many users and silent on some hardware, so the visual must
 * stand alone. Selection is throttled: picker ticks and scrolling fire it dozens of times a second.
 */

type HapticKind = "selection" | "light" | "success" | "error" | "warning"

const SELECTION_THROTTLE_MS = 80
let lastSelectionAt = 0

function allowed(kind: HapticKind): boolean {
  const prefs = useUIStore.getState().haptics
  if (!prefs.enabled || Platform.OS === "web") return false
  if (kind === "selection") return prefs.selection
  if (kind === "success") return prefs.success
  if (kind === "error" || kind === "warning") return prefs.errors
  return true
}

export function haptic(kind: HapticKind): void {
  if (kind === "selection") {
    const now = Date.now()
    if (now - lastSelectionAt < SELECTION_THROTTLE_MS) return
    lastSelectionAt = now
  }
  if (!allowed(kind)) return

  void (async () => {
    try {
      if (kind === "selection") await Haptics.selectionAsync()
      else if (kind === "light") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      else if (kind === "success") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      else if (kind === "error") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      else await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    } catch {
      // Unsupported hardware: the visual already carries the feedback.
    }
  })()
}
