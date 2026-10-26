import { useLocalSearchParams, useRouter } from "expo-router"
import type { CompanionClient } from "@/lib/client"
import { useServer } from "@/lib/server"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { DraftingCompass } from "lucide-react-native"
import { EntryList } from "@/components/workspace/EntryList"
import { routeParam } from "@/components/workspace/route"
import { ScreenFrame } from "@/components/project/ScreenFrame"

const loadDrawings = (client: CompanionClient, projectId: string, signal: AbortSignal) => client.workspaceDrawings(projectId, signal)

export default function DrawingsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const router = useRouter()
  const revision = useCommitRevision(id)

  if (!client) return null

  return (
    <ScreenFrame title="Designs">
      <EntryList
        icon={DraftingCompass}
        client={client}
        projectId={id}
        revision={revision}
        load={loadDrawings}
        emptyTitle="No designs"
        emptyDescription="Designs saved on the desktop show up here as a 3D preview."
        searchPlaceholder="Search designs"
        manage={{ kind: "drawings", noun: "design" }}
        onOpen={(entry) => {
          router.push(`/projects/${id}/workspace/drawings/${entry.id}?name=${encodeURIComponent(entry.name)}`)
        }}
      />
    </ScreenFrame>
  )
}
