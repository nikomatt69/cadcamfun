import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { RefreshControl, SectionList, Text, View, type ListRenderItemInfo } from "react-native"
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { Stack, useRouter } from "expo-router"
import { CloudOff, MessageSquare, Search } from "lucide-react-native"
import type { AiSessionSummary } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { hexToRgba, useTheme } from "@/lib/theme"
import { accountStore } from "@/lib/account"
import { usePrefersReducedMotion } from "@/lib/animation"
import { relativeTime } from "@/lib/format"
import { sessionTitle } from "@/lib/session-history"
import { SEARCH_THRESHOLD, conversationTime, filterConversations, sectionConversations } from "@/lib/conversation-list"
import { type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ActionButton } from "@/components/ui/ActionButton"
import { Skeleton } from "@/components/ui/Skeleton"
import { TextField } from "@/components/ui/TextField"
import { useContentLayout } from "@/components/layout/use-content-layout"

type Conversation = AiSessionSummary

/**
 * The conversations of the current project, newest first, after nikcli's session list: flat rows on the
 * page (a glyph, the title, one quiet meta line) under day headings, with search once there is enough to
 * search through.
 *
 * The phone keeps only the *last* session id per project, so without this screen a conversation that
 * started on the desktop (or before the phone was closed) could not be reopened at all. The list is the
 * desktop's own (`GET /api/ai/sessions`), which is the same conversation history the desktop shows.
 */
export default function ConversationsScreen() {
  const { client, config } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.account)
  const projectId = useUIStore((state) => state.assistantProjectId)
  const currentSession = useUIStore((state) => projectId ? state.assistantSessions[projectId] : undefined)
  const setAssistantSession = useUIStore((state) => state.setAssistantSession)
  const openAssistantConversation = useUIStore((state) => state.openAssistantConversation)
  const [query, setQuery] = useState("")

  const resource = useResource(
    useCallback(
      (signal) => client && projectId
        ? client.sessions(projectId, 50, signal)
        : Promise.reject(new Error("Not connected")),
      [client, projectId],
    ),
    `assistant:conversations:${projectId ?? "none"}`,
    { cacheKey: `conversations:${config?.fingerprint ?? ""}:${account?.subject ?? "local"}:${projectId ?? "none"}` },
  )

  const all = resource.data
  const searchable = (all?.length ?? 0) >= SEARCH_THRESHOLD || query.length > 0
  const sections = useMemo(
    () => sectionConversations(filterConversations(all ?? [], query, (item) => sessionTitle(item))),
    [all, query],
  )
  const initialLoading = resource.loading && all === undefined
  const failed = resource.error !== undefined && (all === undefined || all.length === 0)

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
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: gutter }}>
          <EmptyState title="No project selected" description="Choose a project in the Assistant tab to see its conversations." icon={<MessageSquare size={25} color={palette.accent} />} />
        </View>
      </>
    )
  }

  const empty = initialLoading ? <ConversationSkeleton />
    : failed ? (
      <EmptyState title="Could not load conversations" description={resource.error ?? "The desktop did not answer."} icon={<CloudOff size={25} color={palette.danger} />}
        action={<ActionButton variant="secondary" label="Try again" loading={resource.loading} onPress={() => void resource.reload()} />} />
    ) : query.trim() ? (
      <EmptyState title="No matches" description={`No conversation has “${query.trim()}” in its title.`} icon={<Search size={25} color={palette.muted} />}
        action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
    ) : (
      <EmptyState title="No conversations yet" description="Start one in the Assistant tab and it will appear here." icon={<MessageSquare size={25} color={palette.accent} />}
        action={<ActionButton label="Back to the assistant" onPress={() => router.back()} />} />
    )

  return (
    <>
      <Stack.Screen options={{ title: "Conversations" }} />
      <SectionList<Conversation, { title: string; data: Conversation[] }>
        onLayout={onLayout}
        sections={sections}
        keyExtractor={(item) => item.id}
        extraData={currentSession}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={resource.loading && all !== undefined} onRefresh={() => void resource.reload()} tintColor={palette.accent} />}
        ListHeaderComponent={searchable || (resource.error && !failed) || resource.stale ? (
          <View style={{ gap: 12, paddingBottom: 4 }}>
            {searchable ? <TextField value={query} onChangeText={setQuery} placeholder="Search conversations" autoCapitalize="none" autoCorrect={false} returnKeyType="search" /> : null}
            {resource.error && !failed ? <ErrorBanner message={resource.stale ? "The desktop is out of reach. Showing the copy saved on this phone." : resource.error} actionLabel="Try again" onAction={() => void resource.reload()} /> : null}
          </View>
        ) : null}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={{ color: palette.muted, paddingTop: 16, paddingBottom: 8, ...type(15, { weight: "500" }) }}>{section.title}</Text>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 32, backgroundColor: hexToRgba(palette.ink, 0.06) }} />}
        renderItem={({ item }: ListRenderItemInfo<Conversation>) => (
          <ConversationRow item={item} current={item.id === currentSession} wrap={fontScale > 1.3} onPress={() => open(item.id)} />
        )}
      />
    </>
  )
}

