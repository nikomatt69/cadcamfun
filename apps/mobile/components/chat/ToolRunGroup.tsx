import { memo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Layers } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { type as typeStyle } from "@/lib/typography"
import { toolRunSummary, type ToolRow } from "@/lib/transcript-rows"
import { PressableScale } from "@/components/ui/PressableScale"
import { ToolCallRow, ToolImages } from "./ToolCallRow"
import { DisclosureChevron, Reveal } from "./disclosure"

/**
 * A run of finished tool calls as one row (nikcli ToolRunGroup). The summary keeps what matters at a glance: how many
 * calls, whether any failed, and the latest render the tools produced, which stays visible while collapsed because
 * watching the model being built is the point of the CAD assistant.
 */
export const ToolRunGroup = memo(function ToolRunGroup({ rows }: { rows: readonly ToolRow[] }) {
  const { palette, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const summary = toolRunSummary(rows)
  const latestImages = rows.findLast((row) => row.images?.length)
  const domains = [...new Set(rows.map((row) => (row.rawTool ?? row.tool).split("_")[0]!.toUpperCase()))].slice(0, 3).join(" · ")
  const color = summary.failed ? palette.danger : palette.success
  return (
    <View>
      <View style={{ marginHorizontal: 16, marginVertical: 4, borderRadius: layout.cardRadius, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.ink, isDark ? 0.13 : 0.09), backgroundColor: hexToRgba(palette.ink, isDark ? 0.055 : 0.035), overflow: "hidden" }}>
        <PressableScale
          subtle
          tint
          onPress={() => { haptic("selection"); setOpen((value) => !value) }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${summary.title}${summary.failed ? `, ${summary.failed} failed` : ", all completed"}. ${open ? "Hide" : "Show"} the calls`}
          style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <View style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(color, 0.12) }}>
            <Layers size={17} color={color} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{summary.title}</Text>
            <Text numberOfLines={1} style={{ color: summary.failed ? palette.danger : palette.muted, ...typeStyle(12) }}>
              {summary.failed ? `${summary.failed} failed · ` : ""}{domains}
            </Text>
          </View>
          <DisclosureChevron open={open} color={palette.muted} />
        </PressableScale>
        {!open && latestImages?.images ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><ToolImages images={latestImages.images} tool={latestImages.tool} /></View> : null}
      </View>
      {open ? <Reveal style={{ marginLeft: 12, borderLeftWidth: 2, borderLeftColor: hexToRgba(palette.ink, 0.08) }}>
        {rows.map((row) => <ToolCallRow key={row.callId} row={row} />)}
      </Reveal> : null}
    </View>
  )
})
