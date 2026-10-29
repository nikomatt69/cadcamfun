import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, Text, View, useWindowDimensions } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { ArrowRight, Bell, BellOff, Box, CheckCheck, CircleCheck, CircleX, CloudOff, Funnel, FolderPlus, GitMerge, GitPullRequest, Mail, MessageSquare, MessageSquareText, Search, Sparkles, Trash2, Undo2, UserPlus, type LucideIcon } from "lucide-react-native"
import type { NotificationRow } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { pairingIdentity } from "@/lib/pairing"
import { accountStore } from "@/lib/account"
import { useResource } from "@/lib/use-resource"
import { usePoll } from "@/lib/use-poll"
import { useUIStore } from "@/lib/store"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { activityCategory, activityTarget, appendFeedPage, firstFeedPage, nextPageQuery, groupActivity, markAllInFeed, markLocally, removeFromFeed, type ActivityTone, type FeedPages } from "@/lib/activity-feed"
import { ACTIVITY_FILTERS, activityFilterCounts, matchesActivityFilter, searchActivity, type ActivityFilter } from "@/lib/activity-filter"
import { toast } from "@/components/ui/ToastHost"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ActionButton } from "@/components/ui/ActionButton"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { ChoiceRow, DividedRows } from "@/components/chat/sheet-parts"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ActivityDock } from "@/components/activity/ActivityDock"
import { ChoiceSheet } from "@/components/manage/ChoiceSheet"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { ListHeading, RecordSkeleton, RowSeparator } from "@/components/manage/records"

const PAGE = 50

/** iOS cannot present an alert or push a screen over a sheet that is still dismissing; the next step waits for it. */
const AFTER_DISMISS_MS = 350

const CATEGORY_ICON: Record<string, LucideIcon> = {
  PR_OPENED: GitPullRequest,
  PR_MERGED: GitMerge,
  PR_REVIEWED: MessageSquareText,
  AI_COMMITTED: Sparkles,
  WORKFLOW_FAILED: CircleX,
  WORKFLOW_PASSED: CircleCheck,
  PROJECT_CREATED: FolderPlus,
  COMPONENT_CREATED: Box,
  NEW_MESSAGE: MessageSquare,
  MEMBER_JOINED: UserPlus,
  ORGANIZATION_INVITATION: Mail,
}

/**
 * The Activity feed — the same notification stream the desktop shows: pull requests opened,
 * workflows passed or failed, the AI committing on an ai/ branch. Laid out like the conversations list:
 * a centred header with the filter funnel, flat rows under day headings, and one dock at the foot — a glass
 * search field beside "Read all". A tap marks the row read (optimistically) and opens the pull request,
 * component or project it is about; a long press offers read/unread, open and deletion. Older updates load
 * page by page from the server offset, so loading more never refetches what is already on screen.
 */
