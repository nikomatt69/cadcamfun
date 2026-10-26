import { useCallback } from "react"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Calculator } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { useServer } from "@/lib/server"
import { useResource, useRetained } from "@/lib/use-resource"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { ToolpathReview } from "@/components/workspace/ToolpathReview"
import { routeParam } from "@/components/workspace/route"
import { ScreenFrame } from "@/components/project/ScreenFrame"

export default function ToolpathScreen() {
  const router = useRouter()
  const { palette } = useTheme()
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

  const scope = `toolpath:${id}:${toolpathId}`
  const reviewData = useRetained(review.data, scope)
  const previewData = useRetained(preview.data, scope)

  return (
    <ScreenFrame title={reviewData?.name || name} right={<IconCircleButton tone="warm" accessibilityLabel="Calculate production cost" accessibilityHint="Opens the cost calculator for this toolpath" onPress={() => router.push({ pathname: "/settings/costs", params: { projectId: id, toolpathId } })}><Calculator size={19} color={palette.accent} strokeWidth={2.2} /></IconCircleButton>}>
      <ToolpathReview
        review={reviewData}
        preview={previewData}
        loading={review.loading || preview.loading}
        error={review.error ?? preview.error}
        onRetry={() => {
          void review.reload()
          void preview.reload()
        }}
      />
    </ScreenFrame>
  )
}
