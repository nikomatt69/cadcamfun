import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native"
import { Bot, ChevronDown, CircleGauge, GitPullRequest, Route, Sparkles } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { appendChatEvent, answerRequest, emptyLog, type ChatRow } from "@/lib/chat-log"
import { CompanionError } from "@/lib/client"
import { Composer, type AssistantMode } from "@/components/chat/Composer"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { ToolCallRow } from "@/components/chat/ToolCallRow"
import { QuestionCard } from "@/components/chat/QuestionCard"
import { PermissionCard } from "@/components/chat/PermissionCard"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"

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
  const { client, ai, config, connectivity } = useServer()
  const { palette } = useTheme()

  const projectId = useUIStore((state) => state.assistantProjectId)
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)
  const setAssistantSession = useUIStore((state) => state.setAssistantSession)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState("cadcam")
  const [log, setLog] = useState<readonly ChatRow[]>(emptyLog)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AssistantMode>("general")

  const sessionRef = useRef<string | undefined>(undefined)
  const runningRef = useRef<AbortController | null>(null)
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

  const agents = useResource(
    useCallback((signal) => (client ? client.agents(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "assistant:agents",
  )

  const currentProject = (projects.data ?? []).find((project) => project.id === projectId) ?? null
  const currentAgent = (agents.data ?? []).find((agent) => agent.id === selectedAgentId) ?? agents.data?.[0] ?? null

  useEffect(() => {
    generation.current += 1
    const key = `${config?.baseUrl ?? ""}|${config?.fingerprint ?? ""}|${projectId ?? ""}`
    sessionRef.current = projectId ? useUIStore.getState().assistantSessions[projectId] : undefined
    setLog(logs.current.get(key) ?? emptyLog)
    setBusy(false)
    stopping.current = false
    return () => {
      logs.current.set(key, logRef.current)
      generation.current += 1
      if (runningRef.current) {
        runningRef.current.abort()
        runningRef.current = null
        if (sessionRef.current && client) void client.abortChat(sessionRef.current).catch(() => undefined)
      }
    }
  }, [projectId, client])

  const send = async (text: string) => {
    if (!client || !projectId || runningRef.current || stopping.current || connectivity !== "online") return
    const version = ++generation.current
    sessionRef.current ??= `s-mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    setAssistantSession(projectId, sessionRef.current)
    const controller = new AbortController()
    runningRef.current = controller
    setBusy(true)
    setLog((previous) => appendChatEvent(previous, { type: "user", text }))
    let unconfirmed = false

    try {
      for await (const event of client.chat(
        { projectId, message: text, sessionId: sessionRef.current, agent: currentAgent?.id ?? selectedAgentId, mode },
        controller.signal,
      )) {
        if (controller.signal.aborted || version !== generation.current) break
        if ("sessionId" in event && typeof event.sessionId === "string" && event.sessionId) {
          sessionRef.current = event.sessionId
          setAssistantSession(projectId, event.sessionId)
        }
        if (event.type === "permission_request") haptic("warning")
        if (event.type === "done") haptic("success")
        if (event.type === "error") haptic("error")
        setLog((previous) => appendChatEvent(previous, event))
      }
    } catch (error) {
      if (version !== generation.current) return
      if (controller.signal.aborted) {
        haptic("selection")
      } else {
        let failure = error
        if (error instanceof CompanionError && error.status === 0 && sessionRef.current) {
          unconfirmed = true
          try {
            // Reconnect through stored evidence; never replay the user's geometry/CAM mutation.
            for (let attempt = 0; attempt < 60; attempt += 1) {
              const state = await client.sessionState(sessionRef.current, controller.signal)
              if (controller.signal.aborted || version !== generation.current) return
              setLog((previous) => (state.events ?? []).reduce((rows, event) => event.type === "tool_call" && rows.some((row) => row.kind === "tool" && row.callId === event.callId) ? rows : appendChatEvent(rows, event), previous))
              if (!state.busy) {
                unconfirmed = false
                if (state.error) throw new Error(state.error)
                setLog((previous) => appendChatEvent(previous, { type: "done", sessionId: sessionRef.current!, text: state.text, recovered: true, ...(state.usage ? { usage: state.usage } : {}) }))
                haptic("success")
                return
              }
              await new Promise<void>((resolve) => {
                const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve() }
                const timer = setTimeout(finish, 2_000)
                controller.signal.addEventListener("abort", finish, { once: true })
                if (controller.signal.aborted) finish()
              })
              if (controller.signal.aborted || version !== generation.current) return
            }
            throw new Error("The desktop is still working. Reconnect before starting another turn.")
          } catch (cause) { failure = cause }
        }
        if (controller.signal.aborted || version !== generation.current) return
        haptic("error")
        const message = failure instanceof Error ? failure.message : "The assistant did not answer"
        setLog((previous) => appendChatEvent(previous, { type: "error", sessionId: sessionRef.current ?? "", code: "internal", message }))
      }
    } finally {
      if (version === generation.current) { setBusy(unconfirmed); if (!unconfirmed) runningRef.current = null }
    }
  }

  const stop = () => {
    if (stopping.current) return
    haptic("selection")
    const version = ++generation.current
    runningRef.current?.abort()
    runningRef.current = null
    stopping.current = true
    const sessionId = sessionRef.current
    const stopped = sessionId && client ? client.abortChat(sessionId) : Promise.resolve()
    void stopped.catch((error: unknown) => {
      if (version === generation.current) toast(error instanceof Error ? error.message : "Could not stop the desktop turn", "error")
    }).finally(() => {
      if (version === generation.current) { stopping.current = false; setBusy(false) }
    })
  }

  const queue = async (text: string) => {
    const sessionId = sessionRef.current
    const version = generation.current
    if (!client || !projectId || !sessionId || connectivity !== "online") return
    setLog((previous) => appendChatEvent(previous, { type: "user", text }))
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
    if (!sessionId || !client) return
    try {
      await client.permissionReply(sessionId, requestId, decision)
      if (version !== generation.current) return
      haptic(decision === "reject" ? "selection" : "success")
      setLog((previous) => answerRequest(previous, requestId, decision !== "reject"))
    } catch (error) {
      if (version === generation.current) toast(error instanceof Error ? error.message : "Could not answer the permission request", "error")
    }
  }

  const replyQuestion = async (requestId: string, answers?: string[][]) => {
    const sessionId = sessionRef.current, version = generation.current
    if (!sessionId || !client) return
    try {
      if (answers) await client.questionReply(sessionId, requestId, answers)
      else await client.questionReject(sessionId, requestId)
      if (version === generation.current) setLog((previous) => previous.map((row) => row.kind === "question" && row.requestId === requestId ? { ...row, answered: true } : row))
    } catch (error) {
      if (version === generation.current) toast(error instanceof Error ? error.message : "Could not answer the question", "error")
      throw error
    }
  }

  const selectProject = (id: string | null) => {
    haptic("selection")
    setAssistantProject(id)
    setPickerOpen(false)
  }

  const aiReady = ai?.configured ?? false

  const renderRow = ({ item }: { item: ChatRow }) => {
    switch (item.kind) {
      case "user":
      case "assistant":
        return <MessageBubble row={item} />
      case "tool":
        return <ToolCallRow row={item} />
      case "request":
        return <PermissionCard row={item} onReply={replyPermission} />
      case "question":
        return <QuestionCard row={item} onReply={replyQuestion} onReject={(requestId) => replyQuestion(requestId)} />
      case "error":
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: palette.danger, fontSize: 13, lineHeight: 18, textAlign: "center" }}>{item.message}</Text>
          </View>
        )
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: palette.background }}>
      {/* Project + agent context: the two things that determine where and how the turn runs. */}
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "stretch", borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
        <PressableScale
          onPress={() => { haptic("selection"); setPickerOpen(true) }}
          subtle
          tint
          accessibilityRole="button"
          accessibilityLabel="Choose assistant project"
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ flexShrink: 1, color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }} numberOfLines={1}>
            {currentProject ? currentProject.name : "Choose a project"}
          </Text>
          <ChevronDown size={15} color={palette.muted} />
        </PressableScale>
        <View style={{ width: 0.5, marginVertical: 10, backgroundColor: palette.border }} />
        <PressableScale
          onPress={() => { haptic("selection"); setAgentPickerOpen(true) }}
          subtle
          tint
          accessibilityRole="button"
          accessibilityLabel="Choose CADCAMFUN agent"
          style={{ maxWidth: "44%", minWidth: 128, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Bot size={15} color={palette.accent} />
          <Text style={{ flexShrink: 1, color: palette.soft, fontSize: 13, lineHeight: 18, fontWeight: "600" }} numberOfLines={1}>
            {currentAgent?.title ?? "CAD/CAM assistant"}
          </Text>
          <ChevronDown size={14} color={palette.muted} />
        </PressableScale>
      </View>

      {/* Transcript */}
      {log.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 28 }}
        >
          {!projectId ? (
            <EmptyState title="Pick a project first" description="The assistant works inside one CADCAMFUN project at a time." />
          ) : (
            <View style={{ alignItems: "center", gap: 18 }}>
              <View style={{ width: 58, height: 58, borderRadius: 19, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: `${palette.accent}18` }}>
                <Sparkles size={27} color={palette.accent} strokeWidth={1.9} />
              </View>
              <View style={{ alignItems: "center", gap: 7 }}>
                <Text selectable style={{ color: palette.ink, fontSize: 26, lineHeight: 31, fontWeight: "700", letterSpacing: -0.55 }}>Build with CADCAMFUN</Text>
                <Text selectable style={{ maxWidth: 340, color: palette.soft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
                  The same desktop agent, CAD/CAM tools, pull requests, and Actions—controlled from your iPhone.
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
          contentInsetAdjustmentBehavior="automatic"
          renderItem={renderRow}
          onContentSizeChange={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })}
          keyboardDismissMode="interactive"
        />
      )}

      <Composer
        key={projectId ?? "no-project"}
        busy={busy}
        disabled={!currentProject || !aiReady || connectivity !== "online"}
        disabledNote={!currentProject ? "Choose a project to chat" : connectivity !== "online" ? "Reconnect to the desktop to chat" : ai === null ? "Checking the desktop AI configuration…" : "Add a model key on the desktop to chat"}
        mode={mode}
        onModeChange={(next) => {
          haptic("selection")
          setMode(next)
        }}
        onSend={(text) => void send(text)}
        onQueue={(text) => void queue(text)}
        onStop={stop}
      />

      {/* Project picker */}
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Assistant project">
        <View style={{ paddingHorizontal: 12, gap: 2 }}>
          {(projects.data ?? []).map((project) => (
            <PressableScale
              key={project.id}
              subtle
              onPress={() => selectProject(project.id)}
              style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "500" }} numberOfLines={1}>
                {project.name}
              </Text>
              {project.description ? (
                <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
                  {project.description}
                </Text>
              ) : null}
            </PressableScale>
          ))}
          {(projects.data ?? []).length === 0 ? (
            <View style={{ paddingVertical: 20 }}>
              <EmptyState  title="No projects on the desktop" />
            </View>
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet open={agentPickerOpen} onClose={() => setAgentPickerOpen(false)} title="CADCAMFUN agents">
        <View style={{ paddingHorizontal: 12, gap: 4 }}>
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
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, borderCurve: "continuous", backgroundColor: selected ? `${palette.accent}14` : "transparent", paddingHorizontal: 12, paddingVertical: 12 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: selected ? `${palette.accent}1F` : palette.panel }}>
                  {agent.id === "cadcam" ? <Sparkles size={17} color={selected ? palette.accent : palette.soft} /> : <Bot size={17} color={selected ? palette.accent : palette.soft} />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <Text style={{ flexShrink: 1, color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "600" }}>{agent.title}</Text>
                    <Text style={{ color: agent.edits ? palette.warning : palette.muted, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.5 }}>{agent.edits ? "CAN EDIT" : "READ ONLY"}</Text>
                  </View>
                  <Text selectable style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }}>{agent.description}</Text>
                  {agent.tools.length > 0 ? <Text selectable style={{ color: palette.muted, fontSize: 11, lineHeight: 15 }}>{agent.tools.length} scoped tools</Text> : null}
                </View>
              </PressableScale>
            )
          })}
          {agents.loading && !agents.data ? <Text style={{ color: palette.muted, padding: 16, textAlign: "center" }}>Loading desktop agents…</Text> : null}
          {agents.error ? <Text selectable style={{ color: palette.danger, padding: 16, textAlign: "center" }}>{agents.error}</Text> : null}
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
  )
}
