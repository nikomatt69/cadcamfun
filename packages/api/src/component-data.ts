// Port of `validateComponentData` / `normalizeComponentData` from the legacy `src/types/component.ts`.
import { z } from "zod"

const num = z.number()
const rotation = z.object({ x: num, y: num, z: num }).optional()
const base = z.object({
  id: z.string(), name: z.string(), type: z.string(),
  x: num.nullable(), y: num.nullable(), z: num.nullable(),
  layerId: z.string(), description: z.string().optional()
})
const withDefaults = <T extends { x: number | null; y: number | null; z: number | null }>(d: T) =>
  ({ ...d, x: d.x ?? 0, y: d.y ?? 0, z: d.z ?? 0 })

const cylinder = base.extend({ type: z.literal("cylinder"), color: z.string(), depth: num, width: num, height: num, radius: num, rotation }).transform(withDefaults)
const cube = base.extend({ type: z.literal("cube"), color: z.string(), depth: num, width: num, height: num, radius: num.optional(), rotation }).transform(withDefaults)
const rectangle = base.extend({ type: z.literal("rectangle"), color: z.string(), width: num, height: num, depth: num.optional(), radius: num.optional(), linewidth: num.optional(), rotation }).transform(withDefaults)
const line = base.extend({ type: z.literal("line"), color: z.string(), linewidth: num, x1: num, y1: num, z1: num, x2: num, y2: num, z2: num }).transform(withDefaults)
const circle = base.extend({ type: z.literal("circle"), color: z.string(), radius: num, segments: num.optional(), linewidth: num.optional() }).transform(withDefaults)

export const componentElementSchema = z.union([
  cylinder, cube, rectangle, line, circle,
  // Any other element type: base fields + arbitrary extras.
  base.catchall(z.any()).transform(withDefaults)
])

export const componentDataSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  version: z.string().optional(),
  elements: z.array(componentElementSchema).optional(),
  geometry: z.object({ type: z.string(), elements: z.array(z.any()) }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  properties: z.record(z.string(), z.any()).optional()
}).catchall(z.any())

export type ComponentData = z.infer<typeof componentDataSchema>

/** Fills the fields every stored component must have (legacy defaults). */
export function normalizeComponentData(data: Record<string, unknown>): Record<string, unknown> {
  return {
    id: data.id || "",
    name: data.name || "Unnamed Component",
    type: data.type || "custom",
    version: data.version || "1.0",
    elements: data.elements || [],
    geometry: data.geometry || { type: "custom", elements: [] },
    metadata: data.metadata || { createdAt: new Date().toISOString() },
    properties: data.properties || {},
    ...data
  }
}

export function validateComponentData(data: unknown): { valid: boolean; data?: Record<string, unknown>; errors?: string[] } {
  try {
    const result = componentDataSchema.safeParse(data)
    if (result.success) return { valid: true, data: normalizeComponentData(result.data as Record<string, unknown>) }
    return { valid: false, errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) }
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : "Unknown validation error"] }
  }
}