/** One conversation: glyph, title and a meta line ("Running · 3m ago"). Flat on the page, like nikcli's session rows. */
function ConversationRow({ item, current, wrap, onPress }: { item: Conversation; current: boolean; wrap: boolean; onPress: () => void }) {
  const { palette } = useTheme()
  const title = sessionTitle(item)
  const time = conversationTime(item) > 0 ? relativeTime(item.updatedAt ?? item.createdAt ?? "") : undefined
  const state = item.busy ? "Running" : current ? "Open" : undefined
  const meta = [state, time].filter(Boolean).join(" · ")
  return (
    <PressableScale
      onPress={onPress}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={`${title}${meta ? `. ${meta}` : ""}`}
      accessibilityHint="Opens this conversation"
      accessibilityState={{ selected: current }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 12, borderCurve: "continuous" }}
    >
      <View style={{ width: 16, alignItems: "center", marginTop: 3 }}>
        <Glyph busy={item.busy} current={current} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...type(17, { weight: "600" }) }} numberOfLines={wrap ? undefined : 1}>{title}</Text>
        {meta ? <Text style={{ color: item.busy ? palette.accentStrong : palette.muted, ...type(13) }} numberOfLines={wrap ? undefined : 1}>{meta}</Text> : null}
      </View>
    </PressableScale>
  )
}

/** A ring with one open quadrant, turning, while the conversation works; a filled dot for the open one; a quiet ring otherwise. */
function Glyph({ busy, current }: { busy: boolean; current: boolean }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const turn = useSharedValue(0)
  useEffect(() => {
    if (!busy || reduced) { cancelAnimation(turn); turn.set(0); return }
    turn.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false))
    return () => cancelAnimation(turn)
  }, [busy, reduced, turn])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }))
  if (busy) return <Animated.View style={[{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.8, borderColor: palette.accent, borderTopColor: "transparent" }, spin]} />
  if (current) return <View style={{ width: 10, height: 10, marginTop: 2, borderRadius: 5, backgroundColor: palette.accent }} />
  return <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 1.6, borderColor: hexToRgba(palette.ink, 0.35) }} />
}

/** Row-shaped placeholders: glyph slot, a title and a meta line. */
function ConversationSkeleton() {
  const { palette } = useTheme()
  return (
    <View accessible accessibilityLabel="Loading conversations">
      {[0, 1, 2, 3, 4].map((key) => (
        <View key={key}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4 }}>
            <View style={{ width: 16, alignItems: "center", marginTop: 3 }}><Skeleton style={{ width: 8, height: 8, borderRadius: 4 }} /></View>
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 17, width: `${70 - key * 6}%`, borderRadius: 6 }} />
              <Skeleton style={{ height: 13, width: "38%", borderRadius: 6 }} />
            </View>
          </View>
          {key < 4 ? <View style={{ height: 1, marginLeft: 32, backgroundColor: hexToRgba(palette.ink, 0.06) }} /> : null}
        </View>
      ))}
    </View>
  )
}
