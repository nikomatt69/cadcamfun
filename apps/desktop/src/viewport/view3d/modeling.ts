import { isClosedShape, tessellate, type Drawing, type Solid } from "@cadcamfun/core"
import { renderEntity } from "../editor2d/render.ts"

/** Converts selected visible profiles to core solids; the caller owns undo and persistence. */
export function solidsFromProfiles(drawing: Drawing, selectedIds: readonly string[], operation: { readonly kind: "extrude"; readonly height: number } | { readonly kind: "revolve"; readonly angle: number }): readonly Solid[] {
  const value = operation.kind === "extrude" ? operation.height : operation.angle
  if (!Number.isFinite(value) || value === 0) return []
  const selected = new Set(selectedIds)
  const result: Solid[] = []
  for (const raw of drawing.entities) {
    if (!selected.has(raw.id) || !raw.visible || drawing.layers.find(layer => layer.id === raw.layerId)?.visible === false) continue
    const entity = renderEntity(raw)
    if (operation.kind === "extrude" && !isClosedShape(entity)) continue
    for (const points of tessellate(entity, .1)) {
      const first = points[0], last = points.at(-1)
      const profile = first && last && first.x === last.x && first.y === last.y ? points.slice(0, -1) : points
      if (operation.kind === "extrude" && profile.length >= 3) result.push({ _tag: "Extrude", profile, height: operation.height })
      if (operation.kind === "revolve" && profile.length >= 2) result.push({ _tag: "Revolve", profile, angle: operation.angle, segments: 64 })
    }
  }
  return result
}
