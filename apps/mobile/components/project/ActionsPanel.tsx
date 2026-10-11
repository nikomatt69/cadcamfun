import { useCallback } from "react"
import { Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { Workflow } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { duration, relativeTime, runStatusLabel } from "@/lib/format"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { ActionButton } from "@/components/ui/ActionButton"

const STATUS_TONE: Record<string, PillTone> = {
  queued: "info",
  running: "warning",
  success: "success",
  failure: "danger",
}

/**
 * Actions — the project's workflow runs (the GitHub-Actions-style checks the spec defines).
 * Every commit and pull request can trigger them; this is where the phone watches them land.
 */
export function ActionsPanel({
  client,
  projectId,
  refreshKey,
  onDispatch,
  dispatching,
}: {
  client: CompanionClient
  projectId: string
  refreshKey: number
  onDispatch: () => void
  dispatching: boolean
}) {
  const { palette } = useTheme()
  const runs = useResource(
    useCallback((signal) => client.runs(projectId, signal), [client, projectId]),
    `runs:${projectId}:${refreshKey}`,
  )

  if (runs.loading) {
    return (
      <View style={{ padding: 16, gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 64 }} />
        ))}
      </View>
    )
  }

  if (runs.error) return <View style={{ padding: 16 }}>{<ErrorBanner message={runs.error} actionLabel="Retry" onAction={() => void runs.reload()} />}</View>

  const list = runs.data ?? []

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        data={list}
        keyExtractor={(item) => item.id}
        
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          list.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <ActionButton label="Run workflows" small variant="secondary" onPress={onDispatch} loading={dispatching} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ gap: 16, paddingTop: 24 }}>
            <EmptyState
              
              title="No workflow runs"
              description="Workflows validate commits and pull requests automatically. Push a commit or open a PR and the runs appear here."
            />
            <View style={{ alignItems: "center" }}>
              <ActionButton label="Run workflows" small variant="secondary" onPress={onDispatch} loading={dispatching} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 58, backgroundColor: palette.border }} />}
        renderItem={({ item }) => (
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
              <Workflow size={16} color={palette.soft} />
            </View>
            <View style={{ flex: 1, gap: 1.5 }}>
              <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "500" }} numberOfLines={1}>
                {item.workflow}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                {item.event} · {item.ref} · {relativeTime(item.startedAt)}
                {item.finishedAt ? ` · ${duration(item.startedAt, item.finishedAt)}` : ""}
              </Text>
            </View>
            <Pill tone={STATUS_TONE[item.status] ?? "neutral"}>{runStatusLabel(item.status)}</Pill>
          </View>
        )}
      />
    </View>
  )
}
