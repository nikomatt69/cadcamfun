import { visionInputSchema } from "../vision.ts"
import { defineTool, ToolMediaResult } from "./define.ts"

export const camVision = defineTool("cam_vision", {
  parameters: visionInputSchema,
  execute: async (input, { handlers, projectId, signal }) => {
    if (!handlers.vision) return { ok: false, error: "Viewport capture is unavailable in this host." }
    const result = await handlers.vision(projectId, "cam", input.focus, signal)
    if (!result.ok) return result
    return new ToolMediaResult(result.evidence, [{ type: "file", mime: result.capture.mime, filename: "cam-viewport.png", url: `data:${result.capture.mime};base64,${result.capture.data}` }])
  }
})
