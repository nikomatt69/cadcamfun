import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { buildPartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import { SurfaceParams, generateSurface } from "./surface.ts"
import { Surface, cutterOf } from "./surface-field.ts"

setDefaultTimeout(60000)

const ball = (d: number): Tool => ({ id: "b", name: "ball", kind: "ballnose", diameter: d, flutes: 2, maxRpm: 20000 })
const params = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(SurfaceParams)({ totalDepth: 12, stepdown: 3, ...extra })
const stock: Stock = { x: 24, y: 24, z: 12, origin: { x: -12, y: -12, z: 0 }, material: "aluminum" }
const sphere = () => buildPartModel([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: -10 }], { cell: 0.1, tolerance: 0.002 })!

describe("exact mesh contact for the surface strategies (spec 69 F1)", () => {
  test("the model carries its meshes, and a Surface with them is the exact drop-cutter, far tighter than the columns", () => {
    const part = sphere()
    expect(part.meshes?.length).toBe(1)
    const columns = new Surface(part.grid, part.dexels.top(-Infinity))
    const exact = new Surface(part.grid, part.dexels.top(-Infinity)).withMesh(part.meshes!)
    const cutter = cutterOf(ball(4))
    const expected = (rho: number) => Math.sqrt(12 ** 2 - rho ** 2) - 2 - 10
    let worstColumns = 0, worstExact = 0
    for (const rho of [0, 1.7, 3, 4.4, 6, 7.3, 8]) {
      worstColumns = Math.max(worstColumns, Math.abs(columns.tip(cutter, rho, 0.3) - Math.sqrt(144 - rho * rho - 0.09) + 12))
      const tip = exact.tip(cutter, rho, 0.3)
      worstExact = Math.max(worstExact, Math.abs(tip - (Math.sqrt(144 - rho * rho - 0.09) - 12)))
      // Inscribed mesh: never above the true offset surface, below it by about the chord tolerance.
      expect(tip).toBeLessThanOrEqual(expected(rho) + 0.004 * Math.hypot(rho, 0.3) / 10 + 1e-6 + 0.0005)
    }
    void expected
    expect(worstExact).toBeLessThan(0.006)
    expect(worstExact).toBeLessThan(worstColumns)
    expect(exact.tip(cutter, 30, 0)).toBe(-Infinity)
  })

  test("parallel finishing with contact: mesh follows the sphere within the mesh tolerance and is declared in the params", () => {
    const part = sphere()
    const run = (contact: "heightfield" | "mesh") => generateSurface(params({ strategy: "parallel", totalDepth: 11, stepdown: 11, scallop: 0.02, tolerance: 0.01, contact }), part, ball(4), stock)
    const mesh = run("mesh"), field = run("heightfield")
    expect(mesh.warnings.join(" ")).not.toMatch(/mesh contact/)
    let worst = 0, n = 0
    for (const m of mesh.toolpath.moves) {
      if (m._tag !== "Linear") continue
      const rho = Math.hypot(m.to.x, m.to.y)
      if (rho > 8.5) continue
      worst = Math.max(worst, Math.abs(m.to.z - (Math.sqrt(144 - rho * rho) - 12)))
      n++
    }
    expect(n).toBeGreaterThan(200)
    // 0.002 mesh chord + 0.01 path simplification, against 0.08 for the columns.
    expect(worst).toBeLessThan(0.02)
    expect(field.toolpath.moves.length).toBeGreaterThan(0)
  })

  test("a part without a plain mesh falls back to the height field and says so", () => {
    const part = { ...sphere(), meshes: undefined } as never
    const r = generateSurface(params({ strategy: "parallel", totalDepth: 11, stepdown: 11, scallop: 0.2, contact: "mesh" }), part, ball(4), stock)
    expect(r.warnings.some((w) => /mesh contact was asked for/.test(w))).toBe(true)
    expect(r.toolpath.moves.length).toBeGreaterThan(0)
  })
})
