import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "expo-router"
import { GitPullRequest } from "lucide-react-native"
import type { PullRequestRow } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { PULL_FILTERS, defaultPullFilter, filterPulls, pullCounts, type PullFilter } from "@/lib/workspace-filter"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { FilterChips } from "@/components/ui/FilterChips"

const STATE_TONE: Record<PullRequestRow["state"], { tone: PillTone; label: string }> = {
  open: { tone: "accent", label: "Open" }, merged: { tone: "success", label: "Merged" }, closed: { tone: "neutral", label: "Closed" },
}

const EMPTY_FILTER: Record<PullFilter, string> = {
  open: "No open pull requests", merged: "Nothing merged yet", closed: "No closed pull requests", all: "No pull requests",
}

export function PullsPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const router = useRouter()
  const pulls = useResource(useCallback((signal) => client.pullRequests(projectId, undefined, signal), [client, projectId]), `pulls:${projectId}:${refreshKey}`)
  // Chosen once the first list arrives; afterwards it is the person's choice.
  const [filter, setFilter] = useState<PullFilter | undefined>()
  useEffect(() => { if (filter === undefined && pulls.data) setFilter(defaultPullFilter(pulls.data)) }, [pulls.data, filter])
  const active = filter ?? "all"
  const rows = useMemo(() => pulls.data ? filterPulls(pulls.data, active) : undefined, [pulls.data, active])
  const counts = useMemo(() => pullCounts(pulls.data ?? []), [pulls.data])
  const any = (pulls.data?.length ?? 0) > 0
  return <ResourceList resource={{ ...pulls, data: rows }} keyExtractor={(item) => String(item.number)}
    header={any ? <FilterChips options={PULL_FILTERS} value={active} onChange={setFilter} counts={counts} accessibilityLabel="Filter pull requests" /> : null}
    loadingLabel="Loading pull requests" emptyTitle={any ? EMPTY_FILTER[active] : "No pull requests"}
    emptyDescription={any ? "Choose another filter to see the rest." : "Ask the assistant to prepare a change. Its pull request will appear here for your review."}
    emptyIcon={<GitPullRequest size={25} color={palette.accent} />}
    renderItem={({ item }) => <RecordCard leading={<GitPullRequest size={20} color={palette.accent} />}
      title={`#${item.number} ${item.title}`} subtitle={`${item.head} → ${item.base}`}
      meta={`${item.authorKind === "ai" ? "Proposed by AI · " : ""}${relativeTime(item.createdAt)}`}
      status={<Pill tone={STATE_TONE[item.state].tone}>{STATE_TONE[item.state].label}</Pill>}
      onPress={() => router.push(`/projects/${projectId}/pulls/${item.number}`)}
    />}
  />
}
