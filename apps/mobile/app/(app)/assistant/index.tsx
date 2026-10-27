import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { KeyboardAvoidingView, Platform, RefreshControl, SectionList, Text, View, type ListRenderItemInfo } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { Stack, useRouter } from "expo-router"
import { ArrowRight, Check, CloudOff, FolderOpen, Funnel, MessageSquare, Search, Square } from "lucide-react-native"
import type { AiSessionSummary } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { hexToRgba, useTheme } from "@/lib/theme"
import { accountStore } from "@/lib/account"
import { usePrefersReducedMotion } from "@/lib/animation"
import { relativeTime } from "@/lib/format"
import { sessionTitle } from "@/lib/session-history"
import { CONVERSATION_FILTERS, conversationTime, filterConversations, matchesConversationFilter, sectionConversations, type ConversationFilter } from "@/lib/conversation-list"
import { type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ActionButton } from "@/components/ui/ActionButton"
import { Skeleton } from "@/components/ui/Skeleton"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { ListRow } from "@/components/ui/ListRow"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { SearchDock } from "@/components/ui/SearchDock"
import { toast } from "@/components/ui/ToastHost"
import { CenteredScreenHeader } from "@/components/layout/CenteredScreenHeader"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { DividedRows } from "@/components/chat/sheet-parts"
import { ProjectPickerSheet } from "@/components/chat/project-picker-sheet"

type Conversation = AiSessionSummary

/** iOS cannot present a modal over one that is still dismissing; the next one waits for it. */
const AFTER_DISMISS_MS = 350

