/**
 * Every solid the assistant can create from the element catalogue, and every parametric part it validates, must be a real solid:
 * closed, one shell, as many through holes as the object has. The report the assistant reads says so per body.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { cam, cleanMesh, meshTopology } from "@cadcamfun/core"
import { ELEMENT_SPECS, ELEMENT_TYPES, normalizeElement } from "../src/element-catalog.ts"
import { parametricReport } from "../src/parametric.ts"

setDefaultTimeout(60_000)

/** Types with no solid of their own: flat shapes and curves (machined along their outline), text (engraved), containers. */
const NOT_SOLID = new Set(["circle", "rectangle", "triangle", "polygon", "ellipse", "arc", "line", "spline", "bezier", "nurbs", "text3d", "component", "group"])
/** Solids with a hole through them. */
const GENUS_ONE = new Set(["torus", "gear", "nut", "washer"])

const build = (type: string): Record<string, unknown> => {
  const spec = ELEMENT_SPECS[type as keyof typeof ELEMENT_SPECS] as { defaults: Record<string, unknown>; required?: ReadonlyArray<string> }
  const input: Record<string, unknown> = { type }
  for (const key of spec.required ?? []) input[key] = spec.defaults[key]
  if (type === "mesh") { input["vertices"] = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 10 }]; input["faces"] = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]] }
  if (type === "parametric") input["history"] = { parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 10, height: 10 }] } }, { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" }] }
  const normalized = normalizeElement(input)
  if (!normalized.ok) throw new Error(`${type}: ${normalized.error}`)
  return normalized.element
}

describe("every catalogue solid is a closed solid with its real number of holes", () => {
  for (const type of ELEMENT_TYPES.filter((t) => !t.startsWith("boolean-") && !NOT_SOLID.has(t))) {
    test(type, () => {
      const m = cam.model.elementMesh(build(type), 0.05)
      expect(m, `${type} mesh`).toBeDefined()
      const t = meshTopology(cleanMesh({ positions: Float32Array.from(m!.positions), indices: m!.indices }, { mergeCoplanar: false }))
      expect({ solid: t.solid, shells: t.shells, genus: t.genus }, type).toEqual({ solid: true, shells: 1, genus: GENUS_ONE.has(type) ? 1 : 0 })
      expect(t.volume).toBeCloseTo(cam.model.volumeOf(m!), 0)
    })
  }
})

describe("the parametric report tells the assistant what each body is as a solid", () => {
  const plate = (holes: number) => ({
    parameters: {},
    features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 100, height: 40 }] } },
      { id: "plate", type: "extrude", sketch: "s", depth: 8, operation: "new" },
      ...Array.from({ length: holes }, (_, k) => ({ id: `h${k}`, type: "hole", plane: "XY", offset: 8, at: [15 + k * 20, 20], diameter: 6, depth: 8 }))
    ]
  })

  test("a plate with four through holes: one closed solid with 4 through holes", () => {
    const report = parametricReport(plate(4) as never)
    expect(report.ok).toBe(true)
    expect(report.solids).toHaveLength(1)
    expect(report.solids[0]).toMatchObject({ id: "plate", closedSolid: true, shells: 1, throughHoles: 4 })
    expect(report.solids[0]!.summary).toMatch(/^closed solid, 1 shell, genus 4/)
  })

  test("a blind hole is not a through hole, and the report says so", () => {
    const h = plate(1)
    ;(h.features[2] as { depth: number }).depth = 4
    const report = parametricReport(h as never)
    expect(report.solids[0]).toMatchObject({ closedSolid: true, throughHoles: 0 })
  })
})
