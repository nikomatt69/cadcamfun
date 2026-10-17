import { useCallback } from "react"
import { Text } from "react-native"
import { Box } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

export function EntryList({ client, projectId, revision, load, emptyTitle, emptyDescription, onOpen }: {
  client: CompanionClient
  projectId: string
  revision: number
  load: (client: CompanionClient, projectId: string, signal: AbortSignal) => Promise<readonly WorkspaceEntry[]>
  emptyTitle: string
  emptyDescription: string
  onOpen: (entry: WorkspaceEntry) => void
}) {
  const { palette } = useTheme()
  const resource = useResource(useCallback((signal) => load(client, projectId, signal), [client, projectId, load]), `entries:${projectId}:${revision}`)
  const count = resource.data?.length ?? 0
  return <ResourceList resource={resource} keyExtractor={(item) => item.id}
    emptyTitle={emptyTitle} emptyDescription={emptyDescription} emptyIcon={<Box size={26} color={palette.accent} />}
    header={count > 0 ? <Text style={{ color: palette.muted, fontSize: 13 }}>{count} {count === 1 ? "item" : "items"} · Synced from your desktop</Text> : null}
    renderItem={({ item }) => <RecordCard title={item.name} subtitle={item.subtitle ?? undefined}
      leading={<Box size={21} color={palette.accent} />} onPress={() => onOpen(item)} />}
  />
}
