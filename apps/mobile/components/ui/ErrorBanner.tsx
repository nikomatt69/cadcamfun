import { Pressable, Text, View } from "react-native"
import { AlertTriangle } from "lucide-react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { EASE_OUT } from "@/lib/animation"

// Layout-animation builders live at module scope: building them in render re-creates them on every re-render.
const ENTER = FadeIn.duration(180).easing(EASE_OUT)
const EXIT = FadeOut.duration(120).easing(EASE_OUT)

/**
 * Inline error strip (nikcli-grade): a tinted card with an eyebrow, the message and an optional
 * action — validation happens where the problem is, not in a modal (Apple §16). Enters with a
 * 180ms ease-out fade (exit 120ms). Opacity only, so it is also the Reduce Motion presentation.
 */
export function ErrorBanner({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const { palette } = useTheme()

  const content = (
    <View
      style={{
        padding: 16,
        borderRadius: 16,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: hexToRgba(palette.danger, 0.22),
        backgroundColor: hexToRgba(palette.danger, 0.08),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <AlertTriangle size={16} color={palette.danger} strokeWidth={2.1} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ color: palette.danger, ...type(13, { weight: "600" }) }}>Needs attention</Text>
          <Text selectable accessibilityRole="alert" style={{ color: palette.soft, ...type(14) }}>
            {message}
          </Text>
          {actionLabel && onAction ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => ({ marginTop: 4, minHeight: 44, justifyContent: "center", opacity: pressed ? 0.7 : 1, alignSelf: "flex-start" })}
            >
              <Text style={{ color: palette.danger, ...type(13, { weight: "700" }) }}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )

  return <Animated.View entering={ENTER} exiting={EXIT}>{content}</Animated.View>
}
