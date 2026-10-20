import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import type { CompanionClient } from "@/lib/client"
import { useServer } from "@/lib/server"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { EntryList } from "@/components/workspace/EntryList"
import { routeParam } from "@/components/workspace/route"

const loadComponents = (client: CompanionClient, projectId: string, signal: AbortSignal) => client.workspaceComponents(projectId, signal)

export default function ComponentsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const router = useRouter()
  const revision = useCommitRevision(id)

  if (!client) return null

  return (
    <>
      <Stack.Screen options={{ title: "Components", headerLargeTitle: false }} />
      <EntryList
        client={client}
        projectId={id}
        revision={revision}
        load={loadComponents}
        emptyTitle="No components"
        emptyDescription="Components in this project open as a read-only 3D preview."
        searchPlaceholder="Search components"
        manage={{ kind: "components", noun: "component" }}
        onOpen={(entry) => {
          router.push(`/projects/${id}/workspace/components/${entry.id}?name=${encodeURIComponent(entry.name)}`)
        }}
      />
    </>
  )
}
