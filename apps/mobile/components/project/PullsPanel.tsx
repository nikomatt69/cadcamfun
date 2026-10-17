import { useCallback } from "react"
import { useRouter } from "expo-router"
import { GitPullRequest } from "lucide-react-native"
import type { PullRequestRow } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

const STATE_TONE: Record<PullRequestRow["state"], { tone: PillTone; label: string }> = {
  open: { tone: "accent", label: "Open" }, merged: { tone: "success", label: "Merged" }, closed: { tone: "neutral", label: "Closed" },
}

export function PullsPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const router = useRouter()
  const pulls = useResource(useCallback((signal) => client.pullRequests(projectId, undefined, signal), [client, projectId]), `pulls:${projectId}:${refreshKey}`)
  return <ResourceList resource={pulls} keyExtractor={(item) => String(item.number)}
    loadingLabel="Loading pull requests" emptyTitle="No pull requests"
    emptyDescription="Ask the assistant to prepare a change. Its pull request will appear here for your review."
    emptyIcon={<GitPullRequest size={25} color={palette.accent} />}
    renderItem={({ item }) => <RecordCard leading={<GitPullRequest size={20} color={palette.accent} />}
      title={`#${item.number} ${item.title}`} subtitle={`${item.head} → ${item.base}`}
      meta={`${item.authorKind === "ai" ? "Proposed by AI · " : ""}${relativeTime(item.createdAt)}`}
      status={<Pill tone={STATE_TONE[item.state].tone}>{STATE_TONE[item.state].label}</Pill>}
      onPress={() => router.push(`/projects/${projectId}/pulls/${item.number}`)}
    />}
  />
}
