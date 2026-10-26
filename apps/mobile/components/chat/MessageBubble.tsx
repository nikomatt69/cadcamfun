import { memo, useEffect, useMemo, useSyncExternalStore } from "react"
import { Keyboard, Pressable, Share, Text, View, useWindowDimensions } from "react-native"
import * as Clipboard from "expo-clipboard"
import { Copy, CornerUpLeft, Share2, X, type LucideIcon } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { hexToRgba } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { PressableScale } from "@/components/ui/PressableScale"
import type { ChatRow } from "@/lib/chat-log"
import { activeMessage } from "@/lib/active-message"
import { userBubbleMaxWidth } from "@/lib/chat-geometry"
import { hasInteractiveContent, parseMarkdown, speechText } from "@/lib/markdown"
import { Reveal } from "./disclosure"
import { MessageImages } from "./image-preview"
import { Markdown } from "./markdown"

/**
 * nikcli's transcript hierarchy adapted for CADCAMFUN: user prompts are compact right-aligned
 * capsules (82% of the row, 18pt radius, an ink-tinted fill) while assistant prose uses the full reading width and is
 * rendered as Markdown. The model's answer is content, not chrome, so putting it in a second large bubble only wastes
 * the phone's narrow viewport.
 *
 * A long press shows the message actions (nikcli: Copy / Reuse), one message at a time. Reuse only fills the composer:
 * the user decides whether to send it again, so a CAD/CAM mutation is never replayed silently.
 *
 * A queued or offline message keeps full-strength text (dimming the whole bubble pushed its label under 3:1):
 * the state is said in words above the message, not by fading it.
 */
