import { useCallback } from "react"
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
    if (!client) return
    try {
      await client.markAllNotificationsRead()
      haptic("success")
      await feed.reload()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update", "error")
    }
  }

  const rows = feed.data?.notifications ?? []

  if (feed.loading && !feed.data) {
    return (
      <View style={{ padding: 16, gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 66 }} />
        ))}
      </View>
    )
  }

  if (feed.error) return <View style={{ padding: 16 }}>{<ErrorBanner message={feed.error} actionLabel="Retry" onAction={() => void feed.reload()} />}</View>

  if (rows.length === 0) {
    return (
      <EmptyState
        
        title="Nothing yet"
        description="Pull requests, workflow results and AI commits land here — the same feed as the desktop."
      />
    )
  }

  return (
    <FlashList
      data={rows}
      keyExtractor={(item) => item.id}
      
      refreshControl={<RefreshControl refreshing={feed.loading} onRefresh={() => void feed.reload()} tintColor={palette.accent} />}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        (feed.data?.unreadCount ?? 0) > 0 ? (
          <View style={{ alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text onPress={() => void markAll()} style={{ color: palette.accent, fontSize: 14, fontWeight: "600" }}>
              Mark all read
            </Text>
          </View>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />}
      renderItem={({ item }) => (
        <PressableScale
          subtle
          onPress={() => {
            void toggle(item)
            if (item.projectId) router.push(`/projects/${item.projectId}`)
          }}
          onLongPress={() => remove(item)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: item.isRead ? palette.panel : `${palette.accent}1F`,
              }}
            >
              <Bell size={15} color={item.isRead ? palette.muted : palette.accent} />
            </View>
            <View style={{ flex: 1, gap: 1.5 }}>
              <Text
                style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: item.isRead ? "400" : "600" }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                {item.content}
              </Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{relativeTime(item.createdAt)}</Text>
            {!item.isRead ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }} /> : null}
          </View>
        </PressableScale>
      )}
    />
  )
}
