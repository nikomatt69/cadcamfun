import { useCallback } from "react"
import { Stack, useLocalSearchParams } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { ToolpathReview } from "@/components/workspace/ToolpathReview"
import { routeParam } from "@/components/workspace/route"

export default function ToolpathScreen() {
  const params = useLocalSearchParams<{ id: string; toolpathId: string; name?: string }>()
  const id = routeParam(params.id)
  const toolpathId = routeParam(params.toolpathId)
  const name = routeParam(params.name) || "Toolpath"
  const { client } = useServer()
  const revision = useCommitRevision(id)

  const review = useResource(
    useCallback(
      (signal) => (client ? client.toolpathReview(id, toolpathId, signal) : Promise.reject(new Error("Not connected"))),
      [client, id, toolpathId],
    ),
    `toolpath:${id}:${toolpathId}:${revision}`,
  )
  const preview = useResource(
    useCallback(
      (signal) => (client ? client.toolpathPreview(id, toolpathId, signal) : Promise.reject(new Error("Not connected"))),
      [client, id, toolpathId],
    ),
    `toolpath-preview:${id}:${toolpathId}:${revision}`,
  )

  return (
    <>
      <Stack.Screen options={{ title: review.data?.name || name, headerLargeTitle: false }} />
      <ToolpathReview
        review={review.data}
        preview={preview.data}
        loading={review.loading || preview.loading}
        error={review.error ?? preview.error}
        onRetry={() => {
          void review.reload()
          void preview.reload()
        }}
      />
    </>
  )
}
