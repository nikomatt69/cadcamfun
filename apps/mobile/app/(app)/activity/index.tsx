import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActionSheetIOS, Alert, Platform, RefreshControl, Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { Bell, BellOff } from "lucide-react-native"
import type { NotificationRow } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { activityCategory, activityTarget, appendFeedPage, firstFeedPage, nextPageQuery, groupActivity, markAllInFeed, markLocally, removeFromFeed, type ActivityTone, type FeedPages } from "@/lib/activity-feed"
import { toast } from "@/components/ui/ToastHost"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { ActionButton } from "@/components/ui/ActionButton"
import { IconTile } from "@/components/ui/icon-tile"
import { useContentLayout } from "@/components/layout/use-content-layout"

const PAGE = 50

/**
 * The Activity feed — the same notification stream the desktop shows: pull requests opened,
 * workflows passed or failed, the AI committing on an ai/ branch. Rows are grouped by day; a tap
 * marks the row read (optimistically) and opens the pull request, component or project it is about;
 * a long press offers read/unread and deletion. Older updates load page by page from the server
 * offset, so loading more never refetches what is already on screen.
 */
export default function ActivityScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [marking, setMarking] = useState(false)
  const [pages, setPages] = useState<FeedPages | undefined>()
  const [older, setOlder] = useState<{ loading: boolean; error?: string }>({ loading: false })
  const olderRequest = useRef<AbortController | null>(null)

  const feed = useResource(
    useCallback((signal) => (client ? client.notifications({ limit: PAGE }, signal) : Promise.reject(new Error("Not connected"))), [client]),
    "notifications",
  )
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

  const actions = (row: NotificationRow) => {
    haptic("selection")
    const toggle = row.isRead ? "Mark as unread" : "Mark as read"
    const target = activityTarget(row)
    const options = [toggle, ...(target ? ["Open"] : []), "Delete", "Cancel"]
    const run = (choice: string | undefined) => {
      if (choice === toggle) void setRead(row, !row.isRead)
      else if (choice === "Open") open(row)
      else if (choice === "Delete") remove(row)
    }
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title: row.title, options, destructiveButtonIndex: options.indexOf("Delete"), cancelButtonIndex: options.length - 1 }, (index) => run(options[index]))
    } else {
      Alert.alert(row.title, undefined, options.map((text) => ({ text, style: text === "Delete" ? "destructive" as const : text === "Cancel" ? "cancel" as const : "default" as const, onPress: () => run(text) })))
    }
  }

  const markAll = async () => {
    if (!client || marking || !data) return
    setMarking(true)
    try {
      if (await optimistic(markAllInFeed, () => client.markAllNotificationsRead(), "Could not update")) haptic("success")
    } finally { setMarking(false) }
  }

  const items = useMemo(() => groupActivity((data?.notifications ?? []).filter((row) => filter === "all" || !row.isRead), Date.now()), [data, filter])
  const unreadCount = data?.unreadCount ?? 0
  const mayHaveMore = data !== undefined && !data.exhausted
  const toneColor = (tone: ActivityTone) => tone === "success" ? palette.success : tone === "danger" ? palette.danger : tone === "accent" ? palette.accent : palette.muted

  return <FlashList data={items} keyExtractor={(item) => item.key} getItemType={(item) => item.kind} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 32 }}
    refreshControl={<RefreshControl refreshing={feed.loading && Boolean(feed.data)} onRefresh={() => void feed.reload()} tintColor={palette.accent} />}
    ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile size={48}><Bell size={23} color={palette.accent} /></IconTile>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" }}>{unreadCount ? `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}` : "You're all caught up"}</Text>
          <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>Reviews, workflows and project updates.</Text>
        </View>
      </View>
      <SegmentedControl segments={[{ value: "all", label: "All updates" }, { value: "unread", label: unreadCount ? `Unread (${unreadCount})` : "Unread" }]} value={filter} onChange={setFilter} />
      {unreadCount > 0 ? <ActionButton label="Mark all as read" small variant="secondary" loading={marking} onPress={() => void markAll()} /> : null}
      {feed.error ? <ErrorBanner message={feed.data ? `Showing saved updates. ${feed.error}` : feed.error} actionLabel="Retry" onAction={() => void feed.reload()} /> : null}
    </View>}
    ListEmptyComponent={feed.loading && !data ? <View accessible accessibilityLabel="Loading updates" style={{ gap: 12 }}>{[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 104 }} />)}</View> : !feed.error ?
      <EmptyState icon={<BellOff size={26} color={palette.accent} />} title={filter === "unread" ? "All caught up" : "No updates yet"} description={filter === "unread" ? "You've read every update. New activity will appear here." : "Project reviews, workflow results and assistant changes will appear here."} /> : null}
    ListFooterComponent={mayHaveMore && filter === "all" ? <View style={{ paddingTop: 16, gap: 10 }}>
      {older.error ? <ErrorBanner message={older.error} actionLabel="Try again" onAction={() => void loadOlder()} /> : null}
      {older.error ? null : <ActionButton label="Load older updates" variant="ghost" loading={older.loading} onPress={() => void loadOlder()} />}
    </View> : null}
    onEndReachedThreshold={0.4}
    onEndReached={() => { if (filter === "all" && mayHaveMore && !older.error) void loadOlder() }}
    renderItem={({ item }) => {
      if (item.kind === "section") {
        return <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4 }}>
          <Text style={{ color: palette.ink, fontSize: 15, fontWeight: "700" }}>{item.title}</Text>
          {item.unread ? <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "600" }}>{item.unread} new</Text> : null}
        </View>
      }
      const row = item.row
      const category = activityCategory(row.type)
      const color = toneColor(category.tone)
      return <View style={{ paddingBottom: 10 }}>
        <PressableScale subtle tint onPress={() => open(row)} onLongPress={() => actions(row)}
          accessibilityLabel={`${row.isRead ? "" : "Unread. "}${category.label}. ${row.title}. ${row.content}. ${relativeTime(row.createdAt)}`}
          accessibilityHint={activityTarget(row) ? "Opens the update. Long press for more actions." : "Marks as read. Long press for more actions."}
          accessibilityActions={[{ name: "toggle", label: row.isRead ? "Mark as unread" : "Mark as read" }, { name: "delete", label: "Delete" }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "toggle") void setRead(row, !row.isRead); else if (event.nativeEvent.actionName === "delete") remove(row) }}
          style={{ padding: 16, borderRadius: 20, borderCurve: "continuous", backgroundColor: palette.surface, borderColor: row.isRead ? palette.border : hexToRgba(palette.accent, 0.35), borderWidth: 0.5, gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.isRead ? palette.border : palette.accent }} />
            <Text style={{ flexGrow: 1, color, fontSize: 12, fontWeight: "600" }}>{category.label}</Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>{relativeTime(row.createdAt)}</Text>
          </View>
          <Text style={{ color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: row.isRead ? "500" : "600" }} numberOfLines={fontScale > 1.2 ? undefined : 3}>{row.title}</Text>
          {row.content ? <Text style={{ color: palette.soft, fontSize: 14, lineHeight: 21 }} numberOfLines={fontScale > 1.2 ? undefined : 3}>{row.content}</Text> : null}
        </PressableScale>
      </View>
    }}
  />
}
