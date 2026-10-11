import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from "react-native"
import { ChevronDown, MessageCircleQuestion, Sparkles } from "lucide-react-native"
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

  const currentProject = (projects.data ?? []).find((project) => project.id === projectId) ?? null

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
        { projectId, message: text, sessionId: sessionRef.current, mode },
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
      {/* Project context header */}
      <PressableScale onPress={() => { haptic("selection"); setPickerOpen(true) }} subtle>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: palette.border,
          }}
        >
          <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }} numberOfLines={1}>
            {currentProject ? currentProject.name : "Choose a project"}
          </Text>
          <ChevronDown size={15} color={palette.muted} />
        </View>
      </PressableScale>

      {/* Transcript */}
      {log.length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            
            title={projectId ? "Ask the assistant anything" : "Pick a project first"}
            description={
              projectId
                ? '"Make the plate 20 mm wider and regenerate the pocket" — the assistant edits on an ai/ branch and opens a pull request for you to review.'
                : "The assistant works inside one project at a time."
            }
          />
        </View>
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
    </KeyboardAvoidingView>
  )
}