/**
 * The Assistant tab's home: the conversations of the current project, laid out like nikcli's sessions index —
 * a centred header with the project on the left and a filter on the right, flat rows under day headings, and
 * one dock at the foot (a glass search field beside the primary action, "New"). A conversation opens as its
 * own pushed page (`chat`), without the tab bar.
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
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)
  const [pickerOpen, setPickerOpen] = useState(false)
  const projects = useResource(
    useCallback((signal) => (client ? client.projects(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "assistant:projects",
  )
  const projectName = (projects.data ?? []).find((project) => project.id === projectId)?.name
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ConversationFilter>("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [actionsFor, setActionsFor] = useState<Conversation | null>(null)

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
  const sections = useMemo(() => {
    const now = Date.now()
    const kept = (all ?? []).filter((item) => matchesConversationFilter(item, filter, now))
    return sectionConversations(filterConversations(kept, query, (item) => sessionTitle(item)), now)
  }, [all, filter, query])
  const initialLoading = resource.loading && all === undefined
  const failed = resource.error !== undefined && (all === undefined || all.length === 0)

  const open = (sessionId: string) => {
    haptic("selection")
    if (!projectId) return
    setAssistantSession(projectId, sessionId)
    openAssistantConversation(projectId, sessionId)
    router.push("/assistant/chat")
  }

  const startNew = () => {
    if (!projectId) return
    haptic("selection")
    openAssistantConversation(projectId, null)
    router.push("/assistant/chat")
  }

  /** Stops a running conversation on the desktop without opening it. */
  const stop = (item: Conversation) => {
    if (!client) return
    setActionsFor(null)
    void client.abortChat(item.id).then(() => { haptic("success"); void resource.reload() }).catch((error: unknown) => {
      toast(error instanceof Error ? error.message : "Could not stop the conversation", "error")
    })
  }

  const header = (
    <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 4 }}>
      <CenteredScreenHeader
        title="Conversations"
        {...(projectName ? { subtitle: projectName } : {})}
        left={
          <IconCircleButton accessibilityLabel={projectName ? `Project: ${projectName}` : "Choose a project"} accessibilityHint="Choose the project the assistant works in" onPress={() => { haptic("selection"); setPickerOpen(true) }}>
            <FolderOpen size={19} color={palette.ink} strokeWidth={2.1} />
          </IconCircleButton>
        }
        right={projectId ? (
          <IconCircleButton
            tone="warm"
            accessibilityLabel={filter === "all" ? "Filter conversations" : `Filter conversations, ${CONVERSATION_FILTERS.find((item) => item.id === filter)?.label}`}
            accessibilityHint="Shows running conversations or this week's"
            onPress={() => { haptic("selection"); setFilterOpen(true) }}
          >
            <Funnel size={18} color={palette.ink} strokeWidth={2.2} fill={filter === "all" ? "none" : palette.ink} />
          </IconCircleButton>
        ) : undefined}
      />
    </View>
  )

  const picker = (
    <ProjectPickerSheet
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      projects={projects}
      selectedId={projectId}
      onSelect={(id) => { haptic("selection"); setAssistantProject(id); setPickerOpen(false) }}
    />
  )

  if (!projectId) {
    return (
      <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: gutter }}>
          <EmptyState title="No project selected" description="Choose the project the assistant works in to see its conversations." icon={<MessageSquare size={25} color={palette.accent} />} action={<ActionButton label="Choose a project" onPress={() => { haptic("selection"); setPickerOpen(true) }} />} />
        </View>
        {picker}
      </SafeAreaView>
    )
  }

  const empty = initialLoading ? <ConversationSkeleton />
    : failed ? (
      <EmptyState title="Could not load conversations" description={resource.error ?? "The desktop did not answer."} icon={<CloudOff size={25} color={palette.danger} />}
        action={<ActionButton variant="secondary" label="Try again" loading={resource.loading} onPress={() => void resource.reload()} />} />
    ) : query.trim() ? (
      <EmptyState title="No matches" description={`No conversation has “${query.trim()}” in its title.`} icon={<Search size={25} color={palette.muted} />}
        action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
    ) : filter !== "all" ? (
      <EmptyState title={`No ${CONVERSATION_FILTERS.find((item) => item.id === filter)?.label.toLowerCase() ?? "matching conversations"}`} description="Try another filter, or show everything in this project."
        action={<ActionButton variant="secondary" label="Show all" onPress={() => { haptic("selection"); setFilter("all") }} />} />
    ) : (
      <EmptyState title="No conversations yet" description="Ask the assistant about this project and the conversation will appear here." icon={<MessageSquare size={25} color={palette.accent} />}
        action={<ActionButton label="Start a conversation" onPress={startNew} />} />
    )

  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {header}
        <SectionList<Conversation, { title: string; data: Conversation[] }>
          onLayout={onLayout}
          style={{ flex: 1 }}
          sections={sections}
          keyExtractor={(item) => item.id}
          extraData={{ currentSession, filter }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={resource.loading && all !== undefined} onRefresh={() => void resource.reload()} tintColor={palette.muted} />}
          ListHeaderComponent={(resource.error && !failed) || resource.stale ? (
            <View style={{ paddingBottom: 4 }}>
              <ErrorBanner message={resource.stale ? "The desktop is out of reach. Showing the copy saved on this phone." : resource.error ?? ""} actionLabel="Try again" onAction={() => void resource.reload()} />
            </View>
          ) : null}
          ListEmptyComponent={empty}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" style={{ color: palette.muted, paddingTop: 16, paddingBottom: 8, ...type(15, { weight: "500" }) }}>{section.title}</Text>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 32, backgroundColor: hexToRgba(palette.ink, 0.06) }} />}
          renderItem={({ item }: ListRenderItemInfo<Conversation>) => (
            <ConversationRow item={item} current={item.id === currentSession} wrap={fontScale > 1.3} onPress={() => open(item.id)} onActions={() => { haptic("selection"); setActionsFor(item) }} />
          )}
        />
        <SearchDock gutter={gutter} actionLabel="New" onAction={startNew} value={query} onChangeText={setQuery} placeholder="Search conversations" />
      </KeyboardAvoidingView>

      {picker}

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter" padded>
        <DividedRows>
          {CONVERSATION_FILTERS.map((item) => (
            <ListRow
              key={item.id}
              title={item.label}
              subtitle={item.description}
              selected={item.id === filter}
              showChevron={false}
              trailing={item.id === filter ? <Check size={18} color={palette.ink} strokeWidth={2.4} /> : undefined}
              onPress={() => { if (item.id !== filter) haptic("selection"); setFilter(item.id); setFilterOpen(false) }}
            />
          ))}
        </DividedRows>
      </BottomSheet>

      <BottomSheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor ? sessionTitle(actionsFor) : "Conversation"} padded>
        {actionsFor ? (
          <DividedRows>
            <ListRow
              leading={<ArrowRight size={20} color={palette.soft} />}
              title="Open conversation"
              subtitle="Jump to the transcript"
              onPress={() => { const target = actionsFor; setActionsFor(null); setTimeout(() => open(target.id), AFTER_DISMISS_MS) }}
            />
            <ListRow
              leading={<Square size={20} color={actionsFor.busy ? palette.danger : palette.muted} />}
              title="Stop the run"
              subtitle={actionsFor.busy ? "End the desktop's current turn" : "Nothing is running here"}
              disabled={!actionsFor.busy}
              showChevron={false}
              onPress={() => stop(actionsFor)}
            />
          </DividedRows>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  )
}

/** One conversation: glyph, title and a meta line ("Running · 3m ago"). Flat on the page, like nikcli's session rows. */
function ConversationRow({ item, current, wrap, onPress, onActions }: { item: Conversation; current: boolean; wrap: boolean; onPress: () => void; onActions: () => void }) {
  const { palette } = useTheme()
  const title = sessionTitle(item)
  const time = conversationTime(item) > 0 ? relativeTime(item.updatedAt ?? item.createdAt ?? "") : undefined
  const state = item.busy ? "Running" : current ? "Open" : undefined
  const meta = [state, time].filter(Boolean).join(" · ")
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onActions}
      delayLongPress={380}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={`${title}${meta ? `. ${meta}` : ""}`}
      accessibilityHint="Opens this conversation. Long press for actions."
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
