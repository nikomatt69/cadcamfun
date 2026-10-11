import { useState } from "react"
import { ActivityIndicator, LayoutAnimation, ScrollView, StyleSheet, Text, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import { Box, Check, ChevronDown, ChevronRight, CircleGauge, Copy, GitPullRequest, Route, Workflow, Wrench, X, type LucideIcon } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { usePrefersReducedMotion } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import type { ChatRow } from "@/lib/chat-log"

/**
 * A muted row showing the assistant working — vcs_start_change, cad_*, cam_* tool calls. Watching
 * the assistant act is the feedback loop (Apple §13 causality: the row appears at the causal
 * moment, and the tool that changed state is the one the user reads).
 */
function toolIdentity(raw: string | undefined, label: string): { icon: LucideIcon; category: string; title: string } {
  const value = (raw ?? label).toLowerCase()
  const title = label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  if (value.startsWith("cad_")) return { icon: Box, category: "CAD", title }
  if (value.startsWith("cam_") || value.includes("toolpath") || value.includes("gcode")) return { icon: Route, category: "CAM", title }
  if (value.startsWith("vcs_") || value.includes("pull_request")) return { icon: GitPullRequest, category: "VERSION CONTROL", title }
  if (value.startsWith("actions_") || value.includes("workflow")) return { icon: Workflow, category: "ACTIONS", title }
  if (value.includes("verify") || value.includes("analy")) return { icon: CircleGauge, category: "ANALYSIS", title }
  return { icon: Wrench, category: "TOOL", title }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallRow({ row }: { row: Extract<ChatRow, { kind: "tool" }> }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const identity = toolIdentity(row.rawTool, row.tool)
  const Icon = identity.icon
  const hasDetails = row.input !== undefined || Boolean(row.output) || Boolean(row.diagnostic)
  const statusColor = row.ok === null ? palette.warning : row.ok ? palette.success : palette.danger

  const toggle = () => {
    if (!hasDetails) return
    haptic("selection")
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((value) => !value)
  }

  const copyOutput = async () => {
    if (!row.output) return
    await Clipboard.setStringAsync(row.output)
    haptic("success")
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 4,
        overflow: "hidden",
        borderRadius: 18,
        borderCurve: "continuous",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: hexToRgba(palette.ink, isDark ? 0.13 : 0.09),
        backgroundColor: hexToRgba(palette.ink, isDark ? 0.055 : 0.035),
      }}
    >
      <PressableScale
        onPress={toggle}
        disabled={!hasDetails}
        subtle
        tint
        accessibilityRole={hasDetails ? "button" : undefined}
        accessibilityState={hasDetails ? { expanded: open } : undefined}
        accessibilityLabel={`${identity.title}, ${row.ok === null ? "running" : row.ok ? "completed" : "failed"}${hasDetails ? ", tool details" : ""}`}
        style={{ minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 11, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(statusColor, 0.12) }}>
          <Icon size={17} color={statusColor} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.muted, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8 }}>{row.agent ? `${identity.category} · ${row.agent.toUpperCase()}` : identity.category}</Text>
          <Text style={{ color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: "600" }} numberOfLines={1}>{identity.title}</Text>
        </View>
        {row.ok === null ? <ActivityIndicator size="small" color={statusColor} /> : row.ok ? <Check size={16} color={statusColor} /> : <X size={16} color={statusColor} />}
        {hasDetails ? open ? <ChevronDown size={15} color={palette.muted} /> : <ChevronRight size={15} color={palette.muted} /> : null}
      </PressableScale>

      {open ? (
        <View style={{ gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hexToRgba(palette.ink, 0.09), padding: 12 }}>
          {row.diagnostic ? (
            <View style={{ gap: 4, borderRadius: 13, borderCurve: "continuous", backgroundColor: hexToRgba(row.diagnostic.severity === "error" ? palette.danger : palette.warning, 0.1), padding: 11 }}>
              <Text selectable style={{ color: row.diagnostic.severity === "error" ? palette.danger : palette.warning, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{row.diagnostic.message}</Text>
              {row.diagnostic.recovery ? <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }}>{row.diagnostic.recovery}</Text> : null}
            </View>
          ) : null}
          {row.input !== undefined ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: palette.muted, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8 }}>INPUT</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text selectable style={{ color: palette.soft, fontFamily: "Menlo", fontSize: 11, lineHeight: 17 }}>{stringify(row.input)}</Text>
              </ScrollView>
            </View>
          ) : null}
          {row.output ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8 }}>OUTPUT</Text>
                <PressableScale onPress={() => void copyOutput()} subtle accessibilityRole="button" accessibilityLabel="Copy tool output" style={{ minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 }}>
                  <Copy size={12} color={palette.muted} />
                  <Text style={{ color: palette.soft, fontSize: 11, fontWeight: "600" }}>{copied ? "Copied" : "Copy"}</Text>
                </PressableScale>
              </View>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text selectable style={{ color: row.ok === false ? palette.danger : palette.soft, fontFamily: "Menlo", fontSize: 11, lineHeight: 17 }}>{row.output}</Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
