import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { Stack, useFocusEffect } from "expo-router"
import { useHeaderHeight } from "expo-router/react-navigation"
import { Bot, Check, ChevronDown, CircleGauge, GitPullRequest, Plus, Route, SlidersHorizontal, Sparkles } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useResource } from "@/lib/use-resource"
import { useHostResource } from "@/hooks/use-host-resource"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { appendChatEvent, answerRequest, emptyLog, lastUserPrompt, transcriptText, type ChatRow, type LogEvent } from "@/lib/chat-log"
import { activityLabel, idleActivity, reduceTurnActivity, type TurnActivity } from "@/lib/turn-activity"
import { PlanCard, NoticeRow } from "@/components/chat/PlanCard"
import { enqueueAssistantOp } from "@/lib/offline-queue"
import { CompanionError } from "@/lib/client"
import { followSession } from "@/lib/session-stream"
import { Composer, type AssistantMode } from "@/components/chat/Composer"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { ToolCallRow } from "@/components/chat/ToolCallRow"
import { QuestionCard } from "@/components/chat/QuestionCard"
import { PermissionCard } from "@/components/chat/PermissionCard"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { contentGutter } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ListRow } from "@/components/ui/ListRow"
import { Skeleton } from "@/components/ui/Skeleton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ModelPickerSheet } from "@/components/chat/model-picker-sheet"
import { AssistantInspectorSheet } from "@/components/chat/assistant-inspector-sheet"
import { assistantModels, formatVariantLabel, resolveAssistantPreferences, PERMISSION_MODES, selectedAssistantModel, type AssistantPreferences } from "@/lib/assistant-preferences"

const QUICK_PROMPTS = [
  {
    label: "Inspect the project",
    prompt: "Inspect this CADCAMFUN project and tell me the highest-priority CAD or CAM issue to address first.",
    icon: CircleGauge,
  },
  {
    label: "Verify toolpaths",
    prompt: "Verify the project's toolpaths and explain any collision, gouge, uncut stock, or stale G-code you find.",
    icon: Route,
  },
  {
    label: "Prepare a safe change",
    prompt: "Review the project, propose one useful improvement, make it on an ai/ branch, run the relevant checks, and open a pull request for me to review.",
    icon: GitPullRequest,
  },
] as const

/**
 * The Assistant tab — a chat with the AI that manages the project through pull requests and
 * workflows, exactly like the desktop assistant, from the phone.
 *
 * - One conversation per project; the `sessionId` is remembered per project, so the phone resumes
 *   the same session the desktop is on — desktop and mobile steer the same agent.
 * - The assistant works on `ai/*` branches and opens pull requests; a person reviews and merges
 *   (surfaced in the Projects tab). The server enforces the guardrail; the UI never pretends
 *   otherwise.
 * - Streaming deltas fold into one bubble; tool calls surface as muted rows; permission requests
 *   are answered inline (unanswered, the tool call stalls until the model gives up).
 * - Stop aborts the turn server-side.
 */
