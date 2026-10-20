import { memo, useRef, useState } from "react"
import { Text, View } from "react-native"
import { CheckCircle2, ShieldAlert } from "lucide-react-native"
import { ActionButton } from "@/components/ui/ActionButton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { mono, type as typeStyle } from "@/lib/typography"
import type { ChatRow } from "@/lib/chat-log"

type Decision = "once" | "always" | "reject"

/** Approval names its scope explicitly, with full paths visible before the user decides. */
export const PermissionCard = memo(function PermissionCard({ row, onReply }: {
  row: Extract<ChatRow, { kind: "request" }>
  onReply: (requestId: string, decision: Decision) => Promise<void>
}) {
  const { palette } = useTheme()
  const [busy, setBusy] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const reply = async (decision: Decision) => {
    if (submitting.current || row.answered) return
    submitting.current = true
    setBusy(decision)
    setError(null)
    try { await onReply(row.requestId, decision) }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record your decision. Try again.")
      haptic("error")
    } finally { submitting.current = false; setBusy(null) }
  }
  return <SurfaceCard style={{ marginHorizontal: 16, marginVertical: 8 }}>
    <View style={{ gap: layout.gap }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {row.answered ? <CheckCircle2 size={21} color={palette.success} style={{ flexShrink: 0 }} /> : <ShieldAlert size={21} color={palette.warning} style={{ flexShrink: 0 }} />}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={{ color: palette.muted, ...typeStyle(12, { weight: "600" }) }}>{row.answered ? "Decision recorded" : "Permission required"}</Text>
          <Text accessibilityRole="header" selectable style={{ color: palette.ink, ...typeStyle(17, { weight: "600" }) }}>{row.permission.replaceAll("_", " ")}</Text>
        </View>
      </View>
      {row.patterns.length ? <View style={{ gap: 8, padding: 12, borderRadius: layout.controlRadius - 4, borderCurve: "continuous", backgroundColor: palette.background }}>
        <Text style={{ color: palette.muted, ...typeStyle(12, { weight: "600" }) }}>Requested access</Text>
        {row.patterns.map((pattern, index) => <Text key={index} selectable style={{ color: palette.soft, ...mono(12) }}>{pattern}</Text>)}
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
  </SurfaceCard>
})
