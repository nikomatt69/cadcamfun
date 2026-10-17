import { useEffect, useState } from "react"
import { AccessibilityInfo, Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated"
import { CheckCircle2, Info, X, XCircle } from "lucide-react-native"
import { usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { useContentLayout } from "@/components/layout/use-content-layout"

export type ToastKind = "info" | "success" | "error"
interface ToastEntry { id: number; kind: ToastKind; message: string }
type Listener = (entries: readonly ToastEntry[]) => void
let queue: ToastEntry[] = []
let nextId = 1
const listeners = new Set<Listener>()
const emit = () => { for (const listener of listeners) listener(queue) }
export function toast(message: string, kind: ToastKind = "info"): void {
  queue = [...queue.slice(-2), { id: nextId++, kind, message }]
  emit()
}
function dismiss(id: number) { queue = queue.filter((entry) => entry.id !== id); emit() }

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
    const dwell = Math.min(10000, Math.max(3500, 1500 + entry.message.split(/\s+/).length * 350))
    const timer = setTimeout(() => dismiss(entry.id), dwell)
    return () => clearTimeout(timer)
  }, [entry.id, entry.message, held, screenReader])
  const color = entry.kind === "success" ? palette.success : entry.kind === "error" ? palette.danger : palette.accent
  const Icon = entry.kind === "success" ? CheckCircle2 : entry.kind === "error" ? XCircle : Info
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(150)} exiting={reduced ? undefined : FadeOut.duration(100)}
    layout={reduced ? undefined : LinearTransition.duration(150)}
    style={{ backgroundColor: palette.surface, borderRadius: 18, borderCurve: "continuous", borderWidth: 0.5, borderColor: hexToRgba(color, 0.3), boxShadow: "0 4px 20px rgba(0,0,0,0.14)" }}>
    <Pressable onPress={() => dismiss(entry.id)} onPressIn={() => setHeld(true)} onPressOut={() => setHeld(false)}
      accessibilityRole="button" accessibilityLabel={entry.message} accessibilityHint="Dismiss notification"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }}>
      <Icon size={20} color={color} />
      <Text style={{ flex: 1, minWidth: 0, color: palette.ink, fontSize: 14, lineHeight: 21, fontWeight: "500" }}>{entry.message}</Text>
      <X size={17} color={palette.muted} />
    </Pressable>
  </Animated.View>
}
