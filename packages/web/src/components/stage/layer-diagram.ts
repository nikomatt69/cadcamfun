import type { Point, Rect } from "../../stageshow/kit/measure"

/** Connect the importing layer to the layer it depends on. */
export function dependencyConnector(source: Rect, target: Rect, vertical: boolean): { from: Point; to: Point } | undefined {
  if (!source.width || !source.height || !target.width || !target.height) return undefined
  return vertical
    ? { from: { x: source.x + source.width / 2, y: source.y - 3 }, to: { x: target.x + target.width / 2, y: target.y + target.height + 3 } }
    : { from: { x: source.x - 4, y: source.y + source.height / 2 }, to: { x: target.x + target.width + 4, y: target.y + target.height / 2 } }
}