export default function ActivityScreen() {
  const { client, config, connectivity } = useServer()
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.account)
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const [query, setQuery] = useState("")
  const [filterOpen, setFilterOpen] = useState(false)
  const [actionsFor, setActionsFor] = useState<NotificationRow | null>(null)
  const [marking, setMarking] = useState(false)
  const [pages, setPages] = useState<FeedPages | undefined>()
  const [older, setOlder] = useState<{ loading: boolean; error?: string }>({ loading: false })
  const olderRequest = useRef<AbortController | null>(null)

  const feed = useResource(
    useCallback((signal) => (client ? client.notifications({ limit: PAGE }, signal) : Promise.reject(new Error("Not connected"))), [client]),
    "notifications",
    { cacheKey: `notifications:${(config ? pairingIdentity(config) : "")}:${account?.subject ?? "local"}` },
  )
  // The feed belongs to no project, so no single stream covers it: it refreshes itself while it is open.
  usePoll(() => void feed.reload(), 25_000, connectivity === "online")
  // The newest page from the server replaces everything loaded before it, optimistic edits included.
  useEffect(() => {
    olderRequest.current?.abort()
    setOlder({ loading: false })
    if (feed.data) setPages(firstFeedPage(feed.data, PAGE))
  }, [feed.data])
  useEffect(() => { if (!client) setPages(undefined) }, [client])
  useEffect(() => () => olderRequest.current?.abort(), [])
  const data = pages

  const loadOlder = async () => {
    if (!client || !pages || pages.exhausted || older.loading) return
    const request = new AbortController()
    olderRequest.current?.abort()
    olderRequest.current = request
    setOlder({ loading: true })
    try {
      const page = await client.notifications({ limit: PAGE, ...nextPageQuery(pages) }, request.signal)
      if (request.signal.aborted) return
      setPages((current) => current ? appendFeedPage(current, page, PAGE) : current)
      setOlder({ loading: false })
    } catch (error) {
      if (!request.signal.aborted) setOlder({ loading: false, error: error instanceof Error ? error.message : "Could not load older updates" })
    } finally {
      if (olderRequest.current === request) olderRequest.current = null
    }
  }

  /** Applies an edit at once and puts the previous feed back if the desktop refuses it. */
  const optimistic = async (edit: (feed: FeedPages) => FeedPages, work: () => Promise<unknown>, failure: string) => {
    const before = pages
    if (!before) return false
    setPages(edit(before))
    try {
      await work()
      return true
    } catch (error) {
      setPages((current) => current === undefined ? current : before)
      toast(error instanceof Error ? error.message : failure, "error")
      return false
    }
  }

  const setRead = async (row: NotificationRow, isRead: boolean) => {
    if (!client) return
    await optimistic((current) => markLocally(current, row.id, isRead), () => client.markNotificationRead(row.id, isRead), "Could not update")
  }

  const open = (row: NotificationRow) => {
    haptic("selection")
    if (!row.isRead) void setRead(row, true)
    const target = activityTarget(row)
    if (target) router.push(target as never)
  }

  const remove = (row: NotificationRow) => {
    Alert.alert(row.title, "Delete this notification? It is also removed from the desktop.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!client) return
          void optimistic((current) => removeFromFeed(current, row.id), () => client.removeNotification(row.id), "Could not delete")
            .then((removed) => { if (removed) haptic("success") })
        },
      },
    ])
  }

  const markAll = async () => {
    if (!client || marking || !data) return
    setMarking(true)
    try {
      if (await optimistic(markAllInFeed, () => client.markAllNotificationsRead(), "Could not update")) haptic("success")
    } finally { setMarking(false) }
  }

  const unreadCount = data?.unreadCount ?? 0
  const counts = useMemo(() => activityFilterCounts(data?.notifications ?? []), [data])
  const items = useMemo(() => {
    const kept = (data?.notifications ?? []).filter((row) => matchesActivityFilter(row, filter))
    return groupActivity(searchActivity(kept, query), Date.now())
  }, [data, filter, query])
  // The tab badge follows the feed: reading on the phone clears it.
  const setUnreadCount = useUIStore((state) => state.setUnreadCount)
  useEffect(() => { setUnreadCount(unreadCount) }, [unreadCount, setUnreadCount])
  const mayHaveMore = data !== undefined && !data.exhausted
  const filtering = filter !== "all" || query.trim() !== ""
  const activeFilter = ACTIVITY_FILTERS.find((item) => item.id === filter)
  const initialLoading = feed.loading && data === undefined
  const failed = feed.error !== undefined && data === undefined

  const empty = initialLoading ? <RecordSkeleton label="Loading updates" />
    : failed ? (
      <EmptyState title="Could not load updates" description={feed.error ?? "The desktop did not answer."} icon={<CloudOff size={25} color={palette.danger} />}
        action={<ActionButton variant="secondary" label="Try again" loading={feed.loading} onPress={() => void feed.reload()} />} />
    ) : query.trim() ? (
      <EmptyState title="No matches" description={`No update has “${query.trim()}” in it${filter === "all" ? "" : ` under ${activeFilter?.label.toLowerCase()}`}.`} icon={<Search size={25} color={palette.muted} />}
        action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
    ) : filter === "unread" ? (
      <EmptyState title="All caught up" description="You have read every update. New activity will appear here." icon={<BellOff size={25} color={palette.accent} />}
        action={<ActionButton variant="secondary" label="Show all updates" onPress={() => { haptic("selection"); setFilter("all") }} />} />
    ) : filter !== "all" ? (
      <EmptyState title={`No ${activeFilter?.label.toLowerCase() ?? "matching updates"}`} description="Nothing of this kind has arrived yet. Try another filter, or show everything."
        action={<ActionButton variant="secondary" label="Show all" onPress={() => { haptic("selection"); setFilter("all") }} />} />
    ) : (
      <EmptyState title="No updates yet" description="Project reviews, workflow results and assistant changes will appear here." icon={<Bell size={25} color={palette.accent} />} />
    )

  const banner = feed.stale ? "The desktop is out of reach. Showing the copy saved on this phone."
    : feed.error !== undefined && data !== undefined ? feed.error : undefined

  return (
    <ScreenFrame
      title="Activity"
      subtitle={data ? (unreadCount > 0 ? `${unreadCount} unread` : "All caught up") : undefined}
      right={(
        <IconCircleButton
          tone="warm"
          accessibilityLabel={filter === "all" ? "Filter updates" : `Filter updates, ${activeFilter?.label}`}
          accessibilityHint="Shows unread updates or one kind of update"
          onPress={() => { haptic("selection"); setFilterOpen(true) }}
        >
          <Funnel size={18} color={palette.ink} strokeWidth={2.2} fill={filter === "all" ? "none" : palette.ink} />
        </IconCircleButton>
      )}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          onLayout={onLayout}
          style={{ flex: 1 }}
          extraData={{ filter, fontScale }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 16 }}
          refreshControl={<RefreshControl refreshing={feed.loading && data !== undefined} onRefresh={() => void feed.reload()} tintColor={palette.muted} />}
          ListHeaderComponent={banner ? (
            <View style={{ paddingBottom: 4 }}>
              <ErrorBanner message={banner} actionLabel="Try again" onAction={() => void feed.reload()} />
            </View>
          ) : null}
          ListEmptyComponent={empty}
          ListFooterComponent={mayHaveMore ? (
            <View style={{ paddingTop: 16, gap: 10 }}>
              {older.error ? <ErrorBanner message={older.error} actionLabel="Try again" onAction={() => void loadOlder()} /> : null}
              {older.error ? null : <ActionButton label="Load older updates" variant="ghost" loading={older.loading} onPress={() => void loadOlder()} />}
            </View>
          ) : null}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (!filtering && mayHaveMore && !older.error) void loadOlder() }}
          renderItem={({ item, index }) => {
            if (item.kind === "section") {
              return <ListHeading title={item.title} accessory={item.unread ? <Text style={{ color: palette.accentStrong, fontVariant: ["tabular-nums"], ...type(13, { weight: "600" }) }}>{item.unread} new</Text> : undefined} />
            }
            return (
              <>
                {items[index - 1]?.kind === "row" ? <RowSeparator /> : null}
                <ActivityRow
                  row={item.row}
                  wrap={fontScale > 1.3}
                  onPress={() => open(item.row)}
                  onActions={() => { haptic("selection"); setActionsFor(item.row) }}
                  onToggle={() => void setRead(item.row, !item.row.isRead)}
                  onDelete={() => remove(item.row)}
                />
              </>
            )
          }}
        />
        <ActivityDock
          gutter={gutter}
          value={query}
          onChangeText={setQuery}
          placeholder="Search updates"
          action={unreadCount > 0 ? { label: "Read all", icon: <CheckCheck size={18} color={palette.onAccent} strokeWidth={2.4} />, loading: marking, hint: "Marks every update as read, on the desktop too", onPress: () => void markAll() } : undefined}
        />
      </KeyboardAvoidingView>

      <ChoiceSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter"
        groups={[{ options: ACTIVITY_FILTERS.map((item) => ({ id: item.id, label: item.label, description: item.description, count: item.id === "all" || counts[item.id] > 0 ? counts[item.id] : undefined })), value: filter, onChange: (value) => setFilter(value as ActivityFilter) }]}
        footer={mayHaveMore ? "Counts cover the updates loaded so far." : undefined}
      />

      <BottomSheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor?.title ?? "Update"} padded>
        {actionsFor ? <ActivityActions
          row={actionsFor}
          onOpen={() => { const target = actionsFor; setActionsFor(null); setTimeout(() => open(target), AFTER_DISMISS_MS) }}
          onToggle={() => { const target = actionsFor; setActionsFor(null); void setRead(target, !target.isRead) }}
          onDelete={() => { const target = actionsFor; setActionsFor(null); setTimeout(() => remove(target), AFTER_DISMISS_MS) }}
        /> : null}
      </BottomSheet>
    </ScreenFrame>
  )
}

