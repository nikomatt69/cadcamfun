import { useCallback, useMemo } from "react"
import { Text, View } from "react-native"
import { Stack, useRouter } from "expo-router"
import { MessageSquare } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { useTheme } from "@/lib/theme"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { Pill } from "@/components/ui/Pill"
import { EmptyState } from "@/components/ui/EmptyState"
import { relativeTime } from "@/lib/format"
import { sessionTitle } from "@/lib/session-history"
import { type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"

/**
 * The conversations of the current project, newest first.
 *
 * The phone keeps only the *last* session id per project, so without this screen a conversation that
 * started on the desktop (or before the phone was closed) could not be reopened at all. The list is the
 * desktop's own (`GET /api/ai/sessions`), which is the same conversation history the desktop shows.
 */
export default function ConversationsScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const projectId = useUIStore((state) => state.assistantProjectId)
  const currentSession = useUIStore((state) => projectId ? state.assistantSessions[projectId] : undefined)
  const setAssistantSession = useUIStore((state) => state.setAssistantSession)
  const openAssistantConversation = useUIStore((state) => state.openAssistantConversation)

  const resource = useResource(
    useCallback(
      (signal) => client && projectId
        ? client.sessions(projectId, 50, signal)
        : Promise.reject(new Error("Not connected")),
      [client, projectId],
    ),
    `assistant:conversations:${projectId ?? "none"}`,
  )

  const conversations = useMemo(
    () => [...(resource.data ?? [])].sort((a, b) => {
      const left = Date.parse(a.updatedAt ?? a.createdAt ?? "") || 0
      const right = Date.parse(b.updatedAt ?? b.createdAt ?? "") || 0
      return right - left
    }),
    [resource.data],
  )

  const open = (sessionId: string) => {
    haptic("selection")
    if (!projectId) return
    setAssistantSession(projectId, sessionId)
    openAssistantConversation(projectId, sessionId)
    router.back()
  }

  if (!projectId) {
    return (
      <>
        <Stack.Screen options={{ title: "Conversations" }} />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState title="No project selected" description="Choose a project in the Assistant tab to see its conversations." />
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: "Conversations" }} />
      <ResourceList
        resource={resource}
        keyExtractor={(item) => item.id}
        emptyTitle="No conversations yet"
        emptyDescription="Start one in the Assistant tab and it will appear here."
        emptyIcon={<MessageSquare size={25} color={palette.accent} />}
        loadingLabel="Loading conversations"
        renderItem={({ item }) => (
          <RecordCard
            title={sessionTitle(item)}
            meta={relativeTime(item.updatedAt ?? item.createdAt ?? "")}
            leading={<MessageSquare size={20} color={palette.accent} />}
            status={item.busy
              ? <Pill tone="accent">Running</Pill>
              : item.id === currentSession ? <Pill>Open</Pill> : undefined}
            accessibilityLabel={`Open conversation ${sessionTitle(item)}`}
            onPress={() => open(item.id)}
          />
        )}
        header={
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ color: palette.ink, ...type(19, { weight: "700" }) }}>Recent conversations</Text>
            <Text style={{ color: palette.soft, ...type(13) }}>
              The same conversations your desktop keeps. Open one to continue it from the phone.
            </Text>
          </View>
        }
      />
    </>
  )
}
