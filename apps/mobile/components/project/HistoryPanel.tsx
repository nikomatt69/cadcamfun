import { useCallback } from "react"
import { useRouter } from "expo-router"
import { GitCommitHorizontal, History } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { commitTime, commitTitle, relativeTime, shortOid } from "@/lib/format"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

export function HistoryPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const router = useRouter()
  const log = useResource(useCallback((signal) => client.log(projectId, 100, signal), [client, projectId]), `log:${projectId}:${refreshKey}`)
  return <ResourceList resource={log} keyExtractor={(item) => item.oid}
    loadingLabel="Loading commit history" emptyTitle="No commits yet"
    emptyDescription="Commit from the Overview tab or let the assistant open a pull request."
    emptyIcon={<History size={25} color={palette.accent} />}
    renderItem={({ item }) => <RecordCard
      leading={<GitCommitHorizontal size={20} color={palette.accent} />}
      title={commitTitle(item.message)} subtitle={item.author.name}
      meta={`${shortOid(item.oid)} · ${relativeTime(commitTime(item.author.time))}`}
      onPress={() => router.push(`/projects/${projectId}/commit/${item.oid}`)}
    />}
  />
}
