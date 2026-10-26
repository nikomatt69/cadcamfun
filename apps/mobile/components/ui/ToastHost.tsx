import { useEffect, useState } from "react"
import { AccessibilityInfo, Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated"
import { CheckCircle2, Info, X, XCircle } from "lucide-react-native"
import { usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { type } from "@/lib/typography"

import { enqueueToast, removeToast, toastAnnouncement, toastDwellMs, type ToastEntry, type ToastKind } from "@/lib/toast-queue"

export type { ToastKind }
type Listener = (entries: readonly ToastEntry[]) => void
let queue: readonly ToastEntry[] = []
let nextId = 1
const listeners = new Set<Listener>()
const emit = () => { for (const listener of listeners) listener(queue) }
export function toast(message: string, kind: ToastKind = "info"): void {
  queue = enqueueToast(queue, { id: nextId++, kind, message })
  emit()
  // VoiceOver does not read a view that merely appears; announce once here, not per mounted host.
  AccessibilityInfo.announceForAccessibility(toastAnnouncement(kind, message))
}
function dismiss(id: number) { queue = removeToast(queue, id); emit() }

/** A readable, dismissible status surface. No gesture worklet calls React state setters. */
export function ToastHost() {
  const { top } = useSafeAreaInsets()
  const content = useContentLayout()
  const [entries, setEntries] = useState<readonly ToastEntry[]>(queue)
  useEffect(() => { listeners.add(setEntries); return () => { listeners.delete(setEntries) } }, [])
  return <View onLayout={content.onLayout} pointerEvents="box-none" style={{ position: "absolute", top: Math.max(top, 12) + 8, left: 0, right: 0, paddingHorizontal: content.gutter, zIndex: 9999, gap: 8 }}>
    {entries.map((entry) => <ToastItem key={entry.id} entry={entry} />)}
  </View>
}
function ToastItem({ entry }: { entry: ToastEntry }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [held, setHeld] = useState(false)
  const [screenReader, setScreenReader] = useState(false)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (mounted) setScreenReader(enabled) }).catch(() => undefined)
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader)
    return () => { mounted = false; subscription.remove() }
  }, [])
  useEffect(() => {
    if (held || screenReader) return
    // A repeat of the same toast bumps its stamp, which restarts the dwell instead of stacking a copy.
    const timer = setTimeout(() => dismiss(entry.id), toastDwellMs(entry.message, entry.kind))
    return () => clearTimeout(timer)
  }, [entry.id, entry.message, entry.kind, entry.stamp, held, screenReader])
  const color = entry.kind === "success" ? palette.success : entry.kind === "error" ? palette.danger : palette.accent
  const Icon = entry.kind === "success" ? CheckCircle2 : entry.kind === "error" ? XCircle : Info
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(150)} exiting={reduced ? undefined : FadeOut.duration(100)}
    layout={reduced ? undefined : LinearTransition.duration(150)}
    style={{ backgroundColor: palette.surface, borderRadius: 18, borderCurve: "continuous", borderWidth: 0.5, borderColor: hexToRgba(color, 0.3), boxShadow: "0 4px 20px rgba(0,0,0,0.14)" }}>
    <Pressable onPress={() => dismiss(entry.id)} onPressIn={() => setHeld(true)} onPressOut={() => setHeld(false)}
      accessibilityRole="button" accessibilityLabel={entry.message} accessibilityHint="Dismiss notification"
      accessibilityLiveRegion="polite"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <Icon size={20} color={color} />
      <Text style={{ flex: 1, minWidth: 0, color: palette.ink, ...type(14, { weight: "500", leadingScale: 1.1 }) }}>{entry.message}</Text>
      <X size={17} color={palette.muted} />
    </Pressable>
  </Animated.View>
}
