import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import type { ChatRow } from "@/lib/chat-log"

/**
 * A chat bubble. User: right-aligned accent fill (white type). Assistant: left-aligned surface.
 * Long-form text gets the relaxed leading of body copy; code-ish rows stay snug. Consecutive
 * deltas were already folded into one row by the log, so one answer renders as one bubble.
 */
export function MessageBubble({ row }: { row: Extract<ChatRow, { kind: "user" | "assistant" }> }) {
  const { palette, isDark } = useTheme()
  const isUser = row.kind === "user"

  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start", paddingHorizontal: 16, marginVertical: 4 }}>
      <View
        style={{
          maxWidth: "86%",
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 9,
          backgroundColor: isUser ? palette.userBubble : isDark ? palette.panel : palette.assistantBubble,
          borderWidth: isUser ? 0 : 0.5,
          borderColor: isUser ? "transparent" : palette.border,
        }}
      >
        <Text
          style={{
            color: isUser ? palette.onAccent : palette.ink,
            fontSize: 16,
            lineHeight: 22,
            letterSpacing: -0.004,
          }}
        >
          {row.text}
        </Text>
      </View>
    </View>
  )
}
