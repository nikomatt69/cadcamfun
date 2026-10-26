import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "expo-router"
import { GitPullRequest, Search } from "lucide-react-native"
import type { PullRequestRow } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { PULL_FILTERS, defaultPullFilter, filterPulls, pullCounts, type PullFilter } from "@/lib/workspace-filter"
import { matchesPull, projectMeta, sectionByDay, timeOf } from "@/lib/project-list"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { FilterChips } from "@/components/ui/FilterChips"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { RowList } from "./RowList"
import { FlatRow } from "./rows"
import { Dock } from "./Dock"

const STATE_TONE: Record<PullRequestRow["state"], { tone: PillTone; label: string }> = {
  open: { tone: "accent", label: "Open" }, merged: { tone: "success", label: "Merged" }, closed: { tone: "neutral", label: "Closed" },
}

const EMPTY_FILTER: Record<PullFilter, string> = {
  open: "No open pull requests", merged: "Nothing merged yet", closed: "No closed pull requests", all: "No pull requests",
}

/** Pull requests as flat rows under day headings: the state chips above, the search in the dock. */
export function PullsPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const pulls = useResource(useCallback((signal) => client.pullRequests(projectId, undefined, signal), [client, projectId]), `pulls:${projectId}:${refreshKey}`)
  // Chosen once the first list arrives; afterwards it is the person's choice.
  const [filter, setFilter] = useState<PullFilter | undefined>()
  useEffect(() => { if (filter === undefined && pulls.data) setFilter(defaultPullFilter(pulls.data)) }, [pulls.data, filter])
  const active = filter ?? "all"
  const sections = useMemo(() => sectionByDay(filterPulls(pulls.data ?? [], active).filter((pull) => matchesPull(pull, query)), (pull) => timeOf(pull.createdAt)), [pulls.data, active, query])
  const counts = useMemo(() => pullCounts(pulls.data ?? []), [pulls.data])
  const any = (pulls.data?.length ?? 0) > 0
  const empty = query.trim() && any ? (
    <EmptyState title="No matches" description={`No pull request mentions “${query.trim()}”.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <EmptyState
      title={any ? EMPTY_FILTER[active] : "No pull requests"}
      description={any ? "Choose another filter to see the rest." : "Ask the assistant to prepare a change. Its pull request will appear here for your review."}
      icon={<GitPullRequest size={25} color={palette.accent} />}
      {...(any && active !== "all" ? { action: <ActionButton variant="secondary" label="Show all" onPress={() => { haptic("selection"); setFilter("all") }} /> } : {})}
    />
  )
  return (
    <>
      <RowList
        source={pulls}
        sections={sections}
        keyExtractor={(item) => String(item.number)}
        header={any ? <FilterChips options={PULL_FILTERS} value={active} onChange={(value) => { haptic("selection"); setFilter(value) }} counts={counts} accessibilityLabel="Filter pull requests" /> : undefined}
        loadingLabel="Loading pull requests"
        failureTitle="Could not load the pull requests"
        empty={empty}
        renderRow={(item) => (
          <FlatRow
            leading={<GitPullRequest size={19} color={item.state === "open" ? palette.accent : palette.muted} strokeWidth={2} />}
            title={`#${item.number} ${item.title}`}
            subtitle={`${item.head} → ${item.base}`}
            meta={projectMeta([item.authorKind === "ai" && "Proposed by the assistant", relativeTime(item.createdAt)])}
            trailing={<Pill tone={STATE_TONE[item.state].tone}>{STATE_TONE[item.state].label}</Pill>}
            onPress={() => { haptic("selection"); router.push(`/projects/${projectId}/pulls/${item.number}`) }}
            accessibilityHint="Opens the review"
          />
        )}
      />
      {any ? <Dock gutter={gutter} search={{ value: query, onChange: setQuery, placeholder: "Search pull requests" }} /> : null}
    </>
  )
}
