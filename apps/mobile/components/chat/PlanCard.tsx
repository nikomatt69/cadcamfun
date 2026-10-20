import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Check, Circle, CircleDot, ListChecks, X } from "lucide-react-native"
import type { ChatRow } from "@/lib/chat-log"
import { hexToRgba, useTheme } from "@/lib/theme"
import { layout } from "@/lib/layout"
import { type as typeStyle } from "@/lib/typography"

/** The agent's todo list as it stands (nikcli: plan panel), updated in place while the turn runs. */
export const PlanCard = memo(function PlanCard({ row }: { row: Extract<ChatRow, { kind: "plan" }> }) {
  const { palette } = useTheme()
  const done = row.items.filter((item) => item.status === "completed").length
  return (
    <View accessible accessibilityLabel={`Plan, ${done} of ${row.items.length} steps done. ${row.items.map((item) => `${item.content}: ${item.status.replace("_", " ")}`).join(". ")}`}
      style={{ marginHorizontal: 16, marginVertical: 8, padding: 16, gap: 12, borderRadius: layout.cardRadius, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, backgroundColor: palette.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ListChecks size={16} color={palette.accent} />
        <Text style={{ flex: 1, color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>Plan</Text>
        <Text style={{ color: palette.muted, ...typeStyle(12), fontVariant: ["tabular-nums"] }}>{done}/{row.items.length}</Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: hexToRgba(palette.ink, 0.08) }}>
        <View style={{ width: `${row.items.length ? (done / row.items.length) * 100 : 0}%`, height: 4, backgroundColor: palette.success }} />
      </View>
      {row.items.map((item, index) => {
        const Icon = item.status === "completed" ? Check : item.status === "in_progress" ? CircleDot : item.status === "cancelled" ? X : Circle
        const color = item.status === "completed" ? palette.success : item.status === "in_progress" ? palette.accent : palette.muted
        return (
          <View key={`${index}:${item.content}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
            <View style={{ paddingTop: 3, flexShrink: 0 }}><Icon size={14} color={color} /></View>
            <Text selectable style={{ flex: 1, color: item.status === "in_progress" ? palette.ink : palette.soft, fontSize: 14, lineHeight: 21, fontWeight: item.status === "in_progress" ? "600" : "400", textDecorationLine: item.status === "cancelled" ? "line-through" : "none" }}>{item.content}</Text>
          </View>
        )
      })}
    </View>
  )
})

/** Host notices: provider retries, compaction and blocked permissions. Not part of the answer. */
export const NoticeRow = memo(function NoticeRow({ row }: { row: Extract<ChatRow, { kind: "notice" }> }) {
  const { palette } = useTheme()
  const color = row.tone === "warning" ? palette.warning : palette.muted
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={row.text} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 20, paddingVertical: 8 }}>
      <View style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 3, backgroundColor: color }} />
      <Text selectable style={{ flexShrink: 1, color, fontSize: 12, lineHeight: 17, textAlign: "center" }}>{row.text}</Text>
    </View>
  )
})
