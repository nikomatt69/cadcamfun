import { BlurView, type BlurTint } from "expo-blur"
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect"
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { usePrefersReducedTransparency } from "@/lib/animation"
import { PALETTES } from "@/lib/palette"
import { hexToRgba, useTheme } from "@/lib/theme"

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
  const { colorScheme } = useTheme()

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
        // The glass follows the system appearance unless told otherwise; the app can be dark on a light phone.
        colorScheme={tint === "default" ? colorScheme : tint}
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

/**
 * A rounded glass surface with the app's chrome edge: continuous corners, a 1pt ink-tinted ring and the
 * material inside (the header buttons, the dock capsules, the status over the camera).
 *
 * `over="camera"` is for chrome drawn on the live camera, which is black in both themes: the material is
 * always dark and the ring white, taken from the dark palette so nothing here is a private colour.
 * Reduce Transparency swaps the material for the solid palette surface (see `AdaptiveBlur`).
 */
export function GlassSurface({ radius = 26, over = "page", lifted = false, style, children }: {
  radius?: number
  over?: "page" | "camera"
  /** A soft drop shadow, for chrome that floats over content (the dock). */
  lifted?: boolean
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}) {
  const { palette, isDark } = useTheme()
  const camera = over === "camera"
  const dark = camera || isDark
  const base = camera ? PALETTES.dark : palette
  return (
    <View
      style={[
        {
          overflow: "hidden",
          borderRadius: radius,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: hexToRgba(base.ink, camera ? 0.2 : isDark ? 0.14 : 0.1),
          ...(lifted ? { boxShadow: `0 4px 14px ${hexToRgba(base.overlay, dark ? 0.32 : 0.1)}` } : null),
        },
        style,
      ]}
    >
      <AdaptiveBlur
        tint={dark ? "dark" : "light"}
        intensity={dark ? 80 : 70}
        style={StyleSheet.absoluteFill}
        fallbackColor={hexToRgba(camera ? base.background : base.surface, camera ? 0.72 : 0.92)}
        opaqueFallbackColor={camera ? base.background : base.surface}
        pointerEvents="none"
      />
      {children}
    </View>
  )
}
