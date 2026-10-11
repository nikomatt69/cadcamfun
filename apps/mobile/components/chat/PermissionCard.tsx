import { useRef, useState } from "react"
import { Text, View } from "react-native"
import { ShieldAlert } from "lucide-react-native"
import { ActionButton } from "@/components/ui/ActionButton"
import { useTheme } from "@/lib/theme"
import type { ChatRow } from "@/lib/chat-log"

/**
 * A `permission_request` frame, answered inline (Apple §16 — Agency: the person stays in control;
 * unanswered, the assistant's tool call stalls until the model gives up). One tap allows once,
 * `Always` stores the decision for the session, `No` rejects.
 */
export function PermissionCard({
  row,
  onReply,
}: {
  row: Extract<ChatRow, { kind: "request" }>
  onReply: (requestId: string, decision: "once" | "always" | "reject") => Promise<void>
}) {
  const { palette } = useTheme()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const reply = async (decision: "once" | "always" | "reject") => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try { await onReply(row.requestId, decision) }
    finally { submitting.current = false; setBusy(false) }
  }

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: `${palette.warning}66`,
        backgroundColor: `${palette.warning}12`,
        padding: 14,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ShieldAlert size={16} color={palette.warning} />
        <Text style={{ flex: 1, color: palette.ink, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>
          {row.permission.replaceAll("_", " ")}
        </Text>
      </View>
      {row.patterns.length > 0 ? (
        <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18, fontFamily: "Menlo" }} numberOfLines={3}>
          {row.patterns.join("  ")}
        </Text>
      ) : null}
      {row.answered ? (
        <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>Answered</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionButton label="Allow once" variant="secondary" small disabled={busy} onPress={() => void reply("once")} />
          <ActionButton label="Always" variant="secondary" small disabled={busy} onPress={() => void reply("always")} />
          <ActionButton label="No" variant="danger" small disabled={busy} onPress={() => void reply("reject")} />
        </View>
      )}
    </View>
  )
}
