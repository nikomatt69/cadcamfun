import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { CheckCircle2, Info, XCircle } from "lucide-react-native"
import { EASE_OUT, SPRING_MOMENTUM, projectMomentum, rubberband, spring, usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/**
 * Global toasts (nikcli-grade): stacked at the top edge, newest in front, older ones falling back
 * with a 12pt offset and a 5% scale step. Each toast knows how long it takes to read and holds
 * while touched; a swipe up dismisses with the finger's momentum — velocity or distance, a flick
 * is enough. Every tone is a theme token at a tint, so a toast belongs to the active palette.
 */

export type ToastKind = "info" | "success" | "error"

interface ToastEntry {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (toasts: readonly ToastEntry[]) => void

let queue: ToastEntry[] = []
let nextId = 1
const listeners = new Set<Listener>()

const emit = () => {
  for (const listener of listeners) listener(queue)
}

export function toast(message: string, kind: ToastKind = "info"): void {
  queue = [...queue.slice(-2), { id: nextId++, kind, message }]
  emit()
}

const dismiss = (id: number) => {
  queue = queue.filter((entry) => entry.id !== id)
  emit()
}

/** Long messages need longer on screen; a fixed dwell rushes a sentence or leaves "Copied" hanging. */
function readingTimeMs(message: string): number {
  const words = message.trim().split(/\s+/).length
  return Math.min(6500, Math.max(2400, 1100 + words * 300))
}

export function ToastHost() {
  const { palette, isDark, glass } = useTheme()
  const { top } = useSafeAreaInsets()
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([])

  useEffect(() => {
    const listener: Listener = setToasts
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  // Newest in front; older ones fall back into the stack behind it.
  const ordered = useMemo(() => [...toasts].reverse(), [toasts])

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: Math.max(top, 12) + 8, zIndex: 9999 }}>
      {ordered.map((entry, index) => (
        <ToastItem key={entry.id} toast={entry} depth={index} onDismiss={() => dismiss(entry.id)} />
      ))}
    </View>
  )
}

function ToastItem({ toast, depth, onDismiss }: { toast: ToastEntry; depth: number; onDismiss: () => void }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [height, setHeight] = useState(56)
  const [held, setHeld] = useState(false)
  const dismissed = useRef(false)

  const drag = useSharedValue(0)
  const dragOrigin = useRef(0)

  const close = useCallback(
    (velocity = 0) => {
      if (dismissed.current) return
      dismissed.current = true
      // Toasts live at the top edge, so they leave toward it — the same path they arrived on.
      if (reduced) {
        drag.set(0)
        onDismiss()
      } else {
        drag.set(
          withTiming(-height - 40, { duration: 220, easing: EASE_OUT }, (finished) => {
            "worklet"
            if (finished) scheduleOnRN(onDismiss)
          }),
        )
      }
    },
    [drag, height, onDismiss, reduced],
  )

  useEffect(() => {
    if (held) return
    const timer = setTimeout(() => close(), readingTimeMs(toast.message))
    return () => clearTimeout(timer)
  }, [close, held, toast.message])

  const pan = Gesture.Pan()
    .onStart(() => {
      dragOrigin.current = drag.get()
      setHeld(true)
    })
    .onUpdate((event) => {
      const raw = dragOrigin.current + event.translationY
      // Free upward — that is the way out. Resisted downward, where there is nowhere to go.
      drag.set(raw <= 0 ? raw : rubberband(raw, height))
    })
    .onEnd((event) => {
      setHeld(false)
      const velocity = event.velocityY
      const projected = dragOrigin.current + event.translationY + projectMomentum(velocity)
      if (projected < -height * 0.4 || velocity < -600) {
        close(Math.min(velocity, 0))
        return
      }
      drag.set(withSpring(0, { ...spring(SPRING_MOMENTUM), velocity }))
    })
    .onFinalize(() => {
      setHeld(false)
      if (!dismissed.current) drag.set(withSpring(0, spring(SPRING_MOMENTUM)))
    })

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: drag.get() + depth * 12 },
      { scale: 1 - depth * 0.05 },
    ],
    opacity: drag.get() === 0 ? 1 : 1 - Math.min(1, -drag.get() / (height + 40)),
  }))

  const tone = toast.kind === "success" ? palette.success : toast.kind === "error" ? palette.danger : palette.ink
  const Icon = toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? XCircle : Info

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => setHeight(event.nativeEvent.layout.height || 56)}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 10 - depth,
            borderRadius: 14,
            borderCurve: "continuous",
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: 12,
            overflow: "hidden",
            backgroundColor: hexToRgba(tone, isDark ? 0.18 : 0.11),
            borderColor: hexToRgba(tone, isDark ? 0.28 : 0.22),
            shadowColor: palette.ink,
            shadowOpacity: isDark ? 0.3 : 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          },
          animatedStyle,
        ]}
      >
        <Pressable
          onPress={() => close()}
          accessibilityRole="button"
          accessibilityLabel={toast.message}
          accessibilityHint="Tap or swipe up to dismiss"
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Icon size={17} color={tone} />
          <Text style={{ flex: 1, color: toast.kind === "info" ? palette.ink : tone, ...type(14, { weight: "500" }) }} numberOfLines={2}>
            {toast.message}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  )
}
