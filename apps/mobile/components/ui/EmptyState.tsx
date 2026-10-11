import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/**
 * A calm empty state (nikcli-grade): a bordered card with the message, not an illustration — the
 * hierarchy is the title, the description explains, and the optional `action` is where the user
 * goes next. Cards read as part of the list they sit in.
 */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const { palette } = useTheme()

  return (
    <View
      style={{
        alignItems: "center",
        paddingHorizontal: 24,
        paddingVertical: 36,
        borderRadius: 20,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: hexToRgba(palette.ink, 0.08),
        backgroundColor: palette.surface,
      }}
    >
      <Text selectable style={{ textAlign: "center", color: palette.ink, ...type(19, { weight: "600" }) }}>
        {title}
      </Text>
      {description ? (
        <Text selectable style={{ marginTop: 8, maxWidth: 300, textAlign: "center", color: palette.muted, ...type(15) }}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 20, width: "100%" }}>{action}</View> : null}
    </View>
  )
}
