import { useLocalSearchParams, useRouter } from "expo-router"
import type { CompanionClient } from "@/lib/client"
import { useServer } from "@/lib/server"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { Route } from "lucide-react-native"
import { EntryList } from "@/components/workspace/EntryList"
import { routeParam } from "@/components/workspace/route"
import { ScreenFrame } from "@/components/project/ScreenFrame"

const loadToolpaths = (client: CompanionClient, projectId: string, signal: AbortSignal) => client.workspaceToolpaths(projectId, signal)

export default function ToolpathsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const router = useRouter()
  const revision = useCommitRevision(id)

  if (!client) return null

  return (
    <ScreenFrame title="Toolpaths">
      <EntryList
        icon={Route}
        client={client}
        projectId={id}
        revision={revision}
        load={loadToolpaths}
        emptyTitle="No toolpaths"
        emptyDescription="Toolpaths saved on the desktop open here with the path and the G-code."
        searchPlaceholder="Search toolpaths"
        manage={{ kind: "toolpaths", noun: "toolpath" }}
        onOpen={(entry) => {
          router.push(`/projects/${id}/workspace/toolpaths/${entry.id}?name=${encodeURIComponent(entry.name)}`)
        }}
      />
    </ScreenFrame>
  )
}
