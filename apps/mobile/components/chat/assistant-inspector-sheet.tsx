import { useCallback, useState } from "react"
import { Share, StyleSheet, Switch, Text, View } from "react-native"
import { Check } from "lucide-react-native"
import type { CompanionClient, AiStatusInfo } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { PERMISSION_MODES, type AssistantPreferences } from "@/lib/assistant-preferences"
import { useTheme } from "@/lib/theme"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ListRow } from "@/components/ui/ListRow"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { Skeleton } from "@/components/ui/Skeleton"
import { DividedRows, SheetSection } from "./sheet-parts"
import { formatTokens, type TurnActivity } from "@/lib/turn-activity"

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function AssistantInspectorSheet({ open, onClose, client, sessionId, preferences, onPreferences, ai, onNewConversation, transcript, activity }: {
  open: boolean
  onClose(): void
  client: CompanionClient | null
  sessionId?: string
  preferences: AssistantPreferences
  onPreferences(patch: Partial<AssistantPreferences>): void
  ai: AiStatusInfo | null
  onNewConversation(): void
  /** Prompts and answers as plain text, for sharing. */
  transcript: string
  activity: TurnActivity
}) {
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const [actionError, setActionError] = useState<string>()
  const [acting, setActing] = useState(false)
  const state = useResource(useCallback(async (signal) => open && client && sessionId ? client.sessionControls(sessionId, signal) : undefined, [open, client, sessionId]), `inspector:${sessionId}`)
  const act = async (work: () => Promise<unknown>) => {
    setActing(true); setActionError(undefined)
    try { await work(); await state.reload() } catch (error) { setActionError(error instanceof Error ? error.message : "The desktop could not complete this action") } finally { setActing(false) }
  }
  return <BottomSheet open={open} onClose={onClose} title="Assistant controls">
    <View style={{ paddingHorizontal: gutter, gap: 20 }}>
      <SurfaceCard inset={false}>
        <ListRow title="Project context" subtitle="Include the desktop workspace, project rules and memory in your next message" trailing={<Switch value={preferences.includeContext} onValueChange={(includeContext) => onPreferences({ includeContext })} trackColor={{ true: palette.accent }} accessibilityLabel="Include project context" />} />
      </SurfaceCard>
      <SheetSection title="Permissions">
        <DividedRows>{PERMISSION_MODES.map((mode) => <ListRow key={mode.id} title={mode.title} subtitle={mode.description} selected={preferences.permissionMode === mode.id} trailing={preferences.permissionMode === mode.id ? <Check size={18} color={palette.accent} /> : undefined} onPress={() => onPreferences({ permissionMode: mode.id })} />)}</DividedRows>
        <Text selectable style={{ color: palette.muted, paddingHorizontal: 4, ...typeStyle(12) }}>Model and permission changes apply to the next message. Your running turn keeps its current settings.</Text>
      </SheetSection>
      {state.error || actionError ? <ErrorBanner message={actionError ?? state.error ?? ""} actionLabel="Refresh" onAction={() => void state.reload()} /> : null}
      {state.loading && !state.data && !state.error && sessionId ? <Skeleton style={{ height: 120 }} /> : null}
      {state.data ? <SurfaceCard>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: palette.ink, ...typeStyle(16, { weight: "700" }) }}>Session · {state.data.busy ? "Working" : "Ready"}</Text>
          <Text selectable style={{ color: palette.soft, ...typeStyle(13, { leadingScale: 1.05 }) }}>{[state.data.context.provider, state.data.context.model].filter(Boolean).join(" / ") || "Desktop model"}</Text>
          {state.data.context.contextWindow ? <Text style={{ color: palette.muted, ...typeStyle(13) }}>{Math.round(state.data.context.contextWindow / 1000)}k context window{state.data.context.tokens !== undefined ? ` · ${state.data.context.tokens.toLocaleString()} tokens used` : ""}</Text> : null}
          {state.data.goal ? <Text selectable style={{ color: palette.soft, ...typeStyle(13, { leadingScale: 1.05 }) }}>Goal · {state.data.goal.status}{"\n"}{state.data.goal.objective}</Text> : null}
          {state.data.context.contextWindow && state.data.context.tokens !== undefined ? <View accessible accessibilityLabel={`Context ${Math.round((state.data.context.tokens / state.data.context.contextWindow) * 100)} percent used`} style={{ height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: palette.panel }}>
            <View style={{ width: `${Math.min(100, (state.data.context.tokens / state.data.context.contextWindow) * 100)}%`, height: 4, backgroundColor: state.data.context.tokens / state.data.context.contextWindow > 0.85 ? palette.warning : palette.accent }} />
          </View> : null}
          {activity.inputTokens + activity.outputTokens > 0 ? <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(13) }}>Last turn · {formatTokens(activity.inputTokens)} in · {formatTokens(activity.outputTokens)} out{activity.step > 0 ? ` · ${activity.step} steps` : ""}</Text> : null}
          <Text style={{ color: palette.muted, ...typeStyle(13) }}>{plural(state.data.questions.length, "pending question", "pending questions")} · {plural(state.data.permissions?.length ?? 0, "approval", "approvals")}</Text>
          <ActionButton variant="secondary" small label="Compact conversation" disabled={state.data.busy || acting} onPress={() => { if (client && sessionId) void act(() => client.compactSession(sessionId)) }} />
          {state.data.tasks.map((task) => <View key={task.id} style={{ marginTop: 8, paddingTop: 12, gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
            <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{task.agent} · {task.status}</Text>
            <Text selectable style={{ color: palette.soft, ...typeStyle(13) }}>{task.description}</Text>
            {task.text || task.error ? <Text selectable style={{ color: task.error ? palette.danger : palette.muted, ...typeStyle(12) }}>{task.error ?? task.text}</Text> : null}
            {task.status === "running" || task.status === "queued" ? <ActionButton variant="secondary" small label="Stop task" disabled={acting} onPress={() => { if (client && sessionId) void act(() => client.cancelTask(sessionId, task.id)) }} /> : null}
          </View>)}
        </View>
      </SurfaceCard> : null}
      <SheetSection title={`Desktop tools · ${ai?.tools?.length ?? 0}`}>
        {ai?.tools?.length ? <DividedRows>{ai.tools.map((tool) => <ListRow key={tool.id} title={tool.id} subtitle={tool.description} showChevron={false} />)}</DividedRows>
          : <Text style={{ color: palette.muted, paddingHorizontal: 4, ...typeStyle(13) }}>The desktop has not listed any tools.</Text>}
      </SheetSection>
      {transcript ? <ActionButton variant="secondary" label="Share conversation" onPress={() => void Share.share({ message: transcript })} /> : null}
      <ActionButton variant="secondary" label="New conversation" onPress={() => { onNewConversation(); onClose() }} />
    </View>
  </BottomSheet>
}
