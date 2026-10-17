import { Text, View, useWindowDimensions } from "react-native"
import { useTheme } from "@/lib/theme"
import { hexToRgba } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import type { ChatRow } from "@/lib/chat-log"

/**
 * nikcli's transcript hierarchy adapted for CADCAMFUN: user prompts are compact right-aligned
 * capsules while assistant prose uses the full reading width. The model's answer is content, not
 * chrome, so putting it in a second large bubble only wastes the phone's narrow viewport.
 */
export function MessageBubble({ row }: { row: Extract<ChatRow, { kind: "user" | "assistant" }> }) {
  const { palette, isDark } = useTheme()
  const { fontScale } = useWindowDimensions()
  const isUser = row.kind === "user"

  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start", paddingHorizontal: 16, marginVertical: isUser ? 6 : 8 }}>
      <View
        style={{
          width: isUser ? undefined : "100%",
          maxWidth: isUser && fontScale <= 1.3 ? "82%" : "100%",
          minWidth: 0,
          borderRadius: isUser ? 18 : 0,
          borderCurve: "continuous",
          paddingHorizontal: isUser ? 16 : 0,
          paddingVertical: isUser ? 11 : 0,
          backgroundColor: isUser ? hexToRgba(palette.ink, isDark ? 0.14 : 0.075) : "transparent",
        }}
      >
        <Text
          selectable
          style={{
            color: palette.ink,
            ...typeStyle(isUser ? 16 : 17, { leadingScale: isUser ? 1 : 1.04 }),
          }}
        >
          {row.text}
        </Text>
      </View>
    </View>
  )
}
