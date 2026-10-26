import { useCallback, useMemo, useState } from "react"
import { Play, Search, Workflow } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { duration, relativeTime, runStatusLabel } from "@/lib/format"
import { matchesRun, projectMeta, sectionByDay, sortRuns, timeOf } from "@/lib/project-list"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { RowList } from "./RowList"
import { FlatRow } from "./rows"
import { Dock } from "./Dock"

const STATUS_TONE: Record<string, PillTone> = { queued: "info", running: "warning", success: "success", failure: "danger" }

/** Workflow runs as flat rows under day headings, with the run action and the search in the dock. */
export function ActionsPanel({ client, projectId, refreshKey, onDispatch, dispatching }: {
  client: CompanionClient; projectId: string; refreshKey: number; onDispatch: () => void; dispatching: boolean
}) {
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const [query, setQuery] = useState("")
  const runs = useResource(useCallback((signal) => client.runs(projectId, signal), [client, projectId]), `runs:${projectId}:${refreshKey}`)
  const sections = useMemo(() => sectionByDay(sortRuns(runs.data ?? []).filter((run) => matchesRun(run, query)), (run) => timeOf(run.startedAt)), [runs.data, query])
  const total = runs.data?.length ?? 0
  const empty = query.trim() && total > 0 ? (
    <EmptyState title="No matches" description={`No run mentions “${query.trim()}”.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <EmptyState title="No workflow runs" description="Workflows check commits and pull requests. Start a run to validate the current project." icon={<Workflow size={25} color={palette.accent} />} />
  )
  return (
    <>
      <RowList
        source={runs}
        sections={sections}
        keyExtractor={(item) => item.id}
        loadingLabel="Loading workflow runs"
        failureTitle="Could not load the runs"
        empty={empty}
        renderRow={(item) => (
          <FlatRow
            leading={<Workflow size={19} color={palette.muted} strokeWidth={2} />}
            title={item.workflow}
            subtitle={`${item.event} · ${item.ref}`}
            meta={projectMeta([relativeTime(item.startedAt), item.finishedAt ? duration(item.startedAt, item.finishedAt) : null])}
            trailing={<Pill tone={STATUS_TONE[item.status] ?? "neutral"}>{runStatusLabel(item.status)}</Pill>}
          />
        )}
      />
      <Dock
        gutter={gutter}
        {...(total > 0 ? { search: { value: query, onChange: setQuery, placeholder: "Search runs" } } : {})}
        action={{ label: total > 0 ? "Run" : "Run workflows", icon: <Play size={16} color={palette.onAccent} strokeWidth={2.4} fill={palette.onAccent} />, onPress: onDispatch, loading: dispatching }}
      />
    </>
  )
}
