/**
 * Tri-dexel stock workloads (spec 69 B1): a 100 x 100 x 50 mm stock at the 0.1 mm cell (1000 x 1000 x 500 lattice, 2 million rays),
 * built and then cut by a Ø6 ball along a zig-zag pocket pass. Each returns a checksum so the work cannot be skipped.
 */
import type { Cutter } from "../../src/cam/kernel/cutters.ts"
import { TriDexel, toolSolid } from "../../src/cam/kernel/tridexel.ts"

const ball6: Cutter = { id: "ball6", name: "ball 6", kind: "ball", diameter: 6, flutes: 2, material: "carbide", coating: "none", fluteLength: 12, shankDiameter: 6, stickout: 30 }

const min = { x: 0, y: 0, z: 0 }, max = { x: 100, y: 100, z: 50 }

export const TRIDEXEL_WORKLOADS: Readonly<Record<string, () => number>> = {
  "tridexel-build-100x100x50": () => TriDexel.box(min, max, 0.1).volume(),
  "tridexel-pocket-pass": () => {
    const s = TriDexel.box(min, max, 0.2)
    const tool = toolSolid(ball6)
    // 20 zig-zag rows 3 mm apart across a 50 x 40 pocket, 4 mm deep.
    const tips: Array<{ x: number; y: number; z: number }> = []
    for (let row = 0; row < 14; row++) {
      const y = 30 + row * 3, x0 = row % 2 === 0 ? 25 : 75, x1 = row % 2 === 0 ? 75 : 25
      tips.push({ x: x0, y, z: 46 }, { x: x1, y, z: 46 })
    }
    s.removePath(tool, tips)
    return s.volume() + s.errorBound
  }
}
