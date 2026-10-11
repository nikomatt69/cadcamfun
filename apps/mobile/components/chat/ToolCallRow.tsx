import { ActivityIndicator, Text, View } from "react-native"
import { Check, Wrench, X } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import type { ChatRow } from "@/lib/chat-log"

/**
 * A muted row showing the assistant working — vcs_start_change, cad_*, cam_* tool calls. Watching
 * the assistant act is the feedback loop (Apple §13 causality: the row appears at the causal
 * moment, and the tool that changed state is the one the user reads).
 */
export function ToolCallRow({ row }: { row: Extract<ChatRow, { kind: "tool" }> }) {
  const { palette } = useTheme()

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 5,
        marginVertical: 1,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: palette.panel }}>
        <Wrench size={13} color={palette.muted} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>{row.agent ? `${row.agent} · ` : ""}{row.tool}</Text>
        {row.diagnostic ? <>
          <Text selectable style={{ color: row.diagnostic.severity === "error" ? palette.danger : palette.warning, fontSize: 12, lineHeight: 17 }}>{row.diagnostic.message}</Text>
          {row.diagnostic.recovery ? <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }}>{row.diagnostic.recovery}</Text> : null}
        </> : row.ok === false && row.output ? <Text selectable style={{ color: palette.danger, fontSize: 12, lineHeight: 17 }} numberOfLines={8}>{row.output}</Text> : null}
      </View>
      {row.ok === null ? (
        <ActivityIndicator size="small" color={palette.muted} />
      ) : row.ok ? (
        <Check size={15} color={palette.success} />
      ) : (
        <X size={15} color={palette.danger} />
      )}
    </View>
  )
}
