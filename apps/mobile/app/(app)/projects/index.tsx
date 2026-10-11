import { useCallback } from "react"
import { RefreshControl, Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { FolderOpen } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { relativeTime } from "@/lib/format"
import type { ProjectSummary } from "@/lib/client"

/**
 * The project list — the phone's mirror of the desktop's workspaces. Pull-to-refresh re-reads the
 * list; rows press with the app-wide scale. The chevron, tinted icons and hairline separators are
 * the iOS grouped-list language; nothing here is louder than the content.
 */
export default function ProjectsScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()

  const { data: projects, error, loading, reload } = useResource(
    useCallback((signal) => (client ? client.projects(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "projects",
  )

  const open = (project: ProjectSummary) => {
    haptic("selection")
    router.push(`/projects/${project.id}`)
  }

  if (loading && !projects) {
    return (
      <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 84, borderRadius: 12 }} />
        ))}
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ padding: 16 }}>
        <ErrorBanner message={error} actionLabel="Retry" onAction={() => void reload()} />
      </View>
    )
  }

  const list = projects ?? []

  if (list.length === 0) {
    return (
      <EmptyState
        
        title="No projects yet"
        description="Create a project in CADCAMFUN on your Mac and it appears here."
      />
    )
  }

  return (
    <FlashList
      data={list}
      keyExtractor={(item) => item.id}
      
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={palette.accent} />}
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 64, backgroundColor: palette.border }} />}
      renderItem={({ item }) => (
        <PressableScale onPress={() => open(item)} subtle>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 13 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${palette.accent}14`,
              }}
            >
              <FolderOpen size={19} color={palette.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "500", letterSpacing: -0.004 }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
                {item.description || "No description"}
              </Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{relativeTime(item.updatedAt)}</Text>
          </View>
        </PressableScale>
      )}
    />
  )
}
