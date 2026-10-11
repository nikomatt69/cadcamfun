import { useCallback } from "react"
import { Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { GitCommitHorizontal, History } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { commitTime, commitTitle, relativeTime, shortOid } from "@/lib/format"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

/**
 * The commit history: one row per commit — title, author + time, oid — pushing into the commit
 * diff screen. Rows are the iOS grouped-list language; a commit tap is a selection tick.
 */
export function HistoryPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const router = useRouter()
  const log = useResource(
    useCallback((signal) => client.log(projectId, 100, signal), [client, projectId]),
    `log:${projectId}:${refreshKey}`,
  )

  if (log.loading) {
    return (
      <View style={{ padding: 16, gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} style={{ height: 58 }} />
        ))}
      </View>
    )
  }

  if (log.error) return <View style={{ padding: 16 }}>{<ErrorBanner message={log.error} actionLabel="Retry" onAction={() => void log.reload()} />}</View>

  const commits = log.data ?? []
  if (commits.length === 0) {
    return <EmptyState  title="No commits yet" description="Commit from the Overview tab or let the assistant open a pull request." />
  }

  return (
    <FlashList
      data={commits}
      keyExtractor={(item) => item.oid}
      
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 58, backgroundColor: palette.border }} />}
      renderItem={({ item }) => (
        <PressableScale
          subtle
          onPress={() => {
            haptic("selection")
            router.push(`/projects/${projectId}/commit/${item.oid}`)
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.panel,
              }}
            >
              <GitCommitHorizontal size={16} color={palette.soft} />
            </View>
            <View style={{ flex: 1, gap: 1.5 }}>
              <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "500" }} numberOfLines={1}>
                {commitTitle(item.message)}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                {item.author.name} · {relativeTime(commitTime(item.author.time))}
              </Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16, fontFamily: "Menlo" }}>{shortOid(item.oid)}</Text>
          </View>
        </PressableScale>
      )}
    />
  )
}
