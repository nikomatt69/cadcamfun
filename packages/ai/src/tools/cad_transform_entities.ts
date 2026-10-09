import { z } from "zod"
import { defineTool } from "./define.ts"

const point = z.object({ x: z.number(), y: z.number(), z: z.number() })

/** Moves, turns and scales elements that already exist, or lays out copies of them: the editor's own transforms, by id. */
export const cadTransformEntities = defineTool("cad_transform_entities", {
  parameters: z.object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    dx: z.number().optional(),
    dy: z.number().optional(),
    dz: z.number().optional(),
    rotateAxis: z.enum(["x", "y", "z"]).optional(),
    rotateDegrees: z.number().optional(),
    scale: z.number().positive().optional(),
    about: point.optional(),
    copies: z.number().int().min(0).max(100).optional()
  }),
  execute: async ({ ids, dx, dy, dz, rotateAxis, rotateDegrees, scale, about, copies }, { handlers, projectId }) => {
    const move = dx !== undefined || dy !== undefined || dz !== undefined ? { x: dx ?? 0, y: dy ?? 0, z: dz ?? 0 } : undefined
    const rotate = rotateDegrees !== undefined && rotateDegrees !== 0 ? { axis: rotateAxis ?? "z", degrees: rotateDegrees, ...(about ? { about } : {}) } : undefined
    const scaling = scale !== undefined && scale !== 1 ? { factor: scale, ...(about ? { about } : {}) } : undefined
    if (move === undefined && rotate === undefined && scaling === undefined) {
      return { ok: false, error: "Nothing to do: give dx/dy/dz, rotateDegrees (with rotateAxis) or scale." }
    }
    if (about !== undefined && rotate === undefined && scaling === undefined) return { ok: false, error: "about only means something with rotateDegrees or scale." }
    return handlers.transformEntities(projectId, { ids, transform: { ...(scaling ? { scale: scaling } : {}), ...(rotate ? { rotate } : {}), ...(move ? { move } : {}) }, copies: copies ?? 0 })
  }
})
