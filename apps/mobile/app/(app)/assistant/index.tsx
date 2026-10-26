import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AccessibilityInfo, ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { Stack, useFocusEffect, useRouter } from "expo-router"
import { Bot, Check, CircleGauge, CloudOff, GitPullRequest, Route, Sparkles } from "lucide-react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { appendChatEvent, answerRequest, emptyLog, lastUserPrompt, queueLastUserRow, settleOfflineRows, transcriptText, type ChatRow, type LogEvent } from "@/lib/chat-log"
import { buildTranscript, type TranscriptItem } from "@/lib/transcript-rows"
import { activityLabel, idleActivity, reduceTurnActivity, type TurnActivity } from "@/lib/turn-activity"
import { enqueueAssistantOp, queuedTextsForProject } from "@/lib/offline-queue"
import { CompanionError } from "@/lib/client"
import { isBusyRefusal } from "@/lib/assistant-outbox"
import { followSession } from "@/lib/session-stream"
import { rowsFromMessages } from "@/lib/session-history"
import { Composer, type AssistantMode } from "@/components/chat/Composer"
import { TranscriptItemView, type ErrorRecovery, type TranscriptActions } from "@/components/chat/TranscriptItemView"
import { JumpToLatestPill } from "@/components/chat/JumpToLatestPill"
import { BrandMark } from "@/components/layout/BrandMark"
import { AssistantHeader } from "@/components/chat/AssistantHeader"
import { SessionStatusLine } from "@/components/chat/SessionStatusLine"
import { ApprovalDock } from "@/components/chat/ApprovalDock"
import { AssistantSkeleton } from "@/components/chat/AssistantSkeleton"
import { dockVisible, itemIndex, pendingApprovals } from "@/lib/approval-dock"
import { isHydrating, linkNotice, startsTurn, statusLabel, turnEndAnnouncement } from "@/lib/assistant-view"
import { hexToRgba } from "@/lib/theme"
import { caps, type } from "@/lib/typography"
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
import { CameraSheet } from "@/components/chat/camera-sheet"
import { acceptAttachments, attachmentPreviews, type PendingAttachment } from "@/lib/attachments"
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
  const content = useContentLayout()
  const router = useRouter()
  const { width } = content

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
  const [cameraOpen, setCameraOpen] = useState(false)
  /** Pictures waiting to go with the next message; the desktop's assistant reads them. */
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([])
  const [log, setLogState] = useState<readonly ChatRow[]>(emptyLog)
  const [activity, setActivity] = useState<TurnActivity>(idleActivity)
  const setLog = setLogState
  /**
   * The stored past of a conversation the user opened from the list, and the cursor for the page before it.
   * The live turn appends to `log`, so the two never show the same message twice.
   */
  const [historyRows, setHistoryRows] = useState<readonly ChatRow[]>(emptyLog)
  const [olderBefore, setOlderBefore] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  /** A stored conversation is being read from the desktop; the first read has nothing to show yet. */
  const [opening, setOpening] = useState(false)
  /** The journal of the followed session is being read (first connect, reconnect gap). */
  const [syncing, setSyncing] = useState(false)
  /** A failed composer action (stop, saving a message for later), shown above the composer with Retry where it can be retried. */
  const [composerError, setComposerError] = useState<{ message: string; retry?: "stop" } | null>(null)
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
  const listRef = useRef<FlatList<TranscriptItem>>(null)
  const generation = useRef(0)
  const stopping = useRef(false)
  /** Stop was pressed while the prompt was still starting; it is applied as soon as the desktop names the session. */
  const pendingStop = useRef(false)
  const logs = useRef(new Map<string, readonly ChatRow[]>())
  const logRef = useRef(log)
  logRef.current = log
  /** The transcript belongs to one conversation: each session keeps its own rows. */
  const logKeyFor = useCallback(
    (sessionId: string | undefined) => `${config?.fingerprint ?? ""}|${projectId ?? ""}|${sessionId ?? "new"}`,
    [config?.fingerprint, projectId],
  )
  /** The key the rows on screen belong to, so a switch saves them under the right conversation. */
  const logKeyRef = useRef("")
  /** Stop was pressed and the desktop has not ended the turn yet. */
  const [stopRequested, setStopRequested] = useState(false)
  /** Transcript length when the user scrolled up to read; `null` while following the newest row. */
  const [readingFrom, setReadingFrom] = useState<number | null>(null)
  const readingRef = useRef<number | null>(null)
  const online = connectivity === "online"

  const projects = useResource(
    useCallback((signal) => (client ? client.projects(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "assistant:projects",
  )

  // A project deleted on the desktop must not stay selected on the phone: follow the fresh list, never the saved copy.
  useEffect(() => {
    if (projects.data && !projects.stale && !projects.error) useUIStore.getState().forgetMissingProjects(projects.data.map((project) => project.id))
  }, [projects.data, projects.stale, projects.error])

  // Cancelled on unmount and when the pairing changes, so another desktop's roster never lands here.
  const agents = useResource(
    useCallback((signal) => (client ? client.agents(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "assistant:agents",
  )

  const catalogue = useResource(useCallback((signal) => client ? client.aiProviders(signal) : Promise.reject(new Error("Not connected")), [client, connectivity]), "assistant:models")
  const [modelsRefreshing, setModelsRefreshing] = useState(false)
  const refreshModels = async () => {
    if (!client || modelsRefreshing) return
    setModelsRefreshing(true)
    try {
      await client.refreshModels()
      await catalogue.reload()
    } catch (error) { toast(error instanceof Error ? error.message : "Could not refresh the desktop models", "error") }
    finally { setModelsRefreshing(false) }
  }
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
    sessionRef.current = projectId ? useUIStore.getState().assistantSessions[projectId] : undefined
    const key = logKeyFor(sessionRef.current)
    // The rows on screen belong to the previous conversation until the new one takes them.
    if (logKeyRef.current) logs.current.set(logKeyRef.current, logRef.current)
    logKeyRef.current = key
    setLog(logs.current.get(key) ?? emptyLog)
    setHistoryRows(emptyLog)
    setOlderBefore(null)
    setOpening(false)
    setSyncing(false)
    setComposerError(null)
    setActivity(idleActivity)
    setBusy(false)
    stopping.current = false
    readingRef.current = null
    setReadingFrom(null)
    // Opening a conversation follows its desktop session; leaving it only closes the stream, never the turn.
    setFollowed(sessionRef.current)
    return () => {
      if (logKeyRef.current) logs.current.set(logKeyRef.current, logRef.current)
      generation.current += 1
    }
  }, [projectId, client, logKeyFor])

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

  // The outbox delivered a message written offline and the desktop opened a session for it: follow that session.
  const storedSession = useUIStore((state) => projectId ? state.assistantSessions[projectId] : undefined)
  useEffect(() => {
    if (!storedSession || storedSession === sessionRef.current || posting.current) return
    sessionRef.current = storedSession
    const key = logKeyFor(storedSession)
    if (logKeyRef.current) logs.current.set(logKeyRef.current, logRef.current)
    logKeyRef.current = key
    setLog(logs.current.get(key) ?? emptyLog)
    setHistoryRows(emptyLog)
    setOlderBefore(null)
    setFollowed(storedSession)
  }, [storedSession, logKeyFor])

  /**
   * A conversation opened from the list: its stored past comes from the desktop's own history, so the
   * phone shows what was said even when the turn finished days ago. The live turn then appends to it.
   */
  const opened = useUIStore((state) => state.assistantOpened)
  useEffect(() => {
    if (!client || !opened || opened.projectId !== projectId) return
    const sessionId = opened.sessionId
    const version = generation.current
    let cancelled = false
    setOpening(true)
    void client.sessionMessages(sessionId, null, 30).then((page) => {
      if (cancelled || version !== generation.current) return
      sessionRef.current = sessionId
      const key = logKeyFor(sessionId)
      if (logKeyRef.current) logs.current.set(logKeyRef.current, logRef.current)
      logKeyRef.current = key
      // The stored past replaces the live rows: the desktop's history already holds this conversation.
      setLog(emptyLog)
      setHistoryRows(rowsFromMessages(page.messages, sessionId))
      setOlderBefore(page.before)
      setActivity(idleActivity)
      setBusy(false)
      setFollowed(sessionId)
    }).catch((error: unknown) => {
      if (cancelled) return
      toast(error instanceof Error ? error.message : "Could not open the conversation", "error")
    }).finally(() => { if (!cancelled) setOpening(false) })
    return () => { cancelled = true; setOpening(false) }
  }, [opened, client, projectId, logKeyFor])

  /** One page further back in the stored conversation. */
  const loadOlder = useCallback(async () => {
    const sessionId = sessionRef.current
    if (!client || !sessionId || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await client.sessionMessages(sessionId, olderBefore, 30)
      const rows = rowsFromMessages(page.messages, sessionId)
      setHistoryRows((previous) => [...rows, ...previous])
      setOlderBefore(page.before)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not read the older messages", "error")
    } finally {
      setLoadingOlder(false)
    }
  }, [client, olderBefore, loadingOlder])

  // Rows written offline stop showing "waiting" once the outbox no longer holds their text.
  const queueRevision = useUIStore((state) => state.offlineQueueRevision)
  useEffect(() => {
    if (!projectId || !logRef.current.some((row) => row.kind === "user" && row.offline)) return
    let cancelled = false
    void queuedTextsForProject(projectId).then((texts) => { if (!cancelled) setLog((previous) => settleOfflineRows(previous, texts)) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [queueRevision, projectId])

  // The outbox count behind the composer's "N messages saved" pill: it follows every enqueue and delivery.
  const [savedCount, setSavedCount] = useState(0)
  useEffect(() => {
    if (!projectId) { setSavedCount(0); return }
    let cancelled = false
    void queuedTextsForProject(projectId).then((texts) => { if (!cancelled) setSavedCount(texts.length) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [queueRevision, projectId])

  useEffect(() => { if (!busy) setStopRequested(false) }, [busy])

  /**
   * Re-reads the desktop session once (nikcli `onReconnect`): stored tool results, the final answer of a finished turn
   * and pending approvals/questions. Used when the stream cannot prove nothing was missed.
   */
  const syncSession = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    if (!client) return
    const version = generation.current
    setSyncing(true)
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
    } finally {
      if (version === generation.current) setSyncing(false)
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
        if (event.type === "question_request") haptic("selection")
        if (event.type === "done") { haptic("success"); setBusy(false); AccessibilityInfo.announceForAccessibility(turnEndAnnouncement("done")) }
        if (event.type === "error") { haptic("error"); setBusy(false); AccessibilityInfo.announceForAccessibility(turnEndAnnouncement("error")) }
        apply(event as LogEvent)
      },
      onDisconnected: () => { if (!controller.signal.aborted) setLink("reconnecting") },
    }).finally(() => { if (!controller.signal.aborted) setLink("idle") })
    return () => controller.abort()
  }, [client, followed, screenFocused, appActive, connectivity, syncSession])

  const send = async (text: string) => {
    if (!client || !projectId || posting.current || stopping.current) return
    if (connectivity !== "online") {
      // A photo is a five-megabyte payload: the outbox keeps text, not pictures. The message waits here.
      if (attachments.length > 0) {
        toast("A photo needs the desktop online. The message stays here until it is back.", "info")
        reuse(text)
        return
      }
      // nikcli offline outbox: the message waits on this iPhone and is delivered once, in order, when the desktop is back.
      try {
        await enqueueAssistantOp({ projectId, text, sessionId: sessionRef.current, agent: currentAgent?.id ?? selectedAgentId, mode, model: preferences.model, permissionMode: preferences.permissionMode, includeContext: preferences.includeContext })
        apply({ type: "user", text, offline: true })
        toast("Desktop offline · message saved and sent when it reconnects", "info")
        haptic("selection")
      } catch (error) {
        haptic("error")
        setComposerError({ message: error instanceof Error ? error.message : "Could not save the message for later" })
        reuse(text)
      }
      return
    }
    const version = ++generation.current
    posting.current = true
    setComposerError(null)
    setBusy(true)
    // A new turn starts its own meter; steering (queue) keeps the running one.
    setActivity(idleActivity)
    const sent = attachments
    apply({ type: "user", text, ...(sent.length > 0 ? { attachments: sent.map((item) => item.name), previews: attachmentPreviews(sent) } : {}) })
    jumpToLatest(false)
    try {
      // The desktop owns the turn from here; this answers as soon as the host session exists.
      const started = await client.promptSession({
        projectId, message: text,
        ...(sessionRef.current ? { sessionId: sessionRef.current } : {}),
        agent: currentAgent?.id ?? selectedAgentId, mode, model: preferences.model,
        permissionMode: preferences.permissionMode, includeContext: preferences.includeContext,
        ...(sent.length > 0 ? { attachments: sent.map((item) => ({ name: item.name, mime: item.mime, data: item.data, encoding: "base64" as const })) } : {}),
      })
      if (version !== generation.current) return
      sessionRef.current = started.sessionId
      setAssistantSession(projectId, started.sessionId)
      // A follower already on this session keeps its own cursor; a new one replays the turn from its first event.
      if (followed !== started.sessionId) cursors.current.set(started.sessionId, started.seq)
      setFollowed(started.sessionId)
      // The pictures are with the desktop now; a failed send keeps them for the retry.
      if (sent.length > 0) setAttachments([])
      if (pendingStop.current) {
        // Stop was pressed while the prompt was still starting; the session exists now, so the turn can end.
        pendingStop.current = false
        void client.abortChat(started.sessionId).catch((error: unknown) => {
          setStopRequested(false)
          setComposerError({ message: error instanceof Error ? error.message : "Could not stop the desktop turn", retry: "stop" })
        })
      }
    } catch (error) {
      if (version !== generation.current) return
      pendingStop.current = false
      setStopRequested(false)
      const running = sessionRef.current
      if (isBusyRefusal(error) && running) {
        // The desktop is already running a turn here (started on the desktop, or the phone missed its start) and
        // refused this prompt before it ran. Steering it into that turn is what the user would have done seeing it.
        if (sent.length > 0) {
          // A queued message carries text only: a picture cannot be steered into a running turn.
          setBusy(false)
          haptic("error")
          reuse(text)
          toast("The desktop is busy. The photo stays with the message until the next turn.", "error")
          return
        }
        setFollowed(running)
        setLog((previous) => queueLastUserRow(previous, text))
        try {
          await client.queueChat(running, text, projectId, "steer")
          if (version === generation.current) haptic("selection")
        } catch (steerError) {
          if (version !== generation.current) return
          setBusy(false)
          haptic("error")
          apply({ type: "error", sessionId: running, code: "internal", message: steerError instanceof Error ? steerError.message : "Could not steer the desktop assistant" })
        }
        return
      }
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
    const sessionId = sessionRef.current
    setComposerError(null)
    if (!sessionId) {
      // The turn is still starting: the desktop has no session to abort yet, so the request is remembered
      // and applied the moment the session exists. Saying "stopped" now would be a lie.
      pendingStop.current = true
      setStopRequested(true)
      return
    }
    stopping.current = true
    // The session stream delivers the turn's end; only this request stops the desktop.
    const stopped = client ? client.abortChat(sessionId) : Promise.resolve({ message: "" })
    setStopRequested(true)
    void stopped.catch((error: unknown) => {
      if (version === generation.current) {
        setStopRequested(false)
        setComposerError({ message: error instanceof Error ? error.message : "Could not stop the desktop turn", retry: "stop" })
      }
    }).finally(() => {
      stopping.current = false
    })
  }

  const queue = async (text: string) => {
    const sessionId = sessionRef.current
    const version = generation.current
    if (!client || !projectId || !sessionId || connectivity !== "online") { reuse(text); return }
    apply({ type: "user", text, queued: true })
    jumpToLatest(false)
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
    setHistoryRows(emptyLog)
    setOlderBefore(null)
    setActivity(idleActivity)
    setBusy(false)
    stopping.current = false
    pendingStop.current = false
    haptic("selection")
  }

  const aiReady = ai?.configured ?? false

  /** Puts a previous prompt back in the composer; the user reviews it and sends it explicitly. */
  const reuse = (text: string) => {
    if (!projectId) return
    setPromptSeed({ projectId, text, token: Date.now() })
  }

  // Rows are memoized by id; the handlers they receive never change identity, so a streaming delta re-renders one row.
  const handlers = useRef({ reuse, replyPermission, replyQuestion, refresh: () => { if (sessionRef.current) void syncSession(sessionRef.current) } })
  handlers.current = { reuse, replyPermission, replyQuestion, refresh: () => { if (sessionRef.current) void syncSession(sessionRef.current) } }
  const actions = useMemo<TranscriptActions>(() => ({
    reuse: (text) => handlers.current.reuse(text),
    replyPermission: (requestId, decision) => handlers.current.replyPermission(requestId, decision),
    replyQuestion: (requestId, answers) => handlers.current.replyQuestion(requestId, answers),
    refresh: () => handlers.current.refresh(),
  }), [])

  // The stored past comes first, then the live turn: one conversation, oldest row first.
  const transcript = useMemo(() => buildTranscript([...historyRows, ...log]), [historyRows, log])
  const reversed = useMemo(() => [...transcript].reverse(), [transcript])
  const reversedRef = useRef(reversed)
  reversedRef.current = reversed
  const transcriptLength = useRef(0)
  transcriptLength.current = transcript.length
  const approvals = useMemo(() => pendingApprovals(transcript), [transcript])
  const dockShown = dockVisible({ busy, online, pending: approvals.length })
  const hydrating = isHydrating({ opening, followed: Boolean(followed), transcriptEmpty: transcript.length === 0, link, syncing })
  const lastErrorId = useMemo(() => transcript.findLast((item) => item.kind === "row" && item.row.kind === "error")?.id, [transcript])
  const newest = transcript[transcript.length - 1]
  const liveReasoningId = busy && newest?.kind === "row" && newest.row.kind === "reasoning" ? newest.id : undefined
  const lastPrompt = useMemo(() => lastUserPrompt(log), [log])
  const recovery = useMemo<ErrorRecovery | undefined>(() => busy ? undefined : { refresh: Boolean(followed), ...(lastPrompt ? { lastPrompt } : {}) }, [busy, followed, lastPrompt])
  // The list is inverted: the row before `index` in time is the one after it in the data.
  const renderItem = useCallback(({ item, index }: { item: TranscriptItem; index: number }) => (
    <TranscriptItemView item={item} actions={actions} live={item.id === liveReasoningId} recovery={item.id === lastErrorId ? recovery : undefined} startsTurn={startsTurn(item, reversedRef.current[index + 1])} />
  ), [actions, liveReasoningId, lastErrorId, recovery])

  // Inverted list: offset 0 is the newest row. Hysteresis keeps the pill from flickering at the threshold.
  const onTranscriptScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y
    if (offset > 160 && readingRef.current === null) {
      readingRef.current = transcriptLength.current
      setReadingFrom(transcriptLength.current)
    } else if (offset < 48 && readingRef.current !== null) {
      readingRef.current = null
      setReadingFrom(null)
    }
  }, [])
  function jumpToLatest(animated = true) {
    readingRef.current = null
    setReadingFrom(null)
    listRef.current?.scrollToOffset({ offset: 0, animated })
  }
  /** The dock's "Answer": brings the question's card to the middle of the list. */
  const showItem = useCallback((itemId: string) => {
    const index = itemIndex(reversedRef.current, itemId)
    if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true })
  }, [])
  /** Rows have no fixed height, so an unmeasured row is reached in two steps: toward it, then to it. */
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: false })
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 80)
  }, [])

  const notice = linkNotice({ online, link, busy })
  const composeReady = Boolean(currentProject) && !modelUnavailable && (online ? aiReady : true)
  const composeNote = modelUnavailable ? "Choose an available desktop model"
    : !currentProject ? "Choose a project to chat"
      : ai === null ? "Checking the desktop AI configuration…" : "Add a model key on the desktop to chat"

  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAvoidingView onLayout={content.onLayout} behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <AssistantHeader
        gutter={content.gutter}
        project={currentProject ? currentProject.name : "Choose a project"}
        detail={`${currentAgent?.title ?? "CAD/CAM assistant"} · ${modelLabel}${thinkingLabel ? ` · ${thinkingLabel}` : ""}`}
        hasProject={Boolean(projectId)}
        onChooseProject={() => setPickerOpen(true)}
        onChooseAgent={() => setAgentPickerOpen(true)}
        onHistory={() => router.push("/assistant/conversations")}
        onNew={newConversation}
      />

      {notice ? <LinkStrip gutter={content.gutter} offline={notice.tone === "offline"} text={notice.text} /> : null}

      {/* The roster could not be read: the assistant still runs, but the phone cannot show which agent it picked. */}
      {agents.error ? (
        <View style={{ paddingHorizontal: content.gutter, paddingBottom: 6 }}>
          <ErrorBanner message={`The desktop's agent list could not be read: ${agents.error}`} actionLabel="Try again" onAction={() => void agents.reload()} />
        </View>
      ) : null}

      {/* Transcript */}
      {hydrating ? (
        <AssistantSkeleton gutter={content.gutter} />
      ) : transcript.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: contentGutter(width), paddingVertical: 28, gap: 16 }}
        >
          {projects.error ? <ErrorBanner message={projects.error} actionLabel="Retry" onAction={() => void projects.reload()} /> : null}
          {!projectId ? (
            <EmptyState title="What are we working on?" description="Choose a workspace to review designs, inspect manufacturing paths or prepare your next change." icon={<Sparkles size={26} color={palette.accent} />} action={<ActionButton label="Choose a project" onPress={() => setPickerOpen(true)} />} />
          ) : (
            <View style={{ alignItems: "center", gap: 18 }}>
              <BrandMark size={56} wordmark={false} />
              <Text selectable accessibilityRole="header" style={{ color: palette.ink, textAlign: "center", ...type(24, { weight: "600" }) }}>What are we making?</Text>
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
                      accessibilityHint={aiReady && online ? "Sends this to the desktop assistant" : "Available when the desktop is online and its AI is configured"}
                      style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 10 }}
                    >
                      <Icon size={18} color={palette.accent} />
                      <Text style={{ flex: 1, color: palette.ink, ...type(15, { weight: "600" }) }}>{item.label}</Text>
                    </PressableScale>
                  )
                })}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={reversed}
            keyExtractor={(item) => item.id}
            inverted
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: Math.max(0, contentGutter(width) - 16) }}
            renderItem={renderItem}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={onScrollToIndexFailed}
            onScroll={onTranscriptScroll}
            scrollEventThrottle={64}
            // Long CAD/CAM turns hold hundreds of rows: render a screenful at a time.
            initialNumToRender={14}
            maxToRenderPerBatch={10}
            windowSize={11}
            // The list is inverted, so its footer is the top of the screen: the older half of a stored conversation.
            ListFooterComponent={olderBefore ? (
              <PressableScale
                onPress={() => void loadOlder()}
                disabled={loadingOlder}
                subtle
                tint
                accessibilityRole="button"
                accessibilityLabel="Load older messages"
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center", marginBottom: 12 }}
              >
                <Text style={{ color: palette.accent, ...type(13, { weight: "600" }) }}>{loadingOlder ? "Loading…" : "Load older messages"}</Text>
              </PressableScale>
            ) : null}
          />
          <JumpToLatestPill visible={readingFrom !== null} count={readingFrom === null ? 0 : Math.max(0, transcript.length - readingFrom)} onPress={() => jumpToLatest()} />
        </View>
      )}

      {busy && online ? (
        <View style={{ paddingHorizontal: content.gutter }}>
          <SessionStatusLine
            stopping={stopRequested}
            label={statusLabel({ stopping: stopRequested, link, activity: activityLabel(activity) })}
            onPress={() => setInspectorOpen(true)}
          />
        </View>
      ) : null}

      {dockShown ? (
        <ApprovalDock
          approvals={approvals}
          gutter={content.gutter}
          onDecide={replyPermission}
          onSkip={(requestId) => replyQuestion(requestId)}
          onShow={showItem}
        />
      ) : null}

      <Composer
        savedCount={savedCount}
        key={projectId ?? "no-project"}
        busy={busy && online}
        offline={!online}
        stopping={stopRequested}
        disabled={!composeReady}
        disabledNote={composeNote}
        modelLabel={`${modelLabel}${thinkingLabel ? ` · ${thinkingLabel}` : ""}`}
        permissionLabel={permissionLabel}
        onOpenModels={() => projectId ? setModelsOpen(true) : setPickerOpen(true)}
        onOpenControls={() => setInspectorOpen(true)}
        mode={mode}
        onModeChange={setMode}
        onSend={(text) => void send(text)}
        onQueue={(text) => void queue(text)}
        onStop={stop}
        error={composerError?.message ?? null}
        onRetryError={composerError?.retry === "stop" ? stop : undefined}
        onDismissError={() => setComposerError(null)}
        attachments={attachments}
        onAddAttachment={() => setCameraOpen(true)}
        onRemoveAttachment={(index) => setAttachments((previous) => previous.filter((_, at) => at !== index))}
        seed={promptSeed?.projectId === projectId ? promptSeed.text : undefined}
        seedToken={promptSeed?.projectId === projectId ? promptSeed.token : undefined}
      />

      <ModelPickerSheet open={modelsOpen} onClose={() => setModelsOpen(false)} models={availableModels} selection={preferences.model} onSelect={(model) => setPreferences({ model })} loading={catalogue.loading || modelsRefreshing} error={catalogue.error} reload={() => { void refreshModels() }} />
      <AssistantInspectorSheet open={inspectorOpen} onClose={() => setInspectorOpen(false)} client={client} sessionId={sessionRef.current} preferences={preferences} onPreferences={setPreferences} ai={ai} onNewConversation={newConversation} transcript={transcriptText(log)} activity={activity} />

      {/* A picture of the part on the bench: the desktop's assistant reads it like any other attachment. */}
      <CameraSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(attachment) => {
          const { accepted, refused } = acceptAttachments(attachments, [attachment])
          setAttachments(accepted)
          for (const item of refused) toast(item.reason, "error")
        }}
      />

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
                accessibilityLabel={`${agent.title}, ${agent.edits ? "can edit" : "read only"}`}
                accessibilityState={{ selected }}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 64, borderRadius: 18, borderCurve: "continuous", borderWidth: 0.5, borderColor: selected ? palette.accent : palette.border, backgroundColor: selected ? hexToRgba(palette.accent, 0.08) : palette.surface, padding: 16 }}
              >
                <View style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: selected ? hexToRgba(palette.accent, 0.12) : palette.panel }}>
                  {agent.id === "general" ? <Sparkles size={17} color={selected ? palette.accent : palette.soft} /> : <Bot size={17} color={selected ? palette.accent : palette.soft} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
                    <Text style={{ flexShrink: 1, color: palette.ink, ...type(16, { weight: "600" }) }}>{agent.title}</Text>
                    <Text style={{ color: agent.edits ? palette.warning : palette.muted, ...caps(11, { weight: "700" }) }}>{agent.edits ? "Can edit" : "Read only"}</Text>
                  </View>
                  <Text selectable style={{ color: palette.soft, ...type(13) }}>{agent.description}</Text>
                  {agent.tools.length > 0 ? <Text selectable style={{ color: palette.muted, ...type(12) }}>{agent.tools.length} scoped tools</Text> : null}
                </View>
              </PressableScale>
            )
          })}
          {agents.loading && !agents.data ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, padding: 16, textAlign: "center", ...type(15) }}>Loading desktop agents…</Text> : null}
          {agents.error ? <ErrorBanner message={agents.error} /> : null}
          {!agents.loading && !agents.error && agents.data?.length === 0 ? <EmptyState title="No agents available" description="Configure an assistant on your desktop to make it available here." /> : null}
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Layout-animation builders live at module scope: building them in render re-creates them on every re-render.
const STRIP_ENTER = FadeIn.duration(180).easing(EASE_OUT)
const STRIP_EXIT = FadeOut.duration(120).easing(EASE_OUT)

