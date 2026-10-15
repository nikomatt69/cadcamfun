import { useCallback, useState } from "react"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { haptic } from "@/lib/haptics"
import { defineComponentPrompt } from "@/lib/preview-math"
import { MeshReview } from "@/components/workspace/MeshReview"
import { routeParam } from "@/components/workspace/route"

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

  const defineWithAssistant = () => {
    if (!preview.data) return
    haptic("selection")
    setAssistantDraft({
      projectId: id,
      mode: "cad",
      text: defineComponentPrompt({ id: drawingId, name }, selected ? [selected] : []),
    })
    router.navigate("/assistant")
  }

  return (
    <>
      <Stack.Screen options={{ title: name, headerLargeTitle: false }} />
      <MeshReview
        mesh={preview.data}
        loading={preview.loading}
        error={preview.error}
        onRetry={() => void preview.reload()}
        selectedPartId={selected}
        onSelectPart={setSelected}
        actionLabel="Define with the assistant"
        onAction={defineWithAssistant}
      />
    </>
  )
}
