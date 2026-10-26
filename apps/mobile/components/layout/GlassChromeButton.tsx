import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { GlassSurface } from "@/components/GlassView"
import { PressableScale } from "@/components/ui/PressableScale"
import { PALETTES } from "@/lib/palette"
import { haptic } from "@/lib/haptics"
import { hexToRgba } from "@/lib/theme"

/** The minimum touch target and the diameter of the round chrome buttons. */
const BUTTON = 44

/**
 * A round glass button, the chrome of the assistant's header, for the entry flow: the scanner's close and
 * torch over the camera, the lock screen. 44pt, a 1pt ring, an ink-tint press with the shared spring.
 * `over="camera"` makes the glass dark in both themes.
 */
export function GlassChromeButton({ label, hint, selected, disabled, over = "page", onPress, children }: {
  label: string
  hint?: string
  /** A toggle that is on (the torch). */
  selected?: boolean
  disabled?: boolean
  over?: "page" | "camera"
  onPress: () => void
  children: ReactNode
}) {
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      tint
      tintStrength={0.1}
      style={{ width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, borderCurve: "continuous" }}
    >
      <GlassSurface radius={BUTTON / 2} over={over} style={{ width: BUTTON, height: BUTTON, alignItems: "center", justifyContent: "center" }}>
        {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(PALETTES.dark.ink, 0.2) }]} /> : null}
        {children}
      </GlassSurface>
    </PressableScale>
  )
}
