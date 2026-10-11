import { BlurView, type BlurTint } from "expo-blur"
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect"
import { Platform, View, type StyleProp, type ViewStyle } from "react-native"
import { usePrefersReducedTransparency } from "@/lib/animation"

/**
 * The app's blur layer (Apple §12 — materials & depth, iOS 26/27 Liquid Glass).
 *
 * On iOS 26+ with Liquid Glass available, renders the platform's own glass material — the look
 * Apple's current system surfaces use. Older iOS falls back to a UIBlurEffect; Reduce
 * Transparency replaces the material with a solid color instead of a semi-transparent lie.
 * `fallbackColor` stays behind the material so its tint always belongs to the active theme.
 */
export type AdaptiveBlurProps = {
  tint?: "light" | "dark" | "default"
  intensity?: number
  style?: StyleProp<ViewStyle>
  fallbackColor: string
  opaqueFallbackColor?: string
  children?: React.ReactNode
  pointerEvents?: "none" | "auto" | "box-none" | "box-only"
}

const blurTints = new Set<BlurTint>([
  "light",
  "dark",
  "default",
  "extraLight",
  "regular",
  "prominent",
  "systemMaterial",
  "systemChromeMaterial",
])

export function AdaptiveBlur({
  style,
  fallbackColor,
  opaqueFallbackColor,
  children,
  pointerEvents,
  tint = "default",
  intensity = 72,
}: AdaptiveBlurProps) {
  const prefersReducedTransparency = usePrefersReducedTransparency()

  if (prefersReducedTransparency) {
    return (
      <View style={[style, { backgroundColor: opaqueFallbackColor ?? fallbackColor }]} pointerEvents={pointerEvents}>
        {children}
      </View>
    )
  }

  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={false}
        style={[style, { backgroundColor: fallbackColor }]}
        pointerEvents={pointerEvents}
      >
        {children}
      </GlassView>
    )
  }

  return (
    <BlurView
      tint={blurTints.has(tint) ? tint : "default"}
      intensity={intensity}
      style={[style, { backgroundColor: fallbackColor }]}
      pointerEvents={pointerEvents}
    >
      {children}
    </BlurView>
  )
}
