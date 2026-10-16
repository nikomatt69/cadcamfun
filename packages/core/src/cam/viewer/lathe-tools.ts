/**
 * Lathe tools as the preview draws them (spec 31 §5.3): flat outlines in the tool plane (display x = Z, display z = radius),
 * the programmed point at the origin, extruded `thickness` across y. A lathe tool does not turn: the outline is translated
 * to the program point and mirrored for a front turret.
 *
 *   turning / facing  80 degree rhombic insert (CNMG-like) pointing at the part, on a square shank going away from the axis
 *   threading         60 degree profile insert
 *   grooving / parting a blade `width` wide along Z
 *   boring            a round bar along +Z out of the bore, the insert cutting outwards
 */
export interface ToolOutline {
  readonly part: "insert" | "shank"
  /** Closed polygon, (x, z) display coordinates relative to the programmed point, rear turret. */
  readonly points: ReadonlyArray<{ readonly x: number; readonly z: number }>
  readonly thickness: number
}

const rhombus = (size: number, angleDeg: number, dirX: number, dirZ: number): Array<{ x: number; z: number }> => {
  // Tip at the origin, the long diagonal along (dirX, dirZ) pointing away from the tip.
  const len = Math.hypot(dirX, dirZ)
  const ux = dirX / len, uz = dirZ / len
  const half = (angleDeg * Math.PI) / 360
  const d = size // long diagonal
  const w = d * Math.tan(half) // short diagonal half-width at the middle
  const mx = ux * d / 2, mz = uz * d / 2
  return [{ x: 0, z: 0 }, { x: mx - uz * w / 2, z: mz + ux * w / 2 }, { x: ux * d, z: uz * d }, { x: mx + uz * w / 2, z: mz - ux * w / 2 }]
}

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

export const latheToolOutlines = (toolType: string, width: number): ReadonlyArray<ToolOutline> => {
  switch (toolType) {
    case "threading":
      return [
        { part: "insert", points: [{ x: 0, z: 0 }, { x: 4, z: 7 }, { x: -4, z: 7 }], thickness: 5 },
        { part: "shank", points: rect(-8, 7, 8, 70), thickness: 16 }
      ]
    case "grooving":
    case "parting": {
      const w = Math.max(0.5, width || 3)
      return [
        { part: "insert", points: rect(-w / 2, 0, w / 2, 25), thickness: 4 },
        { part: "shank", points: rect(-w / 2 - 6, 25, w / 2 + 6, 80), thickness: 16 }
      ]
    }
    case "boring":
      return [
        { part: "insert", points: rhombus(9, 55, 1, -1.2), thickness: 4 },
        { part: "shank", points: rect(4, -10, 140, -2), thickness: 10 }
      ]
    default:
      return [
        { part: "insert", points: rhombus(12, 80, 0.45, 1), thickness: 5 },
        { part: "shank", points: rect(2, 10, 22, 90), thickness: 20 }
      ]
  }
}