/**
 * One quiet pill under the header: the conversation is not live, and what that means for a message sent now.
 * Same language as the status pill above the composer (hairline, tinted fill, 13pt text), so the two read as one family.
 */
function LinkStrip({ text, gutter, offline = false }: { text: string; gutter: number; offline?: boolean }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const color = offline ? palette.warning : palette.muted
  // iOS has no live regions: a strip that merely appears is not read, so say it once per change.
  useEffect(() => { AccessibilityInfo.announceForAccessibility(text) }, [text])
  return (
    <Animated.View entering={reduced ? undefined : STRIP_ENTER} exiting={reduced ? undefined : STRIP_EXIT} style={{ marginHorizontal: gutter, marginBottom: 8, alignItems: "center" }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        style={{
          maxWidth: "100%",
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 14,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: offline ? hexToRgba(palette.warning, isDark ? 0.34 : 0.28) : isDark ? hexToRgba(palette.ink, 0.1) : hexToRgba(palette.border, 0.72),
          backgroundColor: offline ? hexToRgba(palette.warning, isDark ? 0.12 : 0.08) : hexToRgba(palette.ink, isDark ? 0.04 : 0.03),
        }}
      >
        {offline ? <CloudOff size={13} color={color} strokeWidth={2.2} /> : <ActivityIndicator size="small" color={color} style={{ transform: [{ scale: 0.7 }] }} />}
        <Text maxFontSizeMultiplier={1.5} style={{ flexShrink: 1, color: offline ? palette.ink : palette.soft, ...type(13, { weight: "500" }) }}>{text}</Text>
      </View>
    </Animated.View>
  )
}
