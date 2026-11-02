/**
 * Migration of old selections (names, points, geometric edge filters, a shell's `open`) to persistent references (spec 41 N4):
 * nothing is lost, the migrated history builds the same, keeps its entities through an edit, and the conversion is recorded.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { massProperties } from "./brep/mass.ts"
import { rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { migrateSelectionsToRefs } from "./history-refs-migrate.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(120_000)

const BASE = (w = 60, h = 40, t = 10): History => ({
  parameters: { w, h, t },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "s-r", kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } } as unknown as Feature,
    { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" } as Feature
  ]
})

const volumes = (history: History) => {
  const mesh = rebuild(history)
  const exact = rebuildExact(history, mesh)
  return {
    errors: mesh.issues.filter((i) => i.severity === "error").map((i) => `${i.feature}: ${i.message}`),
    meshVolume: mesh.bodies.reduce((s, b) => s + Math.abs(meshVolume(b.mesh)), 0),
    exactVolume: exact.bodies.reduce((s, b) => s + (b.brep === undefined ? NaN : massProperties(b.brep).volume), 0)
  }
}

const analytic = (w: number, h: number, t: number, r = 3, d = 8) => (w * h - 4 * r * r * (1 - Math.PI / 4) - Math.PI * (d / 2) ** 2) * t

const legacy = (): History => ({
  ...BASE(),
  features: [
    ...BASE().features,
    { id: "top", type: "plane", from: { kind: "face", near: [20, 20, 10], normal: [0, 0, 1] } } as Feature,
    { id: "bore", type: "hole", plane: "top", at: [0, 0], diameter: 8, depth: "t" } as Feature,
    { id: "round", type: "fillet", radius: 3, edges: { parallel: "z" } } as Feature
  ]
})

describe("migration of old selections to references", () => {
  test("every old selection gets its reference next to it, the history builds the same, and the conversion is recorded", () => {
    const before = volumes(legacy())
    expect(before.errors).toEqual([])
    const out = migrateSelectionsToRefs(legacy())
    expect(out.kept).toEqual([])
    const byFeature = Object.fromEntries(out.conversions.map((c) => [c.feature, c]))
    expect(byFeature["top"]!.to).toEqual(["face:plate|plate.top"])
    expect(byFeature["round"]!.to).toHaveLength(4)
    expect(byFeature["round"]!.to.every((r) => /^edge:plate\|edge\(plate\.side0\.\d,plate\.side0\.\d\)$/.test(r))).toBe(true)
    // Nothing was removed: the geometric selection and the point stay as the hint.
    const features = out.history.features as unknown as Array<Record<string, any>>
    expect(features.find((f) => f.id === "round")!.edges.parallel).toBe("z")
    expect(features.find((f) => f.id === "top")!.from.near).toEqual([20, 20, 10])
    expect(out.history.refMigration?.length).toBe(out.conversions.length)
    const after = volumes(out.history)
    expect(after.errors).toEqual(before.errors)
    expect(after.meshVolume).toBeCloseTo(before.meshVolume, 6)
    expect(after.exactVolume).toBeCloseTo(before.exactVolume, 6)
  })

  test("the migrated history keeps its entities through a width change; the migration is idempotent", () => {
    const migrated = migrateSelectionsToRefs(legacy()).history
    const wider: History = { ...migrated, parameters: { ...migrated.parameters, w: 90 } }
    const v = volumes(wider)
    expect(v.errors).toEqual([])
    const want = analytic(90, 40, 10)
    expect(Math.abs(v.exactVolume - want) / want).toBeLessThan(1e-3)
    const again = migrateSelectionsToRefs(migrated)
    expect(again.conversions).toEqual([])
    expect(again.history).toBe(migrated)
  })

  test("a name and a point on a face migrate to the same reference", () => {
    const history: History = {
      ...BASE(),
      features: [
        ...BASE().features,
        { id: "byName", type: "pushpull", near: [30, 20, 10], name: "plate.top", distance: 3 } as Feature,
        { id: "byPoint", type: "pushpull", near: [30, 20, 13], normal: [0, 0, 1], distance: -3 } as Feature
      ]
    }
    const out = migrateSelectionsToRefs(history)
    expect(out.conversions.map((c) => c.to[0])).toEqual(["face:plate|plate.top", "face:plate|plate.top"])
    expect(out.conversions.map((c) => c.from)).toEqual(["name plate.top", "near [30,20,13]"])
  })

  test("a selection that cannot be converted is kept alone with the reason", () => {
    const history: History = { ...BASE(), features: [...BASE().features, { id: "round", type: "fillet", radius: 2, edges: { parallel: "z", within: { min: [900, 900, 0], max: [901, 901, 5] } } } as Feature] }
    const out = migrateSelectionsToRefs(history)
    expect(out.conversions).toEqual([])
    expect(out.kept.map((k) => k.feature)).toEqual(["round"])
    expect(out.kept[0]!.reason).toMatch(/matches no edge/)
  })

  test("a shell's open end migrates to a face reference", () => {
    const history: History = { ...BASE(60, 40, 20), features: [...BASE(60, 40, 20).features, { id: "hollow", type: "shell", feature: "plate", thickness: 2, open: "top" } as Feature] }
    const out = migrateSelectionsToRefs(history)
    expect(out.conversions).toEqual([{ feature: "hollow", field: "openFaces", from: "open top", to: ["face:plate|plate.top"] }])
  })
})
