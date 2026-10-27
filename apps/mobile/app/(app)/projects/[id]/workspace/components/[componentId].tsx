import { useCallback, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource, useRetained } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { haptic } from "@/lib/haptics"
import { changeComponentPrompt } from "@/lib/preview-math"
import { MeshReview } from "@/components/workspace/MeshReview"
import { routeParam } from "@/components/workspace/route"
import { ScreenFrame } from "@/components/project/ScreenFrame"

export default function ComponentPreviewScreen() {
  const params = useLocalSearchParams<{ id: string; componentId: string; name?: string }>()
  const id = routeParam(params.id)
  const componentId = routeParam(params.componentId)
  const name = routeParam(params.name) || "Component"
  const { client } = useServer()
  const router = useRouter()
  const setAssistantDraft = useUIStore((state) => state.setAssistantDraft)
  const revision = useCommitRevision(id)
  const [selected, setSelected] = useState<string | undefined>()

  const preview = useResource(
    useCallback(
      (signal) => (client ? client.componentPreview(id, componentId, signal) : Promise.reject(new Error("Not connected"))),
      [client, id, componentId],
    ),
    `component:${id}:${componentId}:${revision}`,
  )

  const mesh = useRetained(preview.data, `component:${id}:${componentId}`)

  const proposeChange = () => {
    if (!mesh) return
    haptic("selection")
    setAssistantDraft({
      projectId: id,
      mode: "cad",
      text: changeComponentPrompt({ id: componentId, name }),
    })
    router.navigate("/assistant/chat")
  }

  return (
    <ScreenFrame title={name}>
      <MeshReview
        title={name}
        mesh={mesh}
        loading={preview.loading}
        error={preview.error}
        onRetry={() => void preview.reload()}
        parameters={mesh?.parameters}
        features={mesh?.features}
        selectedPartId={selected}
        onSelectPart={setSelected}
        actionLabel="Propose a change"
        onAction={proposeChange}
      />
    </ScreenFrame>
  )
}
