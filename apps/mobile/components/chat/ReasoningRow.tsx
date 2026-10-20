import { memo, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { Brain } from "lucide-react-native"
import type { ChatRow } from "@/lib/chat-log"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type as typeStyle } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"
import { DisclosureChevron } from "./disclosure"

const words = (text: string): number => text.trim() ? text.trim().split(/\s+/).length : 0

/**
 * The model's reasoning (nikcli: the "Reasoning · N words" disclosure in MessageBubble). Collapsed it shows two lines,
 * so the user sees where the assistant is heading without the chain of thought taking over the narrow transcript;
 * while it is still being written the header says so.
 */
export const ReasoningRow = memo(function ReasoningRow({ row, live }: { row: Extract<ChatRow, { kind: "reasoning" }>; live: boolean }) {
  const { palette, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const body = row.text.trim()
  const count = words(row.text)
  const title = live ? "Thinking…" : `Reasoning · ${count.toLocaleString("en")} ${count === 1 ? "word" : "words"}`
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 4, borderRadius: 14, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.ink, isDark ? 0.12 : 0.08), backgroundColor: hexToRgba(palette.ink, isDark ? 0.035 : 0.02), overflow: "hidden" }}>
      <PressableScale
        subtle
        tint
        onPress={() => { haptic("selection"); setOpen((value) => !value) }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? "Collapse" : "Expand"} reasoning`}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}
      >
        <Brain size={14} color={palette.muted} />
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: palette.muted, ...typeStyle(12, { weight: "600" }) }}>{title}</Text>
        {live ? <ActivityIndicator size="small" color={palette.muted} /> : null}
        <DisclosureChevron open={open} size={14} color={palette.muted} />
      </PressableScale>
      {body ? (
        <Text selectable={open} numberOfLines={open ? undefined : 2}
          style={{ color: palette.soft, paddingHorizontal: 12, paddingBottom: 12, marginTop: -2, fontStyle: "italic", ...typeStyle(14) }}>
          {open ? body : body.split(/\n+/).slice(-2).join(" ")}
        </Text>
      ) : null}
    </View>
  )
})
