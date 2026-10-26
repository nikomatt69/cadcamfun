import { useCallback, useMemo, useState } from "react"
import { useRouter } from "expo-router"
import { GitCommitHorizontal, History, Search } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { commitTime, commitTitle, relativeTime, shortOid } from "@/lib/format"
import { commitMillis, matchesCommit, projectMeta, sectionByDay } from "@/lib/project-list"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { RowList } from "./RowList"
import { FlatRow } from "./rows"
import { Dock } from "./Dock"

/** The project's commits as flat rows under day headings, newest first, searchable by message, author or oid. */
export function HistoryPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const log = useResource(useCallback((signal) => client.log(projectId, 100, signal), [client, projectId]), `log:${projectId}:${refreshKey}`)
  const sections = useMemo(() => sectionByDay((log.data ?? []).filter((commit) => matchesCommit(commit, query)), (commit) => commitMillis(commit.author.time)), [log.data, query])
  const total = log.data?.length ?? 0
  const empty = query.trim() && total > 0 ? (
    <EmptyState title="No matches" description={`No commit mentions “${query.trim()}”.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <EmptyState title="No commits yet" description="Commit from the Overview tab or let the assistant open a pull request." icon={<History size={25} color={palette.accent} />} />
  )
  return (
    <>
      <RowList
        source={log}
        sections={sections}
        keyExtractor={(item) => item.oid}
        loadingLabel="Loading commit history"
        failureTitle="Could not load the history"
        empty={empty}
        renderRow={(item) => (
          <FlatRow
            leading={<GitCommitHorizontal size={19} color={palette.muted} strokeWidth={2} />}
            title={commitTitle(item.message)}
            meta={projectMeta([item.author.name, shortOid(item.oid), relativeTime(commitTime(item.author.time))])}
            onPress={() => { haptic("selection"); router.push(`/projects/${projectId}/commit/${item.oid}`) }}
            accessibilityHint="Opens the changes of this commit"
          />
        )}
      />
      {total > 0 ? <Dock gutter={gutter} search={{ value: query, onChange: setQuery, placeholder: "Search commits" }} /> : null}
    </>
  )
}
