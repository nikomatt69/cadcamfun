import { useCallback, useEffect, useRef, useState } from "react"
import { Share, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import * as Clipboard from "expo-clipboard"
import { Ban, Copy, History, Layers, ListChecks, Plus, Share as ShareIcon, ShieldCheck, Wrench, FoldVertical, Square, type LucideIcon } from "lucide-react-native"
import type { CompanionClient, AiStatusInfo } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { PERMISSION_MODES, type AssistantPermissionMode, type AssistantPreferences } from "@/lib/assistant-preferences"
import { agentLabel, contextLine, contextUsage, goalBudget, goalTone, groupTools, permissionTone, statusLabel, taskTone, toolTitle, turnTotals } from "@/lib/assistant-inspector"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ListRow } from "@/components/ui/ListRow"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { toast } from "@/components/ui/ToastHost"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import type { TurnActivity } from "@/lib/turn-activity"
import { ChoiceRow, CollapsibleSection, DividedRows, IconBadge, InfoChip, Meter, SheetSection, SheetSummary, TILE_INSET, ToggleRow } from "./sheet-parts"

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** iOS cannot push a screen while this modal is still dismissing, so navigation waits for it. */
const AFTER_DISMISS_MS = 350

const PERMISSION_ICONS: Record<AssistantPermissionMode, LucideIcon> = { approve: ListChecks, ask: Ban, auto: ShieldCheck }

