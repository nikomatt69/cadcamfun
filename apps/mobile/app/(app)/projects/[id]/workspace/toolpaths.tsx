import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import type { CompanionClient } from "@/lib/client"
import { useServer } from "@/lib/server"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { EntryList } from "@/components/workspace/EntryList"
import { routeParam } from "@/components/workspace/route"

const loadToolpaths = (client: CompanionClient, projectId: string, signal: AbortSignal) => client.workspaceToolpaths(projectId, signal)

export default function ToolpathsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const router = useRouter()
  const revision = useCommitRevision(id)

  if (!client) return null

  return (
    <>
      <Stack.Screen options={{ title: "Toolpaths", headerLargeTitle: false }} />
      <EntryList
        client={client}
        projectId={id}
        revision={revision}
        load={loadToolpaths}
        emptyTitle="No toolpaths"
        emptyDescription="Toolpaths saved on the desktop open here with the path and the G-code."
        onOpen={(entry) => {
          router.push(`/projects/${id}/workspace/toolpaths/${entry.id}?name=${encodeURIComponent(entry.name)}`)
        }}
      />
    </>
  )
}
