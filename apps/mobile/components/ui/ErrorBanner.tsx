import { Pressable, Text, View } from "react-native"
import { AlertTriangle } from "lucide-react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { usePrefersReducedMotion } from "@/lib/animation"

/**
 * Inline error strip (nikcli-grade): a tinted card with an eyebrow, the message and an optional
 * action — validation happens where the problem is, not in a modal (Apple §16). Enters with a
 * soft fade + 4pt rise; Reduce Motion collapses that to a cross-fade.
 */
export function ErrorBanner({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()

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

  return reduced ? <>{content}</> : <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>{content}</Animated.View>
}
