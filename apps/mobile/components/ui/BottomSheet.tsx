import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react"
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { EASE_IN_OUT, SHEET_SPRING, projectMomentum, rubberband, spring, usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { AdaptiveBlur } from "@/components/GlassView"

/** Past this fraction of the sheet's own height, a projected flick commits to dismissing. */
const DISMISS_FRACTION = 0.35
/** A hard downward flick dismisses regardless of how far it actually travelled. */
const DISMISS_VELOCITY = 900

/**
 * The app's bottom sheet (nikcli-grade): a real UISheetPresentationController feel, not a modal.
 *
 * - The surface is the glass material — blurred, with a bright top edge reading as light catching
 *   the leading edge — and content scrolls under it.
 * - It tracks the finger 1:1 from wherever it was grabbed; release continues at the finger's
 *   velocity (spring with `velocity`), so there is no seam between dragging and animating.
 * - Dragging past the open edge meets progressive resistance (`rubberband`), never a hard stop.
 * - Dismissal is decided from *projected* momentum (Apple §6), not the raw release point — a
 *   small fast flick still throws the surface all the way.
 * - The scrim dims in proportion to the drag, so releasing halfway never snaps the dimming.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dragEnabled = true,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: ReactNode; dragEnabled?: boolean }>) {
  const { palette, isDark, glass } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const reduced = usePrefersReducedMotion()

  const [mounted, setMounted] = useState(open)
  const [measured, setMeasured] = useState(false)

  const translateY = useSharedValue(windowHeight)
  const dragOrigin = useSharedValue(0)
  const sheetHeight = useSharedValue(0)
  const maxHeight = Math.min(windowHeight * 0.9, 640)
  // A swipe-dismiss closes the sheet *and* tells the parent, which flips `open` a frame later.
  // Without this flag the parent's update would restart the exit at zero velocity and eat the flick.
  const closing = useSharedValue(0)

  const animateIn = () => {
    if (reduced) translateY.set(0)
    else translateY.set(withSpring(0, spring(SHEET_SPRING)))
  }

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useEffect(() => {
    if (!mounted || !measured) return
    if (open) {
      closing.set(0)
      animateIn()
    } else if (!closing.get()) {
      const target = Math.max(sheetHeight.get(), 1)
      if (reduced) {
        translateY.set(target)
        scheduleOnRN(() => setMounted(false))
      } else {
        translateY.set(
          withTiming(target, { duration: 220, easing: EASE_IN_OUT }, (finished) => {
            "worklet"
            if (finished) scheduleOnRN(() => setMounted(false))
          }),
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, measured, reduced, sheetHeight, translateY])

  const pan = Gesture.Pan()
    .enabled(dragEnabled)
    .onStart(() => {
      // Take over from wherever the sheet currently *is* — a half-closed sheet is caught, not jumped.
      dragOrigin.set(translateY.get())
    })
    .onUpdate((event) => {
      const raw = dragOrigin.get() + event.translationY
      // Above the open edge: rubber-band resistance. Below: track 1:1.
      translateY.set(raw < 0 ? -rubberband(-raw, Math.max(sheetHeight.get(), 1)) : raw)
    })
    .onEnd((event) => {
      const velocity = event.velocityY
      const projected = dragOrigin.get() + event.translationY + projectMomentum(velocity)
      // Velocity or projected distance — a flick is enough.
      const dismiss = velocity > DISMISS_VELOCITY || projected > Math.max(sheetHeight.get(), 1) * DISMISS_FRACTION
      if (dismiss) {
        closing.set(1)
        translateY.set(withSpring(Math.max(sheetHeight.get(), 1), { ...spring(SHEET_SPRING), velocity: Math.max(velocity, 0) }))
        scheduleOnRN(() => {
          haptic("light")
          onClose()
        })
      } else {
        translateY.set(withSpring(0, { ...spring(SHEET_SPRING), velocity }))
      }
    })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, Math.max(sheetHeight.get(), 1)], [1, 0], Extrapolation.CLAMP),
  }))

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }))

  if (!mounted) return null

  const radius = 28

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Backdrop: dim to focus (Apple §12). Tap to dismiss; opacity follows the drag. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.62)" : hexToRgba(palette.ink, 0.18) }, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight,
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              borderCurve: "continuous",
              shadowColor: palette.ink,
              shadowOpacity: isDark ? 0.28 : 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: -5 },
              elevation: 16,
              paddingBottom: Math.max(insets.bottom, 16),
              opacity: measured ? 1 : 0,
            },
            sheetStyle,
          ]}
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height
            if (height > 0 && !measured) {
              sheetHeight.set(height)
              setMeasured(true)
              if (open) {
                // The entrance was deferred until the sheet knew its own height.
                requestAnimationFrame(() => {
                  translateY.set(height)
                  animateIn()
                })
              } else {
                translateY.set(height)
              }
            }
          }}
        >
          {/* The glass material under the content, with a bright top edge (light on the material). */}
          <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radius, borderTopRightRadius: radius, overflow: "hidden" }]} pointerEvents="none">
            <AdaptiveBlur
              tint={isDark ? "dark" : "light"}
              intensity={isDark ? 90 : 75}
              style={StyleSheet.absoluteFill}
              fallbackColor={hexToRgba(palette.surface, isDark ? 0.85 : 0.82)}
              opaqueFallbackColor={palette.surface}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderTopLeftRadius: radius,
                  borderTopRightRadius: radius,
                  borderWidth: 1,
                  borderBottomWidth: 0,
                  borderColor: isDark ? hexToRgba(palette.ink, 0.1) : hexToRgba(palette.surface, 0.86),
                },
              ]}
            />
          </View>

          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Sheet handle"
            accessibilityHint="Drag down to dismiss"
            style={{ minHeight: 40, paddingTop: 10, justifyContent: "center", alignItems: "center" }}
          >
            <View style={{ width: 36, height: 5, borderRadius: 999, backgroundColor: hexToRgba(palette.ink, isDark ? 0.22 : 0.18) }} />
          </View>

          {title ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
              <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "600", lineHeight: 22, textAlign: "center" }}>{title}</Text>
            </View>
          ) : null}

          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