/**
 * "Assistant controls", after nikcli's SessionInspectorSheet: what the session is (state, agent, permission),
 * the context it carries, the permission presets, what the last turn cost, the desktop's tools and the
 * conversation's own actions. Changes apply to the next message; a running turn keeps its settings.
 */
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
  const router = useRouter()
  const [actionError, setActionError] = useState<string>()
  const [acting, setActing] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(pending.current), [])
  const state = useResource(useCallback(async (signal) => open && client && sessionId ? client.sessionControls(sessionId, signal) : undefined, [open, client, sessionId]), `inspector:${sessionId}`)
  const act = async (work: () => Promise<unknown>) => {
    setActing(true); setActionError(undefined)
    try { await work(); await state.reload(); haptic("success") } catch (error) { haptic("error"); setActionError(error instanceof Error ? error.message : "The desktop could not complete this action") } finally { setActing(false) }
  }
  const controls = state.data
  const context = controls?.context
  const usage = contextUsage(context?.tokens, context?.contextWindow)
  const turn = turnTotals(activity)
  const goal = controls?.goal ?? activity.goal
  const budget = goalBudget(activity.goal)
  const permission = PERMISSION_MODES.find((mode) => mode.id === preferences.permissionMode)
  const tools = ai?.tools ?? []
  const groups = groupTools(tools)
  const approvals = controls?.permissions?.length ?? 0
  const questions = controls?.questions.length ?? 0
  const after = (next: () => void) => { onClose(); clearTimeout(pending.current); pending.current = setTimeout(next, AFTER_DISMISS_MS) }
  const copy = async () => {
    try { await Clipboard.setStringAsync(transcript); haptic("success"); toast("Transcript copied", "success") } catch { haptic("error"); toast("Could not copy the transcript", "error") }
  }
  return <BottomSheet open={open} onClose={onClose} title="Assistant controls">
    <View style={{ paddingHorizontal: gutter, gap: 24 }}>
      <View style={{ gap: 12 }}>
        <SheetSummary
          eyebrow="Session"
          title={[context?.provider, context?.model].filter(Boolean).join(" / ") || (preferences.model ? preferences.model.model : "Desktop model")}
          description="Changes apply to your next message. A running turn keeps its current settings." />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {controls ? <InfoChip label={controls.busy ? "Working" : "Ready"} tone={controls.busy ? "accent" : "success"} /> : null}
          <InfoChip label={`Agent · ${agentLabel(preferences.agent)}`} />
          {permission ? <InfoChip label={permission.title} tone={permissionTone(permission.id)} /> : null}
          {approvals > 0 ? <InfoChip label={plural(approvals, "approval", "approvals")} tone="warning" /> : null}
          {questions > 0 ? <InfoChip label={plural(questions, "question", "questions")} tone="accent" /> : null}
        </View>
      </View>

      {state.error || actionError ? <ErrorBanner message={actionError ?? state.error ?? ""} actionLabel="Refresh" onAction={() => void state.reload()} /> : null}

      <SheetSection title="Context">
        <DividedRows inset={TILE_INSET}>
          <ToggleRow icon={Layers} title="Project context"
            description="Include the desktop workspace, project rules and memory in your next message"
            value={preferences.includeContext} onValueChange={(includeContext) => onPreferences({ includeContext })} />
        </DividedRows>
      </SheetSection>

      <SheetSection title="Permissions" footer="Presets decide when the assistant asks before it runs a tool on your desktop.">
        <DividedRows inset={TILE_INSET}>
          {PERMISSION_MODES.map((mode) => {
            const active = preferences.permissionMode === mode.id
            return <ChoiceRow key={mode.id} icon={PERMISSION_ICONS[mode.id]} tone={permissionTone(mode.id)}
              title={mode.title} description={mode.description} selected={active}
              onPress={() => { if (!active) onPreferences({ permissionMode: mode.id }) }} />
          })}
        </DividedRows>
      </SheetSection>

      <SheetSection title="Activity">
        {state.loading && !controls && !state.error && sessionId ? <View accessible accessibilityLabel="Loading session activity"><Skeleton style={{ height: 120 }} /></View> : <SurfaceCard>
          <View style={{ gap: 12 }}>
            {context?.contextWindow ? <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>Context window</Text>
                <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(13) }}>{usage ? `${usage.percent}%` : ""}</Text>
              </View>
              {usage ? <Meter fraction={usage.fraction} tone={usage.level === "high" ? "danger" : usage.level === "warn" ? "warning" : "accent"} label={`Context ${usage.percent} percent used`} /> : null}
              <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(13) }}>{contextLine(context.tokens, context.contextWindow)}{context.compactAt ? ` · compacts near ${Math.round((context.compactAt / context.contextWindow) * 100)}%` : ""}</Text>
            </View> : <Text style={{ color: palette.muted, ...typeStyle(13) }}>{sessionId ? "The desktop has not reported the context window yet." : "Send a message to start a conversation and see its context."}</Text>}
            {turn ? <View style={{ gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
              <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>Last turn</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <InfoChip label={`${turn.input} in`} />
                <InfoChip label={`${turn.output} out`} />
                {turn.steps > 0 ? <InfoChip label={plural(turn.steps, "step", "steps")} /> : null}
              </View>
            </View> : null}
            {goal ? <View style={{ gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>Goal</Text>
                <InfoChip label={statusLabel(goal.status)} tone={goalTone(goal.status)} />
              </View>
              <Text selectable style={{ color: palette.soft, ...typeStyle(13, { leadingScale: 1.05 }) }}>{goal.objective}</Text>
              {budget ? <Meter fraction={budget.fraction} tone={budget.level === "high" ? "danger" : budget.level === "warn" ? "warning" : "accent"} label={`Goal budget ${budget.percent} percent used`} /> : null}
            </View> : null}
            {controls?.tasks.map((task) => <View key={task.id} style={{ gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flexShrink: 1, color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{agentLabel(task.agent)}</Text>
                <InfoChip label={statusLabel(task.status)} tone={taskTone(task.status)} />
              </View>
              <Text selectable style={{ color: palette.soft, ...typeStyle(13, { leadingScale: 1.05 }) }}>{task.description}</Text>
              {task.text || task.error ? <Text selectable numberOfLines={6} style={{ color: task.error ? palette.danger : palette.muted, ...typeStyle(12) }}>{task.error ?? task.text}</Text> : null}
              {task.status === "running" || task.status === "queued" ? <ActionButton variant="secondary" small fullWidth={false} icon={<Square size={14} color={palette.ink} />} label="Stop task" disabled={acting} onPress={() => { if (client && sessionId) void act(() => client.cancelTask(sessionId, task.id)) }} /> : null}
            </View>)}
          </View>
        </SurfaceCard>}
      </SheetSection>

      <CollapsibleSection title="Agent tools" count={tools.length} defaultOpen={tools.length > 0 && tools.length <= 6}>
        {groups.length ? groups.map((group) => <SheetSection key={group.label} title={group.label}>
          <DividedRows inset={TILE_INSET}>
            {group.tools.map((tool) => <ListRow key={tool.id} leading={<IconBadge><Wrench size={16} color={palette.muted} strokeWidth={2.1} /></IconBadge>} title={toolTitle(tool.id)} subtitle={tool.description} showChevron={false} accessibilityLabel={`${toolTitle(tool.id)}. ${tool.description}`} />)}
          </DividedRows>
        </SheetSection>) : <Text style={{ color: palette.muted, paddingHorizontal: 4, ...typeStyle(13) }}>The desktop has not listed any tools.</Text>}
      </CollapsibleSection>

      <SheetSection title="Conversation">
        <DividedRows inset={TILE_INSET}>
          <ChoiceRow icon={Plus} emphasis title="New conversation" description="Start fresh on this project; the current one stays in your history"
            onPress={() => { onNewConversation(); onClose() }} />
          <ChoiceRow icon={History} title="All conversations" description="Reopen a conversation from this project"
            onPress={() => after(() => router.navigate("/assistant"))} />
          <ChoiceRow icon={FoldVertical} title="Compact conversation" description="Summarise older turns to free the context window"
            disabled={!sessionId || !client || Boolean(controls?.busy) || acting} busy={acting}
            onPress={() => { if (client && sessionId) void act(() => client.compactSession(sessionId)) }} />
          {transcript ? <ChoiceRow icon={Copy} title="Copy transcript" description="Your messages and the assistant's answers as plain text"
            onPress={() => void copy()} /> : null}
          {transcript ? <ChoiceRow icon={ShareIcon} title="Share conversation" description="Send the transcript to another app"
            onPress={() => void Share.share({ message: transcript })} /> : null}
        </DividedRows>
      </SheetSection>
    </View>
  </BottomSheet>
}
