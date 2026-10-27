/**
 * The three CAM hot paths of `bun run bench:cam` (spec 55 §3.1): sampled stock removal, the drop-cutter grid and G-code
 * verification. Shared by `bench:cam` and the bench cases so both measure the same work. Each returns a checksum.
 */
import { HeightField } from "../../src/cam/verify/heightfield.ts"
import { verifyToolpath } from "../../src/cam/verify/verify.ts"
import { sampleNodes } from "../../src/cam/operations/surface-field.ts"

export const CAM_STOCK = { minX: -25, maxX: 25, minY: -20, maxY: 20, minZ: -12, maxZ: 0 }

const gcode = ["G21", "G90", "G0 X-24 Y-19 Z2", "G1 Z-2 F200"]
for (let row = 0; row < 600; row++) {
  const y = -19 + row * 0.05
  const x = row % 2 === 0 ? 24 : -24
  gcode.push(`G1 X${x} Y${y.toFixed(3)} F600`)
}
export const CAM_GCODE_LINES = gcode.length
const program = gcode.join("\n")

export const CAM_WORKLOADS: Readonly<Record<string, () => number>> = {
  "stock-removal": () => {
    const field = new HeightField(500, 400, -25, -20, 50, 40, -12, 0)
    const cutter = { radius: 3, flat: false, profile: (r: number) => 3 - Math.sqrt(Math.max(0, 9 - r * r)) }
    for (let i = 0; i < 2_400; i++) field.cut(cutter, -24 + (i % 160) * 0.3, -19 + Math.floor(i / 160) * 0.03, -2)
    return field.volume()
  },
  "drop-cutter-grid": () => {
    const samples = sampleNodes((x, y) => 2 * Math.sin(x / 12) * Math.cos(y / 9), { x0: -50, y0: -40, x1: 50, y1: 40 }, 0.15)
    return samples.reduce((sum, value) => sum + value * value, 0)
  },
  "gcode-verification": () => {
    const result = verifyToolpath({ gcode: program, stock: CAM_STOCK, tool: { kind: "endmill", diameter: 6 }, fixtures: [], tolerance: 0.05, resolution: 0.5 })
    if (!result.ok) throw new Error(`verification fixture was rejected: ${result.issues.map((issue) => issue.message).join("; ")}`)
    return result.stats.removedVolume
  }
}
