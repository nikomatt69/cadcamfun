import { useCallback, useState } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource, useRetained } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { haptic } from "@/lib/haptics"
import { defineComponentPrompt } from "@/lib/preview-math"
import { MeshReview } from "@/components/workspace/MeshReview"
import { routeParam } from "@/components/workspace/route"
import { ScreenFrame } from "@/components/project/ScreenFrame"

export default function DrawingPreviewScreen() {
  const params = useLocalSearchParams<{ id: string; drawingId: string; name?: string }>()
  const id = routeParam(params.id)
  const drawingId = routeParam(params.drawingId)
  const name = routeParam(params.name) || "Design"
  const { client } = useServer()
  const router = useRouter()
  const setAssistantDraft = useUIStore((state) => state.setAssistantDraft)
  const revision = useCommitRevision(id)
  const [selected, setSelected] = useState<string | undefined>()

  const preview = useResource(
    useCallback(
      (signal) => (client ? client.drawingPreview(id, drawingId, signal) : Promise.reject(new Error("Not connected"))),
      [client, id, drawingId],
    ),
    `drawing:${id}:${drawingId}:${revision}`,
  )

  const mesh = useRetained(preview.data, `drawing:${id}:${drawingId}`)

  const defineWithAssistant = () => {
    if (!mesh) return
    haptic("selection")
    setAssistantDraft({
      projectId: id,
      mode: "cad",
      text: defineComponentPrompt({ id: drawingId, name }, selected ? [selected] : []),
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
        features={mesh?.features}
        selectedPartId={selected}
        onSelectPart={setSelected}
        actionLabel="Define with the assistant"
        onAction={defineWithAssistant}
      />
    </ScreenFrame>
  )
}
