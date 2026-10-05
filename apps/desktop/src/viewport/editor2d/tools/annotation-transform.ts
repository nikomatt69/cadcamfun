import { baseEntity, mirror, rotateEntity, scaleUniform, translate, type Entity, type Vec2 } from "@cadcamfun/core"
import { addEntities, batch, updateEntity } from "../../../state/commands.ts"
import type { Tool, ToolContext, ToolFactory } from "./tool.ts"

export type GestureToolId = "text" | "dimension" | "move" | "rotate" | "scale" | "mirror"

export const gestureTool = (id: GestureToolId, context: () => ToolContext, text: () => string = () => "Text"): ToolFactory => {
  const build = (from?: Vec2, to?: Vec2, done = false): Tool => {
    const entities = (): Entity[] => {
      if (!from || !to) return []
      if (id === "text") return [{ ...baseEntity("text-preview"), _tag: "Text", position: from, text: text(), fontSize: 3, fontFamily: "sans-serif", rotation: 0, alignment: "left", baseline: "bottom" }]
      const dx = to.x - from.x, dy = to.y - from.y
      if (Math.hypot(dx, dy) < 1e-6) return []
      if (id === "dimension") return [{ ...baseEntity("dimension-preview"), _tag: "Dimension", start: from, end: to, text: Math.hypot(dx, dy).toFixed(2), textPosition: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 3 }, arrowSize: 1, textSize: 3, dimensionType: "aligned" }]
      return context().selection.flatMap(key => {
        const e = context().entity(key)
        if (!e || e.locked) return []
        if (id === "move") return [translate(e, { x: dx, y: dy })]
        if (id === "rotate") return [rotateEntity(e, Math.atan2(dy, dx), from)]
        if (id === "scale") return [scaleUniform(e, Math.hypot(dx, dy) / 10, from)]
        return [mirror(e, from, Math.atan2(dy, dx))]
      })
    }
    return {
      id, status: { hint: id === "text" ? "Place text; type to edit" : "Drag from the anchor (scale: 10 mm = 1x)", ready: done },
      start: () => build(), onPointerDown: e => build(e.point, e.point),
      onPointerMove: e => build(from, from ? e.point : undefined), onPointerUp: e => build(from, e.point, true),
      onKey: key => key === "Escape" ? build() : build(from, to, done), preview: entities,
      command: () => {
        const result = entities()
        if (!done || !result.length) return undefined
        return id === "text" || id === "dimension" ? addEntities(result, id) : batch(id, result.map(e => updateEntity(e.id, e, id)))
      }
    }
  }
  return () => build()
}
