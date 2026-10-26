import { memo, useRef, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { Check } from "lucide-react-native"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Pill } from "@/components/ui/Pill"
import { hexToRgba, useTheme } from "@/lib/theme"
import { permissionIcon } from "@/lib/tool-identity"
import { TOOL_ICONS } from "./ToolCallRow"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { mono, type as typeStyle } from "@/lib/typography"
import type { ChatRow } from "@/lib/chat-log"

type Decision = "once" | "always" | "reject"

/**
 * Approval names its scope explicitly, with full paths visible before the user decides. After nikcli's PermissionCard:
 * a warning-edged card, a tile with the glyph of what is asked for (a CAD tool, the shell, a file), the scope as chips
 * and the requested patterns in a scrollable block. Once answered it settles into a quiet "Decision recorded".
 */
export const PermissionCard = memo(function PermissionCard({ row, onReply }: {
  row: Extract<ChatRow, { kind: "request" }>
  onReply: (requestId: string, decision: Decision) => Promise<void>
}) {
  const { palette, isDark } = useTheme()
  const [busy, setBusy] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const reply = async (decision: Decision) => {
    if (submitting.current || row.answered) return
    submitting.current = true
    setBusy(decision)
    setError(null)
    try { await onReply(row.requestId, decision); haptic(decision === "reject" ? "selection" : "success") }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record your decision. Try again.")
      haptic("error")
    } finally { submitting.current = false; setBusy(null) }
  }
  const Icon = row.answered ? Check : TOOL_ICONS[permissionIcon(row.permission)]
  const tone = row.answered ? palette.success : palette.accent
  const name = row.permission.replaceAll("_", " ")
  return <View
    accessibilityLiveRegion={row.answered ? undefined : "polite"}
    style={{ marginHorizontal: 16, marginVertical: 8, padding: 16, gap: layout.gap, overflow: "hidden", borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: row.answered ? palette.border : hexToRgba(palette.warning, isDark ? 0.35 : 0.3), backgroundColor: isDark ? palette.panel : palette.surface }}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 12, borderCurve: "continuous", borderWidth: 1, borderColor: hexToRgba(tone, 0.2), backgroundColor: hexToRgba(tone, 0.1) }}>
        <Icon size={18} color={tone} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: row.answered ? palette.success : palette.muted, ...typeStyle(12, { weight: "600" }) }}>{row.answered ? "Decision recorded" : "Permission required"}</Text>
        <Text accessibilityRole="header" selectable style={{ color: palette.ink, ...typeStyle(16, { weight: "600" }) }}>{name || "Unknown permission"}</Text>
      </View>
    </View>
    {row.patterns.length ? <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pill>{`${row.patterns.length} pattern${row.patterns.length === 1 ? "" : "s"}`}</Pill>
      </View>
      <View style={{ gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: hexToRgba(palette.background, 0.8) }}>
        <Text style={{ color: palette.muted, ...typeStyle(12, { weight: "500" }) }}>Requested access</Text>
        {row.patterns.map((pattern, index) => (
          <ScrollView key={index} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ alignSelf: "flex-start" }}>
            <Text selectable style={{ color: palette.soft, ...mono(12) }}>{pattern || "*"}</Text>
          </ScrollView>
        ))}
      </View>
    </View> : null}
    {!row.answered ? <>
      <Text style={{ color: palette.soft, ...typeStyle(14) }}>Allow this action once, allow matching actions for this session, or deny access.</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ gap: 8 }}>
        <ActionButton label="Allow once" disabled={busy !== null} loading={busy === "once"} onPress={() => void reply("once")} />
        <ActionButton label="Allow for this session" variant="secondary" disabled={busy !== null} loading={busy === "always"} onPress={() => void reply("always")} />
        <ActionButton label="Deny access" variant="danger" disabled={busy !== null} loading={busy === "reject"} onPress={() => void reply("reject")} />
      </View>
    </> : null}
  </View>
})