export default function AssistantScreen() {
  const { client, ai, config, connectivity, refreshBootstrap } = useServer()
  const { palette } = useTheme()
  const headerHeight = useHeaderHeight()
  const content = useContentLayout()
  const { width, fontScale } = content
  const stackedContext = fontScale > 1.3 || width < 375

  const projectId = useUIStore((state) => state.assistantProjectId)
  const draft = useUIStore((state) => state.assistantDraft)
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)
  const setAssistantSession = useUIStore((state) => state.setAssistantSession)
  const clearAssistantDraft = useUIStore((state) => state.clearAssistantDraft)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const storedPreferences = useUIStore((state) => projectId ? state.assistantPreferences[projectId] : undefined)
  const assistantDefaults = useUIStore((state) => state.assistantDefaults)
  const preferences = useMemo(() => resolveAssistantPreferences(storedPreferences, assistantDefaults), [storedPreferences, assistantDefaults])
  const setPreferences = (patch: Partial<AssistantPreferences>) => { if (projectId) useUIStore.getState().setAssistantPreferences(projectId, patch) }
  const selectedAgentId = preferences.agent
  const setSelectedAgentId = (agent: string) => setPreferences({ agent })
  const [modelsOpen, setModelsOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [log, setLogState] = useState<readonly ChatRow[]>(emptyLog)
  const [activity, setActivity] = useState<TurnActivity>(idleActivity)
  const setLog = setLogState
  /** Every stream frame feeds both the transcript and the live status strip. */
  const apply = (event: LogEvent) => {
    setLogState((previous) => appendChatEvent(previous, event))
    setActivity((previous) => reduceTurnActivity(previous, event))
  }
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AssistantMode>("general")
  const [promptSeed, setPromptSeed] = useState<{ projectId: string; text: string; token: number } | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const sessionRef = useRef<string | undefined>(undefined)
  /** A prompt POST in flight; the turn itself is owned by the desktop and followed on the session stream. */
  const posting = useRef(false)
  /** Last journal sequence seen per session: a new follower resumes from it instead of replaying the conversation. */
  const cursors = useRef(new Map<string, number>())
  const [followed, setFollowed] = useState<string | undefined>()
  const [link, setLink] = useState<"idle" | "connecting" | "live" | "reconnecting">("idle")
  const [screenFocused, setScreenFocused] = useState(false)
  const [appActive, setAppActive] = useState(AppState.currentState === "active")
  const listRef = useRef<FlatList<ChatRow>>(null)
  const generation = useRef(0)
  const stopping = useRef(false)
  const logs = useRef(new Map<string, readonly ChatRow[]>())
  const logRef = useRef(log)
  logRef.current = log

  const projects = useResource(
    useCallback((signal) => (client ? client.projects(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "assistant:projects",
  )

  const agents = useHostResource(
    useCallback(() => (client ? client.agents() : undefined), [client]),
    [client],
  )

  const catalogue = useResource(useCallback((signal) => client ? client.aiProviders(signal) : Promise.reject(new Error("Not connected")), [client, connectivity]), "assistant:models")
  const availableModels = assistantModels(catalogue.data ?? [])
  const activeModel = selectedAssistantModel(availableModels, preferences.model)
  const modelUnavailable = Boolean(preferences.model && catalogue.data && !catalogue.loading && !activeModel)
  const modelLabel = activeModel?.name ?? preferences.model?.model ?? "Automatic model"
  const thinkingLabel = preferences.model?.variant ? formatVariantLabel(preferences.model.variant) : undefined
  const permissionLabel = PERMISSION_MODES.find((item) => item.id === preferences.permissionMode)?.title ?? "Standard"

  const currentProject = (projects.data ?? []).find((project) => project.id === projectId) ?? null
  const currentAgent = (agents.data ?? []).find((agent) => agent.id === selectedAgentId) ?? agents.data?.[0] ?? null

  useEffect(() => {
    generation.current += 1
    const key = `${config?.fingerprint ?? ""}|${projectId ?? ""}`
    sessionRef.current = projectId ? useUIStore.getState().assistantSessions[projectId] : undefined
    setLog(logs.current.get(key) ?? emptyLog)
    setActivity(idleActivity)
    setBusy(false)
    stopping.current = false
    // Opening a conversation follows its desktop session; leaving it only closes the stream, never the turn.
    setFollowed(sessionRef.current)
    return () => {
      logs.current.set(key, logRef.current)
      generation.current += 1
    }
  }, [projectId, client])

  useEffect(() => {
    const pending = draftRef.current
    if (pending && pending.projectId === projectId) return
    setPromptSeed(null)
  }, [projectId])

  useEffect(() => {
    if (!draft || draft.projectId !== projectId) return
    setMode(draft.mode)
    setPromptSeed({ projectId: draft.projectId, text: draft.text, token: Date.now() })
    clearAssistantDraft()
  }, [draft, projectId, clearAssistantDraft])

  /**
   * Re-reads the desktop session once (nikcli `onReconnect`): stored tool results, the final answer of a finished turn
   * and pending approvals/questions. Used when the stream cannot prove nothing was missed.
   */
  const syncSession = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    if (!client) return
    const version = generation.current
    try {
      const [state, controls] = await Promise.all([client.sessionState(sessionId, signal), client.sessionControls(sessionId, signal)])
      if (signal?.aborted || version !== generation.current || sessionRef.current !== sessionId) return
      for (const event of state.events ?? []) apply(event)
      for (const permission of controls.permissions ?? []) apply({ type: "permission_request", ...permission })
      for (const question of controls.questions) apply({ type: "question_request", sessionId, ...question })
      setBusy(state.busy)
      if (!state.busy && (state.text || state.error)) {
        apply(state.error
          ? { type: "error", sessionId, code: "provider", message: state.error }
          : { type: "done", sessionId, text: state.text, recovered: true, ...(state.usage ? { usage: state.usage } : {}) })
      }
    } catch (error) {
      if (!signal?.aborted && version === generation.current) toast(error instanceof Error ? error.message : "Could not read the desktop conversation", "error")
    }
  }, [client])

  // Focus and foreground decide whether a stream is open; the desktop turn runs regardless.
  useFocusEffect(useCallback(() => {
    setScreenFocused(true)
    return () => setScreenFocused(false)
  }, []))
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"))
    return () => subscription.remove()
  }, [])

  // The session stream: one per open conversation, like nikcli mobile's `useSessionStream`.
  useEffect(() => {
    const sessionId = followed
    if (!client || !sessionId || !screenFocused || !appActive || connectivity !== "online") { setLink("idle"); return }
    const controller = new AbortController()
    setLink("connecting")
    void followSession({
      after: cursors.current.get(sessionId),
      signal: controller.signal,
      open: (after, signal) => client.sessionStream(sessionId, after, signal),
      onConnected: (frame, reconnected) => {
        setLink("live")
        setBusy(frame.busy)
        const known = cursors.current.has(sessionId)
        if (frame.reset || !known) cursors.current.set(sessionId, frame.seq)
        // No cursor (app restarted, conversation reopened) or a gap the desktop can no longer replay: read the session.
        if (frame.reset || !known) void syncSession(sessionId, controller.signal)
        else if (reconnected) haptic("selection")
      },
      onEvent: (event, seq) => {
        cursors.current.set(sessionId, seq)
        if (sessionRef.current !== sessionId) return
        if (event.type === "turn" && event.phase === "start") setBusy(true)
        if (event.type === "permission_request") haptic("warning")
        if (event.type === "done") { haptic("success"); setBusy(false) }
        if (event.type === "error") { haptic("error"); setBusy(false) }
        apply(event as LogEvent)
      },
      onDisconnected: () => { if (!controller.signal.aborted) setLink("reconnecting") },
    }).finally(() => { if (!controller.signal.aborted) setLink("idle") })
    return () => controller.abort()
  }, [client, followed, screenFocused, appActive, connectivity, syncSession])

  const send = async (text: string) => {
    if (!client || !projectId || posting.current || stopping.current) return
    if (connectivity !== "online") {
      apply({ type: "user", text })
      await enqueueAssistantOp({ projectId, text, sessionId: sessionRef.current, agent: currentAgent?.id ?? selectedAgentId, mode, model: preferences.model, permissionMode: preferences.permissionMode, includeContext: preferences.includeContext })
      toast("Desktop offline — message queued", "info")
      haptic("selection")
      return
    }
    const version = ++generation.current
    posting.current = true
    setBusy(true)
    // A new turn starts its own meter; steering (queue) keeps the running one.
    setActivity(idleActivity)
    apply({ type: "user", text })
    try {
      // The desktop owns the turn from here; this answers as soon as the host session exists.
      const started = await client.promptSession({ projectId, message: text, ...(sessionRef.current ? { sessionId: sessionRef.current } : {}), agent: currentAgent?.id ?? selectedAgentId, mode, model: preferences.model, permissionMode: preferences.permissionMode, includeContext: preferences.includeContext })
      if (version !== generation.current) return
      sessionRef.current = started.sessionId
      setAssistantSession(projectId, started.sessionId)
      // A follower already on this session keeps its own cursor; a new one replays the turn from its first event.
      if (followed !== started.sessionId) cursors.current.set(started.sessionId, started.seq)
      setFollowed(started.sessionId)
    } catch (error) {
      if (version !== generation.current) return
      setBusy(false)
      haptic("error")
      const uncertain = error instanceof CompanionError && error.status === 0
      const message = uncertain
        ? "The desktop did not confirm this message. It was not sent again: the conversation will show whether it ran."
        : error instanceof Error ? error.message : "The assistant did not start"
      apply({ type: "error", sessionId: sessionRef.current ?? "", code: "internal", message })
      if (uncertain && sessionRef.current) void syncSession(sessionRef.current)
    } finally {
      posting.current = false
    }
  }

  const stop = () => {
    if (stopping.current) return
    haptic("selection")
    const version = generation.current
    stopping.current = true
    const sessionId = sessionRef.current
    // The session stream delivers the turn's end; only this request stops the desktop.
    const stopped = sessionId && client ? client.abortChat(sessionId) : Promise.resolve()
    void stopped.catch((error: unknown) => {
      if (version === generation.current) toast(error instanceof Error ? error.message : "Could not stop the desktop turn", "error")
    }).finally(() => {
      stopping.current = false
      if (!sessionId) setBusy(false)
    })
  }

  const queue = async (text: string) => {
    const sessionId = sessionRef.current
    const version = generation.current
    if (!client || !projectId || !sessionId || connectivity !== "online") return
    apply({ type: "user", text, queued: true })
    try {
      await client.queueChat(sessionId, text, projectId, "steer")
    } catch (error) {
      if (version !== generation.current) return
      haptic("error")
      setLog((previous) => appendChatEvent(previous, {
        type: "error",
        sessionId,
        code: "internal",
        message: error instanceof Error ? error.message : "Could not steer the desktop assistant",
      }))
    }
  }

  const replyPermission = async (requestId: string, decision: "once" | "always" | "reject") => {
    const sessionId = sessionRef.current, version = generation.current
    if (!sessionId || !client) throw new Error("Reconnect to the desktop before sending your decision.")
    try {
      await client.permissionReply(sessionId, requestId, decision)
      if (version !== generation.current) return
      haptic(decision === "reject" ? "selection" : "success")
      setLog((previous) => answerRequest(previous, requestId, decision !== "reject"))
    } catch (error) {
      if (version === generation.current) throw error
    }
  }

  const replyQuestion = async (requestId: string, answers?: string[][]) => {
    const sessionId = sessionRef.current, version = generation.current
    if (!sessionId || !client) throw new Error("Reconnect to the desktop before sending your response.")
    try {
      if (answers) await client.questionReply(sessionId, requestId, answers)
      else await client.questionReject(sessionId, requestId)
      if (version === generation.current) setLog((previous) => previous.map((row) => row.kind === "question" && row.requestId === requestId ? { ...row, answered: true } : row))
    } catch (error) {
      if (version === generation.current) throw error
    }
  }

  const selectProject = (id: string | null) => {
    haptic("selection")
    setAssistantProject(id)
    setPickerOpen(false)
  }

  const newConversation = () => {
    if (!projectId) return
    generation.current += 1
    sessionRef.current = undefined
    setFollowed(undefined)
    useUIStore.getState().startAssistantConversation(projectId)
    logs.current.delete(`${config?.fingerprint ?? ""}|${projectId}`)
    setLog(emptyLog)
    setActivity(idleActivity)
    setBusy(false)
    stopping.current = false
    haptic("selection")
  }

  const aiReady = ai?.configured ?? false

  /** Puts a previous prompt back in the composer; the user reviews it and sends it explicitly. */
  const reuse = (text: string) => {
    if (!projectId) return
    setPromptSeed({ projectId, text, token: Date.now() })
  }

  const renderRow = ({ item }: { item: ChatRow }) => {
    switch (item.kind) {
      case "user":
      case "assistant":
        return <MessageBubble row={item} onReuse={reuse} />
      case "plan":
        return <PlanCard row={item} />
      case "notice":
        return <NoticeRow row={item} />
      case "tool":
        return <ToolCallRow row={item} />
      case "request":
        return <PermissionCard key={item.requestId} row={item} onReply={replyPermission} />
      case "question":
        return <QuestionCard key={item.requestId} row={item} onReply={replyQuestion} onReject={(requestId) => replyQuestion(requestId)} />
      case "error":
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text selectable style={{ color: palette.danger, fontSize: 13, lineHeight: 18, textAlign: "center" }}>{item.message}</Text>
            {!busy && sessionRef.current ? <ActionButton label="Refresh conversation" variant="ghost" onPress={() => void syncSession(sessionRef.current!)} /> : null}
            {/* Never resent automatically: the prompt may have already changed the model on the desktop. */}
            {!busy && lastUserPrompt(log) ? <ActionButton label="Edit last message" variant="ghost" onPress={() => reuse(lastUserPrompt(log)!)} /> : null}
          </View>
        )
    }
  }

  return (
    <SafeAreaView edges={{ bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
    <Stack.Screen options={{ headerRight: () => <View style={{ flexDirection: "row", gap: 4 }}>
      <PressableScale accessibilityRole="button" accessibilityLabel="New conversation" onPress={newConversation} disabled={!projectId} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Plus size={21} color={palette.accent} /></PressableScale>
      <PressableScale accessibilityRole="button" accessibilityLabel="Assistant controls" onPress={() => setInspectorOpen(true)} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><SlidersHorizontal size={20} color={palette.accent} /></PressableScale>
    </View> }} />
    <KeyboardAvoidingView onLayout={content.onLayout} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
      {/* Project + agent context: the two things that determine where and how the turn runs. */}
      <View style={{ minHeight: 56, marginHorizontal: content.gutter, marginTop: 8, marginBottom: 8, borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: palette.surface, flexDirection: stackedContext ? "column" : "row", alignItems: "stretch", borderWidth: 0.5, borderColor: palette.border }}>
        <PressableScale
          onPress={() => { haptic("selection"); setPickerOpen(true) }}
          subtle
          tint
          accessibilityRole="button"
          accessibilityLabel={`Choose assistant project${currentProject ? `, current project: ${currentProject.name}` : ""}`}
          style={{ flex: stackedContext ? undefined : 1, minHeight: 44, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Text style={{ flexShrink: 1, color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }} numberOfLines={stackedContext ? undefined : 1}>
            {currentProject ? currentProject.name : "Choose a project"}
          </Text>
          <ChevronDown size={15} color={palette.muted} />
        </PressableScale>
        <View style={stackedContext ? { height: 0.5, marginHorizontal: 12, backgroundColor: palette.border } : { width: 0.5, marginVertical: 10, backgroundColor: palette.border }} />
        <PressableScale
          onPress={() => { haptic("selection"); setAgentPickerOpen(true) }}
          subtle
          tint
          accessibilityRole="button"
          accessibilityLabel={`Choose CADCAMFUN agent${currentAgent ? `, current agent: ${currentAgent.title}` : ""}`}
          style={{ flex: stackedContext ? undefined : 1, minHeight: 44, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Bot size={15} color={palette.accent} />
          <Text style={{ flexShrink: 1, color: palette.soft, fontSize: 13, lineHeight: 18, fontWeight: "600" }} numberOfLines={stackedContext ? undefined : 1}>
            {currentAgent?.title ?? "CAD/CAM assistant"}
          </Text>
          <ChevronDown size={14} color={palette.muted} />
        </PressableScale>
      </View>

      {/* Transcript */}
      {log.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: contentGutter(width), paddingVertical: 28, gap: 16 }}
        >
          {projects.error ? <ErrorBanner message={projects.error} actionLabel="Retry" onAction={() => void projects.reload()} /> : null}
          {!projectId ? (
            <EmptyState title="What are we working on?" description="Choose a workspace to review designs, inspect manufacturing paths or prepare your next change." icon={<Sparkles size={26} color={palette.accent} />} action={<ActionButton label="Choose a project" onPress={() => setPickerOpen(true)} />} />
          ) : (
            <View style={{ alignItems: "center", gap: 18 }}>
              <View style={{ width: 58, height: 58, borderRadius: 19, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: `${palette.accent}18` }}>
                <Sparkles size={27} color={palette.accent} strokeWidth={1.9} />
              </View>
              <View style={{ alignItems: "center", gap: 7 }}>
                <Text selectable style={{ color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.65, textAlign: "center" }}>Build with CADCAMFUN</Text>
                <Text selectable style={{ maxWidth: 340, color: palette.soft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
                  Turn an idea into a reviewed change. Your assistant works with the tools and context on your desktop.
                </Text>
                {ai?.tools?.length ? (
                  <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{ai.tools.length} desktop tools available</Text>
                ) : null}
              </View>
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                {QUICK_PROMPTS.map((item) => {
                  const Icon = item.icon
                  return (
                    <PressableScale
                      key={item.label}
                      onPress={() => void send(item.prompt)}
                      disabled={!aiReady || connectivity !== "online"}
                      subtle
                      tint
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 10 }}
                    >
                      <Icon size={18} color={palette.accent} />
                      <Text style={{ flex: 1, color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }}>{item.label}</Text>
                    </PressableScale>
                  )
                })}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          data={[...log].reverse()}
          keyExtractor={(_, index) => String(log.length - 1 - index)}
          inverted
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: Math.max(0, contentGutter(width) - 16) }}
          renderItem={renderRow}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          keyboardDismissMode="interactive"
        />
      )}

      <Composer
        key={projectId ?? "no-project"}
        busy={busy}
        disabled={!currentProject || !aiReady || connectivity !== "online" || modelUnavailable}
        disabledNote={modelUnavailable ? "Choose an available desktop model" : !currentProject ? "Choose a project to chat" : connectivity !== "online" ? "Reconnect to the desktop to chat" : ai === null ? "Checking the desktop AI configuration…" : "Add a model key on the desktop to chat"}
        modelLabel={`${modelLabel}${thinkingLabel ? ` · ${thinkingLabel}` : ""}`}
        permissionLabel={permissionLabel}
        onOpenModels={() => projectId ? setModelsOpen(true) : setPickerOpen(true)}
        onOpenControls={() => setInspectorOpen(true)}
        mode={mode}
        onModeChange={setMode}
        onSend={(text) => void send(text)}
        onQueue={(text) => void queue(text)}
        onStop={stop}
        status={link === "reconnecting" ? "Reconnecting to the desktop… the turn keeps running there" : link === "connecting" && busy ? "Connecting to the desktop…" : activityLabel(activity)}
        seed={promptSeed?.projectId === projectId ? promptSeed.text : undefined}
        seedToken={promptSeed?.projectId === projectId ? promptSeed.token : undefined}
      />

      <ModelPickerSheet open={modelsOpen} onClose={() => setModelsOpen(false)} models={availableModels} selection={preferences.model} onSelect={(model) => setPreferences({ model })} loading={catalogue.loading} error={catalogue.error} reload={() => { void catalogue.reload(); void refreshBootstrap().catch(() => undefined) }} />
      <AssistantInspectorSheet open={inspectorOpen} onClose={() => setInspectorOpen(false)} client={client} sessionId={sessionRef.current} preferences={preferences} onPreferences={setPreferences} ai={ai} onNewConversation={newConversation} transcript={transcriptText(log)} activity={activity} />

      {/* Project picker */}
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Assistant project">
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {projects.error ? <ErrorBanner message={projects.error} actionLabel="Try again" onAction={() => void projects.reload()} /> : null}
          {projects.loading && projects.data === undefined ? <View accessible accessibilityLabel="Loading assistant projects" style={{ gap: 8 }}>{[0, 1].map((key) => <Skeleton key={key} style={{ height: 76 }} />)}</View> : null}
          {(projects.data ?? []).map((project) => (
            <SurfaceCard key={project.id} inset={false}>
            <ListRow
              onPress={() => selectProject(project.id)}
              title={project.name}
              subtitle={project.description ?? undefined}
              selected={project.id === projectId}
              trailing={project.id === projectId ? <Check size={20} color={palette.accent} /> : undefined}
            />
            </SurfaceCard>
          ))}
          {!projects.loading && !projects.error && (projects.data ?? []).length === 0 ? (
            <View style={{ paddingVertical: 20 }}>
              <EmptyState  title="No projects on the desktop" />
            </View>
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet open={agentPickerOpen} onClose={() => setAgentPickerOpen(false)} title="CADCAMFUN agents">
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {(agents.data ?? []).map((agent) => {
            const selected = agent.id === (currentAgent?.id ?? selectedAgentId)
            return (
              <PressableScale
                key={agent.id}
                subtle
                tint
                onPress={() => {
                  haptic("selection")
                  setSelectedAgentId(agent.id)
                  setAgentPickerOpen(false)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 64, borderRadius: 18, borderCurve: "continuous", borderWidth: 0.5, borderColor: selected ? palette.accent : palette.border, backgroundColor: selected ? `${palette.accent}14` : palette.surface, padding: 16 }}
              >
                <View style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: selected ? `${palette.accent}1F` : palette.panel }}>
                  {agent.id === "general" ? <Sparkles size={17} color={selected ? palette.accent : palette.soft} /> : <Bot size={17} color={selected ? palette.accent : palette.soft} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
                    <Text style={{ flexShrink: 1, color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: "600" }}>{agent.title}</Text>
                    <Text style={{ color: agent.edits ? palette.warning : palette.muted, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.5 }}>{agent.edits ? "CAN EDIT" : "READ ONLY"}</Text>
                  </View>
                  <Text selectable style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }}>{agent.description}</Text>
                  {agent.tools.length > 0 ? <Text selectable style={{ color: palette.muted, fontSize: 11, lineHeight: 15 }}>{agent.tools.length} scoped tools</Text> : null}
                </View>
              </PressableScale>
            )
          })}
          {agents.loading && !agents.data ? <Text style={{ color: palette.muted, padding: 16, textAlign: "center" }}>Loading desktop agents…</Text> : null}
          {agents.error ? <ErrorBanner message={agents.error} /> : null}
          {!agents.loading && !agents.error && agents.data?.length === 0 ? <EmptyState title="No agents available" description="Configure an assistant on your desktop to make it available here." /> : null}
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
