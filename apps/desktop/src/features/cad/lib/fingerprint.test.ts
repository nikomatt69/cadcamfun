import { describe, expect, test } from "bun:test"
import { activateConfiguration, addConfiguration, type DimConstraint, type Feature, type History, type SketchEntity, type SketchFeature } from "@cadcamfun/core"
import { shapeFingerprint } from "./fingerprint.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const rectangle = (id: string, w: number | string, h: number | string, group?: string): SketchFeature => ({
  id, type: "sketch", plane: "XY", ...(group !== undefined ? { group } : {}),
  sketch: {
    entities: [pt("p1", 0, 0), pt("p2", 9, 0), pt("p3", 9, 6), pt("p4", 0, 6), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [{ type: "fixed", point: "p1", x: 0, y: 0 }, { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }] as DimConstraint[]
  }
})
const part = (history: History, extra: Record<string, unknown> = {}) => ({ id: "p", type: "parametric", name: "Part", x: 0, y: 0, z: 0, history, ...extra })
const plate = (): History => ({
  parameters: { width: 40, height: 25, thick: 6 },
  features: [rectangle("s1", "width", "height", "profile"), { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new", group: "body" } as Feature, { id: "hole", type: "extrude", sketch: "s1", depth: 2, operation: "subtract", group: "body" } as Feature],
  groups: [{ id: "profile", name: "Profile" }, { id: "body", name: "Body" }] as never
})

describe("what changes the shape fingerprint of a parametric part", () => {
  test("moving and turning the part does not, a parameter does", () => {
    const base = shapeFingerprint(part(plate()))
    expect(shapeFingerprint(part(plate(), { x: 50, y: -3, z: 9, rotation: { x: 0, y: 0, z: 90 }, translateX: 4 }))).toBe(base)
    expect(shapeFingerprint(part({ ...plate(), parameters: { width: 41, height: 25, thick: 6 } }))).not.toBe(base)
  })

  test("renaming a feature group, moving a feature between groups, or renaming a feature does not rebuild the viewport", () => {
    const base = shapeFingerprint(part(plate()))
    const renamed: History = { ...plate(), groups: [{ id: "profile", name: "Sketches" }, { id: "body", name: "Solid body" }] as never }
    expect(shapeFingerprint(part(renamed))).toBe(base)
    const regrouped: History = { ...plate(), features: plate().features.map((f) => (f.id === "hole" ? ({ ...f, group: "profile" } as Feature) : f)) }
    expect(shapeFingerprint(part(regrouped))).toBe(base)
    const ungrouped: History = { ...plate(), features: plate().features.map((f) => { const { group: _g, ...rest } = f as Feature & { group?: string }; return rest as Feature }) }
    expect(shapeFingerprint(part(ungrouped))).toBe(base)
    const renamedFeature: History = { ...plate(), features: plate().features.map((f) => (f.id === "plate" ? ({ ...f, name: "Base plate" } as Feature) : f)) }
    expect(shapeFingerprint(part(renamedFeature))).toBe(base)
  })

  test("what changes the model still does: suppression, rollback, depth, operation", () => {
    const base = shapeFingerprint(part(plate()))
    const suppressed: History = { ...plate(), features: plate().features.map((f) => (f.id === "hole" ? ({ ...f, suppressed: true } as Feature) : f)) }
    expect(shapeFingerprint(part(suppressed))).not.toBe(base)
    expect(shapeFingerprint(part({ ...plate(), rollback: "plate" }))).not.toBe(base)
    const deeper: History = { ...plate(), features: plate().features.map((f) => (f.id === "hole" ? ({ ...f, depth: 3 } as Feature) : f)) }
    expect(shapeFingerprint(part(deeper))).not.toBe(base)
    const added: History = { ...plate(), features: [...plate().features, { id: "extra", type: "extrude", sketch: "s1", depth: 1, operation: "union" } as Feature] }
    expect(shapeFingerprint(part(added))).not.toBe(base)
  })

  test("a sketch point or a parameter that carries a placement name (x, y, name) is geometry inside a history", () => {
    const base = plate()
    const moved: History = { ...base, features: base.features.map((f) => (f.id === "s1" ? ({ ...f, sketch: { ...(f as SketchFeature).sketch, entities: (f as SketchFeature).sketch.entities.map((e) => (e.id === "p3" ? { ...e, x: 12 } : e)) } } as Feature) : f)) }
    expect(shapeFingerprint(part(moved))).not.toBe(shapeFingerprint(part(base)))
    expect(shapeFingerprint(part({ ...base, parameters: { ...base.parameters, x: 10 } }))).not.toBe(shapeFingerprint(part({ ...base, parameters: { ...base.parameters, x: 11 } })))
  })

  test("activating a configuration rebuilds, renaming one does not", () => {
    const first = addConfiguration(plate(), "Wide")
    expect(first.refusal).toBeUndefined()
    const wide: History = { ...first.history, parameters: { ...first.history.parameters, width: 80 } }
    const second = addConfiguration(wide, "Thick")
    const history = second.history
    expect(history.configuration).toBe("thick")
    const base = shapeFingerprint(part(history))
    const back = activateConfiguration(history, "default")
    expect(back.refusal).toBeUndefined()
    // another configuration is another parameter set and another active id: the viewport rebuilds
    expect(shapeFingerprint(part(back.history))).not.toBe(base)
    // only the active id differs between two histories with the same parameters: still a rebuild (the part is another variant)
    expect(shapeFingerprint(part({ ...history, configuration: "wide" }))).not.toBe(base)
    // a configuration's display name is not geometry
    const renamed: History = { ...history, configurations: history.configurations!.map((c) => (c.id === "thick" ? { ...c, name: "Heavy" } : c)) }
    expect(shapeFingerprint(part(renamed))).toBe(base)
  })

  test("a control point, a child's own placement or a nested name is geometry, only the element's own placement is not", () => {
    const spline = (x: number) => ({ id: "s", type: "spline", x: 0, points: [{ x, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }] })
    expect(shapeFingerprint(spline(1))).not.toBe(shapeFingerprint(spline(1.001)))
    expect(shapeFingerprint({ ...spline(1), x: 99, y: 5, z: 7, rotation: { x: 1, y: 2, z: 3 } })).toBe(shapeFingerprint(spline(1)))
    const group = (childX: number) => ({ id: "g", type: "group", x: 0, children: [{ id: "c", type: "cube", x: childX, width: 3 }] })
    expect(shapeFingerprint(group(5))).not.toBe(shapeFingerprint(group(6)))
  })

  test("a typed array, a cycle and key order are handled without touching the result", () => {
    const a = { id: "a", type: "mesh", points: new Float32Array([1, 2, 3]), width: 2, depth: 3 }
    const b = { depth: 3, width: 2, type: "mesh", id: "other", points: new Float32Array([1, 2, 3]) }
    expect(shapeFingerprint(a)).toBe(shapeFingerprint(b))
    expect(shapeFingerprint({ ...a, points: new Float32Array([1, 2, 3.5]) })).not.toBe(shapeFingerprint(a))
    const cyclic: Record<string, unknown> = { type: "x", width: 1 }
    cyclic["self"] = cyclic
    expect(() => shapeFingerprint(cyclic)).not.toThrow()
  })
})
