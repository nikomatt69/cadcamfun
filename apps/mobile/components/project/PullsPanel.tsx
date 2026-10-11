import { useCallback } from "react"
import { Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { GitPullRequest } from "lucide-react-native"
import type { PullRequestRow } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { PressableScale } from "@/components/ui/PressableScale"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

const STATE_TONE: Record<PullRequestRow["state"], { tone: PillTone; label: string }> = {
  open: { tone: "accent", label: "Open" },
  merged: { tone: "success", label: "Merged" },
  closed: { tone: "neutral", label: "Closed" },
}

/**
 * The pull request list: number, title, head → base, state. The AI author marker is the guardrail
 * made visible (Apple §16 — Responsibility): AI changes arrive as PRs on `ai/*` branches and a
 * person merges them — the row says so.
 */
export function PullsPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const router = useRouter()
  const pulls = useResource(
    useCallback((signal) => client.pullRequests(projectId, undefined, signal), [client, projectId]),
    `pulls:${projectId}:${refreshKey}`,
  )

  if (pulls.loading) {
    return (
      <View style={{ padding: 16, gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 74 }} />
        ))}
      </View>
    )
  }

  if (pulls.error) return <View style={{ padding: 16 }}>{<ErrorBanner message={pulls.error} actionLabel="Retry" onAction={() => void pulls.reload()} />}</View>

  const list = pulls.data ?? []
  if (list.length === 0) {
    return (
      <EmptyState
        
        title="No pull requests"
        description="Ask the assistant to make a change — it opens a pull request here for you to review."
      />
    )
  }

  return (
    <FlashList
      data={list}
      keyExtractor={(item) => String(item.number)}
      
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 58, backgroundColor: palette.border }} />}
      renderItem={({ item }) => {
        const state = STATE_TONE[item.state]
        return (
          <PressableScale
            subtle
            onPress={() => {
              haptic("selection")
              router.push(`/projects/${projectId}/pulls/${item.number}`)
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${palette.accent}14`,
                }}
              >
                <GitPullRequest size={16} color={palette.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "500" }} numberOfLines={1}>
                  <Text style={{ color: palette.muted }}>#{item.number}</Text> {item.title}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                  {item.head} → {item.base}
                  {item.authorKind === "ai" ? " · by AI" : ""} · {relativeTime(item.createdAt)}
                </Text>
              </View>
              <Pill tone={state.tone}>{state.label}</Pill>
            </View>
          </PressableScale>
        )
      }}
    />
  )
}
