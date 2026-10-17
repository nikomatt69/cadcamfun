import { useCallback, useState } from "react"
import { Alert, RefreshControl, Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { Bell, BellOff } from "lucide-react-native"
import type { NotificationRow } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { toast } from "@/components/ui/ToastHost"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { ActionButton } from "@/components/ui/ActionButton"
import { IconTile } from "@/components/ui/icon-tile"
import { useContentLayout } from "@/components/layout/use-content-layout"

/**
 * The Activity feed — the same notification stream the desktop shows: pull requests opened,
 * workflows passed or failed, the AI committing on an ai/ branch. Tapping a row marks it read
 * (and jumps to the project when one is linked); a long press offers deletion. "Mark all read"
 * lives in the header.
 */
export default function ActivityScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [marking, setMarking] = useState(false)

  const feed = useResource(
    useCallback((signal) => (client ? client.notifications({ limit: 100 }, signal) : Promise.reject(new Error("Not connected"))), [client]),
    "notifications",
  )

  const toggle = async (row: NotificationRow) => {
    if (!client) return
    haptic("selection")
    try {
      if (!row.isRead) await client.markNotificationRead(row.id, true)
      await feed.reload()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update", "error")
    }
  }

  const remove = (row: NotificationRow) => {
    Alert.alert(row.title, "Delete this notification?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!client) return
          void client
            .removeNotification(row.id)
            .then(() => feed.reload())
            .catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not delete", "error"))
        },
      },
    ])
  }

  const markAll = async () => {
    if (!client || marking) return
    setMarking(true)
    try {
      await client.markAllNotificationsRead()
      haptic("success")
      await feed.reload()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update", "error")
    } finally { setMarking(false) }
  }

  const rows = (feed.data?.notifications ?? []).filter((row) => filter === "all" || !row.isRead)
  const unreadCount = feed.data?.unreadCount ?? 0
  return <FlashList data={rows} keyExtractor={(item) => item.id} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 32 }}
    refreshControl={<RefreshControl refreshing={feed.loading && Boolean(feed.data)} onRefresh={() => void feed.reload()} tintColor={palette.accent} />}
    ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile size={48}><Bell size={23} color={palette.accent} /></IconTile>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" }}>{unreadCount ? `${unreadCount} unread updates` : "You're all caught up"}</Text>
          <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>Reviews, workflows and project updates.</Text>
        </View>
      </View>
      <SegmentedControl segments={[{ value: "all", label: "All updates" }, { value: "unread", label: "Unread" }]} value={filter} onChange={setFilter} />
      {unreadCount > 0 ? <ActionButton label="Mark all as read" small variant="secondary" loading={marking} onPress={() => void markAll()} /> : null}
      {feed.error ? <ErrorBanner message={feed.error} actionLabel="Retry" onAction={() => void feed.reload()} /> : null}
    </View>}
    ListEmptyComponent={feed.loading && !feed.data ? <View style={{ gap: 12 }}>{[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 104 }} />)}</View> : !feed.error ?
      <EmptyState icon={<BellOff size={26} color={palette.accent} />} title={filter === "unread" ? "All caught up" : "No updates yet"} description={filter === "unread" ? "You've read every update. New activity will appear here." : "Project reviews, workflow results and assistant changes will appear here."} /> : null}
    ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    renderItem={({ item }) => <PressableScale subtle tint onPress={() => { void toggle(item); if (item.projectId) router.push(`/projects/${item.projectId}`) }} onLongPress={() => remove(item)}
      accessibilityLabel={`${item.isRead ? "" : "Unread. "}${item.title}. ${item.content}`}
      accessibilityHint="Open update. Long press to delete."
      style={{ padding: 16, borderRadius: 20, borderCurve: "continuous", backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 0.5, gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.isRead ? palette.border : palette.accent }} />
        <Text style={{ flexGrow: 1, color: palette.muted, fontSize: 12 }}>{item.isRead ? "Update" : "New update"}</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>{relativeTime(item.createdAt)}</Text>
      </View>
      <Text style={{ color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: item.isRead ? "500" : "600" }} numberOfLines={fontScale > 1.2 ? undefined : 3}>{item.title}</Text>
      <Text style={{ color: palette.soft, fontSize: 14, lineHeight: 21 }} numberOfLines={fontScale > 1.2 ? undefined : 3}>{item.content}</Text>
      {item.projectId ? <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "600" }}>View project →</Text> : null}
    </PressableScale>}
  />
}
