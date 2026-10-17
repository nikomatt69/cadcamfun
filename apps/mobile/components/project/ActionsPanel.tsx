import { useCallback } from "react"
import { Workflow } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { duration, relativeTime, runStatusLabel } from "@/lib/format"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { ActionButton } from "@/components/ui/ActionButton"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

const STATUS_TONE: Record<string, PillTone> = { queued: "info", running: "warning", success: "success", failure: "danger" }

export function ActionsPanel({ client, projectId, refreshKey, onDispatch, dispatching }: {
  client: CompanionClient; projectId: string; refreshKey: number; onDispatch: () => void; dispatching: boolean
}) {
  const { palette } = useTheme()
  const runs = useResource(useCallback((signal) => client.runs(projectId, signal), [client, projectId]), `runs:${projectId}:${refreshKey}`)
  return <ResourceList resource={runs} keyExtractor={(item) => item.id}
    loadingLabel="Loading workflow runs" emptyTitle="No workflow runs"
    emptyDescription="Workflows check commits and pull requests. Start a run to validate the current project."
    emptyIcon={<Workflow size={25} color={palette.accent} />}
    header={<ActionButton label="Run workflows" variant="secondary" onPress={onDispatch} loading={dispatching} />}
    renderItem={({ item }) => <RecordCard leading={<Workflow size={20} color={palette.accent} />}
      title={item.workflow} subtitle={`${item.event} · ${item.ref}`}
      meta={`${relativeTime(item.startedAt)}${item.finishedAt ? ` · ${duration(item.startedAt, item.finishedAt)}` : ""}`}
      status={<Pill tone={STATUS_TONE[item.status] ?? "neutral"}>{runStatusLabel(item.status)}</Pill>}
    />}
  />
}
