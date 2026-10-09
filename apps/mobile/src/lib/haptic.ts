/**
 * Lightweight haptic feedback.
 *
 * On iOS Safari does not implement `navigator.vibrate` so the visual press feedback (scale 0.97 + tint)
 * carries the interaction. The native layer can be wired later with `UIImpactFeedbackGenerator`.
 */
export type HapticStyle = "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error"

const PATTERN: Record<HapticStyle, number | number[]> = {
  selection: 5,
  light: 8,
  medium: 14,
  heavy: 22,
  success: [10, 40, 10],
  warning: [14, 30, 14],
  error: [22, 60, 22, 60, 22],
}

export const haptic = (style: HapticStyle = "light"): void => {
  if (typeof navigator === "undefined") return
  const v = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
  if (typeof v.vibrate !== "function") return
  try {
    v.vibrate(PATTERN[style])
  } catch {
    // Some sandboxes block vibration; ignore.
  }
}