export const MessageBubble = memo(function MessageBubble({ id, row, onReuse, startsTurn = false }: {
  /** The transcript item's id: which message owns the open action chips. */
  id: string
  row: Extract<ChatRow, { kind: "user" | "assistant" }>
  onReuse?: (text: string) => void
  /** A prompt that follows an answer or a tool run: it opens a new turn, so it gets more air above it. */
  startsTurn?: boolean
}) {
  const { palette, isDark } = useTheme()
  const { width, fontScale } = useWindowDimensions()
  const active = useSyncExternalStore(activeMessage.subscribe, () => activeMessage.get() === id)
  const isUser = row.kind === "user"
  const queued = row.kind === "user" && row.queued === true
  const offline = row.kind === "user" && row.offline === true
  const photos = row.kind === "user" ? row.previews?.length ?? row.attachments?.length ?? 0 : 0
  // Parsed once per text (the parser caches); only assistant prose is Markdown, a prompt is what the user typed.
  const blocks = useMemo(() => (isUser ? null : parseMarkdown(row.text)), [isUser, row.text])
  // Copy buttons and links inside the answer must stay reachable one by one for VoiceOver, so such an answer is not one flat element.
  const flat = isUser || !blocks || !hasInteractiveContent(blocks)
  const spoken = isUser || !blocks ? row.text : speechText(blocks)

  // A row that scrolls away or leaves the conversation must not leave its chips open for the next message.
  useEffect(() => () => activeMessage.release(id), [id])
  const close = () => activeMessage.release(id)

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(row.text)
      haptic("success")
      toast("Copied", "success")
    } catch {
      toast("Could not copy the message", "error")
    }
    close()
  }
  const share = () => {
    close()
    void Share.share({ message: row.text }).catch(() => undefined)
  }

  return (
    <Pressable
      onPress={() => { if (active) close(); else Keyboard.dismiss() }}
      onLongPress={() => { haptic("selection"); activeMessage.set(id) }}
      delayLongPress={220}
      accessible={flat}
      accessibilityRole={flat ? "text" : undefined}
      accessibilityLabel={flat ? `${isUser ? offline ? "Your message, waiting for the desktop" : queued ? "Your queued message" : "Your message" : "Assistant"}${photos ? `, with ${photos === 1 ? "1 photo" : `${photos} photos`}` : ""}${spoken ? `: ${spoken}` : ""}` : undefined}
      accessibilityHint={flat ? "Long press for copy, share and reuse" : undefined}
      accessibilityActions={flat ? [{ name: "copy", label: "Copy" }, { name: "share", label: "Share" }, ...(isUser && onReuse ? [{ name: "reuse", label: "Reuse in composer" }] : [])] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "copy") void copy()
        if (event.nativeEvent.actionName === "share") share()
        if (event.nativeEvent.actionName === "reuse") onReuse?.(row.text)
      }}
      style={{ alignItems: isUser ? "flex-end" : "flex-start", paddingHorizontal: 16, marginTop: (isUser ? 6 : 8) + (startsTurn ? 10 : 0), marginBottom: isUser ? 6 : 8 }}
    >
      <View
        style={{
          // Assistant prose keeps the full reading width. Its selection outline sits in a negative margin, so the
          // text never moves when the outline appears; the border is always 1pt (transparent at rest) for the same reason.
          alignSelf: isUser ? undefined : "stretch",
          maxWidth: isUser ? userBubbleMaxWidth(width, fontScale) : "100%",
          minWidth: 0,
          borderRadius: isUser ? 18 : 12,
          borderCurve: "continuous",
          paddingHorizontal: isUser ? 16 : 7,
          paddingVertical: isUser ? 12 : 3,
          marginHorizontal: isUser ? 0 : -8,
          marginVertical: isUser ? 0 : -4,
          backgroundColor: isUser ? hexToRgba(palette.ink, isDark ? 0.14 : 0.08) : "transparent",
          borderWidth: 1,
          borderColor: active ? hexToRgba(palette.accent, 0.5) : "transparent",
        }}
      >
        {offline ? <Text style={{ color: palette.soft, marginBottom: 6, ...typeStyle(12, { weight: "600" }) }}>Waiting for the desktop · sends when it reconnects</Text>
          : queued ? <Text style={{ color: palette.soft, marginBottom: 6, ...typeStyle(12, { weight: "600" }) }}>Queued · the desktop takes it at the next step</Text> : null}
        {/* The photos that went with the message, above the words they illustrate. */}
        {isUser && row.previews && row.previews.length > 0 ? (
          <View style={{ marginBottom: row.text ? 10 : 0 }}><MessageImages images={row.previews} /></View>
        ) : null}
        {isUser ? (
          row.text ? <Text selectable={!active} style={{ color: palette.ink, textAlign: "left", ...typeStyle(16) }}>{row.text}</Text> : null
        ) : (
          <Markdown text={row.text} selectable={!active} />
        )}
        {/* A reopened conversation keeps the names, not the pixels: the transcript still says they were sent. */}
        {isUser && !row.previews?.length && row.attachments && row.attachments.length > 0 ? (
          <Text style={{ marginTop: row.text ? 6 : 0, color: palette.soft, ...typeStyle(12, { weight: "600" }) }}>
            {row.attachments.length === 1 ? "1 photo attached" : `${row.attachments.length} photos attached`}
          </Text>
        ) : null}
      </View>
      {active ? (
        <Reveal style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: isUser ? "flex-end" : "flex-start", gap: 8, marginTop: 8 }}>
          <ActionChip label="Copy" Icon={Copy} onPress={() => void copy()} />
          <ActionChip label="Share" Icon={Share2} onPress={share} />
          {isUser && onReuse ? <ActionChip label="Reuse" Icon={CornerUpLeft} onPress={() => { close(); haptic("selection"); onReuse(row.text) }} /> : null}
          <ActionChip label="Close" Icon={X} muted onPress={close} />
        </Reveal>
      ) : null}
    </Pressable>
  )
})

/** nikcli's chip: a neutral ink-tinted capsule, 36pt tall with a 4pt slop so the touch target is 44. */
function ActionChip({ label, Icon, onPress, muted }: { label: string; Icon: LucideIcon; onPress(): void; muted?: boolean }) {
  const { palette, isDark } = useTheme()
  const color = muted ? palette.muted : palette.ink
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderCurve: "continuous", backgroundColor: hexToRgba(palette.ink, isDark ? 0.1 : 0.06) }}>
      <Icon size={14} color={color} strokeWidth={2} />
      <Text style={{ color, ...typeStyle(12, { weight: "600" }) }}>{label}</Text>
    </PressableScale>
  )
}
