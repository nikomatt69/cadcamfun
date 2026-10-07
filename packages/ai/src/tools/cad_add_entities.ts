import { z } from "zod"
import { EntityInput } from "../domain-schemas.ts"
import { defineTool, validated } from "./define.ts"

const point = z.object({ x: z.number(), y: z.number(), z: z.number().optional() })
const label = { layer: z.string().min(1).optional(), name: z.string().min(1).optional(), color: z.string().min(1).optional() }

export const entityZod = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), start: point, end: point, ...label }),
  z.object({ type: z.literal("circle"), center: point, radius: z.number().positive(), ...label }),
  z.object({ type: z.literal("arc"), center: point, radius: z.number().positive(), startAngle: z.number(), endAngle: z.number(), ...label }),
  z.object({ type: z.literal("polyline"), points: z.array(point).min(2), closed: z.boolean().optional(), ...label }),
  z.object({ type: z.literal("rectangle"), origin: point, width: z.number().positive(), height: z.number().positive(), ...label })
])

/** Flat 2D sketch entities. */
export const cadAddEntities = defineTool("cad_add_entities", {
  parameters: z.object({ entities: z.array(entityZod).min(1).max(500) }),
  execute: ({ entities }, { handlers, projectId }) => handlers.addEntities(projectId, entities.map((e) => validated(EntityInput, e)))
})
