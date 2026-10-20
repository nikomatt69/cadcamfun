import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { CircleAlert, PencilLine, RefreshCw } from "lucide-react-native"
import type { TranscriptItem } from "@/lib/transcript-rows"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import { ActionButton } from "@/components/ui/ActionButton"
import { MessageBubble } from "./MessageBubble"
import { PlanCard, NoticeRow } from "./PlanCard"
import { ToolCallRow } from "./ToolCallRow"
import { ToolRunGroup } from "./ToolRunGroup"
import { ReasoningRow } from "./ReasoningRow"
import { PermissionCard } from "./PermissionCard"
import { QuestionCard } from "./QuestionCard"

/** Stable for the screen's life (the screen keeps them in a ref), so memoized rows only re-render when their row changes. */
export interface TranscriptActions {
  reuse(text: string): void
  replyPermission(requestId: string, decision: "once" | "always" | "reject"): Promise<void>
  replyQuestion(requestId: string, answers?: string[][]): Promise<void>
  refresh(): void
}

/** What an error row may offer; only the newest error gets it, and only once the turn is over. */
export interface ErrorRecovery {
  readonly refresh: boolean
  readonly lastPrompt?: string
}

export const TranscriptItemView = memo(function TranscriptItemView({ item, actions, live = false, recovery, startsTurn = false }: {
  item: TranscriptItem
  actions: TranscriptActions
  /** The newest reasoning row while the turn runs: it is still being written. */
  live?: boolean
  recovery?: ErrorRecovery
  /** A user prompt that follows something else (an answer, a tool run): a new turn starts here. */
  startsTurn?: boolean
}) {
  if (item.kind === "tools") return <ToolRunGroup rows={item.rows} />
  const row = item.row
  switch (row.kind) {
    case "user":
    case "assistant":
      return <MessageBubble row={row} onReuse={actions.reuse} startsTurn={startsTurn} />
    case "reasoning":
      return <ReasoningRow row={row} live={live} />
    case "plan":
      return <PlanCard row={row} />
    case "notice":
      return <NoticeRow row={row} />
    case "tool":
      return <ToolCallRow row={row} />
    case "request":
      return <PermissionCard row={row} onReply={actions.replyPermission} />
    case "question":
      return <QuestionCard row={row} onReply={actions.replyQuestion} onReject={(requestId) => actions.replyQuestion(requestId)} />
    case "error":
      return <ErrorRow message={row.message} recovery={recovery} actions={actions} />
  }
})

/**
 * A failed turn, said where it happened. Recovery reads the desktop session; it never resends the prompt, which may
 * already have changed the model on the desktop: "Edit last message" only puts it back in the composer.
 */
function ErrorRow({ message, recovery, actions }: { message: string; recovery?: ErrorRecovery; actions: TranscriptActions }) {
  const { palette } = useTheme()
  const lastPrompt = recovery?.lastPrompt
  return (
    <View accessibilityRole="alert" style={{ marginHorizontal: 16, marginVertical: 8, padding: 14, gap: 10, borderRadius: 16, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.danger, 0.3), backgroundColor: hexToRgba(palette.danger, 0.06) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <CircleAlert size={18} color={palette.danger} style={{ marginTop: 1 }} />
        <Text selectable style={{ flex: 1, minWidth: 0, color: palette.ink, ...typeStyle(14) }}>{message}</Text>
      </View>
      {recovery?.refresh || lastPrompt ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {recovery?.refresh ? <View style={{ flexGrow: 1 }}><ActionButton small variant="secondary" label="Refresh conversation" icon={<RefreshCw size={14} color={palette.ink} />} onPress={actions.refresh} /></View> : null}
          {lastPrompt ? <View style={{ flexGrow: 1 }}><ActionButton small variant="ghost" label="Edit last message" icon={<PencilLine size={14} color={palette.accent} />} onPress={() => actions.reuse(lastPrompt)} /></View> : null}
        </View>
      ) : null}
    </View>
  )
}