/** What a long press offers: open the thing it is about, flip read/unread, delete (also on the desktop). */
function ActivityActions({ row, onOpen, onToggle, onDelete }: { row: NotificationRow; onOpen: () => void; onToggle: () => void; onDelete: () => void }) {
  const target = activityTarget(row)
  return (
    <DividedRows>
      {target ? <ChoiceRow icon={ArrowRight} title="Open" description="Go to what this update is about" onPress={onOpen} /> : <View />}
      <ChoiceRow icon={row.isRead ? Undo2 : CheckCheck} title={row.isRead ? "Mark as unread" : "Mark as read"} description={row.isRead ? "Keep it in your unread updates" : "Clear it from your unread updates"} onPress={onToggle} />
      <ChoiceRow icon={Trash2} destructive title="Delete" description="Also removes it from the desktop" onPress={onDelete} />
    </DividedRows>
  )
}

const toneColor = (palette: ReturnType<typeof useTheme>["palette"], tone: ActivityTone): string =>
  tone === "success" ? palette.success : tone === "danger" ? palette.danger : tone === "accent" ? palette.accent : palette.soft

/** One update: the kind's glyph (with an unread dot), the title, the text and a quiet "Pull request · 3m ago" line. */
function ActivityRow({ row, wrap, onPress, onActions, onToggle, onDelete }: { row: NotificationRow; wrap: boolean; onPress: () => void; onActions: () => void; onToggle: () => void; onDelete: () => void }) {
  const { palette } = useTheme()
  const category = activityCategory(row.type)
  const Icon = CATEGORY_ICON[row.type] ?? Bell
  const target = activityTarget(row)
  const time = relativeTime(row.createdAt)
  const meta = [category.label, time].filter(Boolean).join(" · ")
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onActions}
      delayLongPress={380}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={`${row.isRead ? "" : "Unread. "}${[row.title, row.content, meta].filter(Boolean).join(". ")}`}
      accessibilityHint={target ? "Opens the update. Long press for more actions." : "Marks as read. Long press for more actions."}
      accessibilityActions={[{ name: "toggle", label: row.isRead ? "Mark as unread" : "Mark as read" }, { name: "delete", label: "Delete" }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "toggle") onToggle(); else if (event.nativeEvent.actionName === "delete") onDelete() }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 12, borderCurve: "continuous" }}
    >
      <View style={{ width: 28, height: 24, alignItems: "center", justifyContent: "center", marginTop: 0 }}>
        <Icon size={21} color={toneColor(palette, category.tone)} strokeWidth={2} />
        {row.isRead ? null : <View style={{ position: "absolute", top: -2, left: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: palette.background, backgroundColor: palette.accent }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...type(17, { weight: row.isRead ? "500" : "700" }) }} numberOfLines={wrap ? undefined : 2}>{row.title}</Text>
        {row.content ? <Text style={{ color: palette.soft, ...type(14) }} numberOfLines={wrap ? undefined : 2}>{row.content}</Text> : null}
        <Text style={{ color: palette.muted, ...type(13) }} numberOfLines={wrap ? undefined : 1}>{meta}</Text>
      </View>
    </PressableScale>
  )
}
