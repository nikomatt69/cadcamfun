import { memo, useState } from "react"
import { Keyboard, Pressable, Share, Text, View, useWindowDimensions } from "react-native"
import * as Clipboard from "expo-clipboard"
import { Copy, CornerUpLeft, Share2, X } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { hexToRgba } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import type { ChatRow } from "@/lib/chat-log"

/**
 * nikcli's transcript hierarchy adapted for CADCAMFUN: user prompts are compact right-aligned
 * capsules while assistant prose uses the full reading width. The model's answer is content, not
 * chrome, so putting it in a second large bubble only wastes the phone's narrow viewport.
 *
 * A long press shows the message actions (nikcli: Copy / Reuse). Reuse only fills the composer:
 * the user decides whether to send it again, so a CAD/CAM mutation is never replayed silently.
 */
export const MessageBubble = memo(function MessageBubble({ row, onReuse }: { row: Extract<ChatRow, { kind: "user" | "assistant" }>; onReuse?: (text: string) => void }) {
  const { palette, isDark } = useTheme()
  const { fontScale } = useWindowDimensions()
  const [active, setActive] = useState(false)
  const isUser = row.kind === "user"
  const queued = row.kind === "user" && row.queued === true
  const offline = row.kind === "user" && row.offline === true

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(row.text)
      haptic("success")
      toast("Copied", "success")
    } catch {
      toast("Could not copy the message", "error")
    }
    setActive(false)
  }

  return (
    <Pressable
      onPress={() => { if (active) setActive(false); else Keyboard.dismiss() }}
      onLongPress={() => { haptic("selection"); setActive(true) }}
      delayLongPress={220}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? offline ? "Your message, waiting for the desktop" : queued ? "Your queued message" : "Your message" : "Assistant"}: ${row.text}`}
      accessibilityHint="Long press for copy, share and reuse"
      accessibilityActions={[{ name: "copy", label: "Copy" }, { name: "share", label: "Share" }, ...(isUser && onReuse ? [{ name: "reuse", label: "Reuse in composer" }] : [])]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "copy") void copy()
        if (event.nativeEvent.actionName === "share") void Share.share({ message: row.text })
        if (event.nativeEvent.actionName === "reuse") onReuse?.(row.text)
      }}
      style={{ alignItems: isUser ? "flex-end" : "flex-start", paddingHorizontal: 16, marginVertical: isUser ? 6 : 8 }}
    >
      <View
        style={{
          // Assistant prose keeps the full reading width. Its selection outline sits in a negative margin, so the
          // text never moves when the outline appears; the border is always 1pt (transparent at rest) for the same reason.
          alignSelf: isUser ? undefined : "stretch",
          maxWidth: isUser && fontScale <= 1.3 ? "82%" : "100%",
          minWidth: 0,
          borderRadius: isUser ? 18 : 12,
          borderCurve: "continuous",
          paddingHorizontal: isUser ? 15 : 7,
          paddingVertical: isUser ? 10 : 3,
          marginHorizontal: isUser ? 0 : -8,
          marginVertical: isUser ? 0 : -4,
          backgroundColor: isUser ? hexToRgba(palette.ink, isDark ? 0.14 : 0.075) : "transparent",
          borderWidth: 1,
          borderColor: active ? hexToRgba(palette.accent, 0.5) : "transparent",
          opacity: queued || offline ? 0.72 : 1,
        }}
      >
        {offline ? <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: "600", marginBottom: 6 }}>Waiting for the desktop · sends when it reconnects</Text>
          : queued ? <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: "600", marginBottom: 6 }}>Queued · the desktop takes it at the next step</Text> : null}
        <Text
          selectable={!active}
          style={{
            color: palette.ink,
            ...typeStyle(isUser ? 16 : 17, { leadingScale: isUser ? 1 : 1.04 }),
          }}
        >
          {row.text}
        </Text>
        {/* The pictures that went with the message: the transcript says they were sent. */}
        {isUser && row.attachments && row.attachments.length > 0 ? (
          <Text style={{ marginTop: 6, color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: "600" }}>
            {row.attachments.length === 1 ? "1 photo attached" : `${row.attachments.length} photos attached`}
          </Text>
        ) : null}
      </View>
      {active ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: isUser ? "flex-end" : "flex-start", gap: 8, marginTop: 8 }}>
          <ActionChip label="Copy" Icon={Copy} onPress={() => void copy()} />
          <ActionChip label="Share" Icon={Share2} onPress={() => { setActive(false); void Share.share({ message: row.text }) }} />
          {isUser && onReuse ? <ActionChip label="Reuse" Icon={CornerUpLeft} onPress={() => { setActive(false); haptic("selection"); onReuse(row.text) }} /> : null}
          <ActionChip label="Close" Icon={X} muted onPress={() => setActive(false)} />
        </View>
      ) : null}
    </Pressable>
  )
})

function ActionChip({ label, Icon, onPress, muted }: { label: string; Icon: typeof Copy; onPress(): void; muted?: boolean }) {
  const { palette } = useTheme()
  const color = muted ? palette.muted : palette.accent
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 22, borderCurve: "continuous", backgroundColor: hexToRgba(muted ? palette.ink : palette.accent, pressed ? 0.16 : 0.08) })}>
      <Icon size={14} color={color} />
      <Text style={{ color, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  )
}
