import { applyTransform, IDENTITY_AFFINE, isClosedShape, tessellate, type Entity, type Vec2 } from "@cadcamfun/core"
import { worldToScreen, type Camera } from "./camera.ts"

export const renderEntity = (entity: Entity): Entity => applyTransform(entity, IDENTITY_AFFINE)
export const entityPaths = (entity: Entity, tolerance = 0.1): Vec2[][] => {
  const e = renderEntity(entity)
  return tessellate(e, tolerance).map(points => {
    const first = points[0]
    return isClosedShape(e) && first ? [...points, first] : points
  })
}

export const outlineDistance = (entity: Entity, cursor: Vec2): number => {
  let best = Infinity
  for (const points of entityPaths(entity)) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(cursor.x - a.x - t * dx, cursor.y - a.y - t * dy))
    }
  }
  return best
}

export const paintEntity = (ctx: CanvasRenderingContext2D, entity: Entity, camera: Camera): void => {
  const e = renderEntity(entity)
  ctx.beginPath()
  for (const points of entityPaths(e, 0.5 / camera.scale)) {
    points.forEach((point, i) => {
      const p = worldToScreen(camera, point)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
  }
  ctx.stroke()
  if (e._tag === "Text" || e._tag === "Dimension") {
    const p = worldToScreen(camera, e._tag === "Text" ? e.position : e.textPosition)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(e._tag === "Text" ? -e.rotation : 0)
    ctx.font = `${(e._tag === "Text" ? e.fontSize : e.textSize) * camera.scale}px ${e._tag === "Text" ? e.fontFamily : "sans-serif"}`
    ctx.textAlign = e._tag === "Text" ? e.alignment : "center"
    ctx.textBaseline = e._tag === "Text" ? e.baseline : "middle"
    ctx.fillStyle = ctx.strokeStyle
    ctx.fillText(e.text, 0, 0)
    ctx.restore()
  }
}
