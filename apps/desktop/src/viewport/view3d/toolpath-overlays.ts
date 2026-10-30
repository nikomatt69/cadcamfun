import { cam, type Vec3 } from "@cadcamfun/core"

export type ToolpathPointKind = "rapid" | "cut" | "arc" | "cycle"

export interface ToolpathPointOverlay {
  readonly index: number
  readonly position: Vec3
  readonly kind: ToolpathPointKind
}

export interface ToolpathArcOverlay {
  readonly from: Vec3
  readonly to: Vec3
  readonly center: Vec3
  readonly radius: number
}

export interface ToolpathOverlayModel {
  readonly points: readonly ToolpathPointOverlay[]
  readonly arcs: readonly ToolpathArcOverlay[]
  readonly moveCount: number
}

/** Extracts the inspection geometry shown by the CAM visualizer settings panel. */
export const toolpathOverlayModel = (program: cam.Program): ToolpathOverlayModel => {
  const points: ToolpathPointOverlay[] = []
  const arcs: ToolpathArcOverlay[] = []
  let from: Vec3 = { x: 0, y: 0, z: 0 }
  let moveCount = 0

  for (const path of program.toolpaths) {
    for (const move of path.moves) {
      if (move._tag === "Comment" || move._tag === "Orient" || move._tag === "Dwell" || move._tag === "SpindleOrient" || cam.isControlNode(move)) continue
      if (move._tag === "Cycle") {
        points.push({ index: points.length, position: move.to, kind: "cycle" })
        from = move.to
        moveCount++
        continue
      }
      const kind: ToolpathPointKind = move._tag === "Rapid" ? "rapid" : move._tag === "Arc" ? "arc" : "cut"
      points.push({ index: points.length, position: move.to, kind })
      if (move._tag === "Arc") {
        const center = { x: move.center.x, y: move.center.y, z: from.z }
        arcs.push({ from, to: move.to, center, radius: Math.hypot(from.x - center.x, from.y - center.y) })
      }
      from = move.to
      moveCount++
    }
  }
  return { points, arcs, moveCount }
}
