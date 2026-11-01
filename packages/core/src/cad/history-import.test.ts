import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature, History, SketchFeature } from "./history.ts"
import { rebuild } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { importStepToHistory, importedUses, removeImported, withImported } from "./history-import.ts"
import { sceneToStep } from "./scene-step.ts"
import { meshVolume } from "./solid.ts"
import { explodeWithGaps } from "./brep/exploded-fixture.ts"
import { makeBox, massProperties, StepExportError, validateBrep, writeStepBreps } from "./brep/index.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const history = (features: Feature[]): History => ({ parameters: {}, features })

/** A circle of `radius` at (cx, cy) on a base plane, as a constrained sketch. */
const circle = (id: string, plane: SketchFeature["plane"], cx: number, cy: number, radius: number, offset?: number): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [{ id: "c", kind: "point", x: cx, y: cy }, { id: "k", kind: "circle", center: "c", radius }],
    constraints: [{ type: "fixed", point: "c" }, { type: "radius", circle: "k", value: radius }]
  }
})

/** A 10 x 20 x 30 box written face by face with 30 micrometre gaps, as STEP text. */
const explodedStep = (gap = 3e-5) => writeStepBreps([{ name: "bracket", brep: explodeWithGaps(makeBox(10, 20, 30), gap) }])

describe("an imported STEP body is the base of a history (spec 72 step 2.2)", () => {
  test("an exploded STEP with sub-tolerance gaps is healed into an imported feature that accepts a hole and a pocket", () => {
    const imp = importStepToHistory(explodedStep())
    expect(imp.refused).toEqual([])
    expect(imp.bases.length).toBe(1)
    expect(imp.report[0]!.status).toBe("healed")
    expect(imp.report[0]!.healed!.verticesTightened).toBeGreaterThan(0)
    expect(imp.report[0]!.loose).toBe(false)
    expect(rel(imp.report[0]!.volume!, 6000)).toBeLessThan(1e-9)

    const base = withImported(history([]), imp)
    // A through hole of diameter 4 down from the top face, and a blind pocket of radius 2 and depth 12 from the same face.
    const hole: History = { ...base, features: [{ id: "h1", type: "hole", plane: "XY", offset: 30, at: [5, 10], diameter: 4, depth: 30 }] }
    const exact = rebuildExact(hole)
    expect(exact.result.issues.filter((i) => i.severity === "error")).toEqual([])
    const body = exact.bodies[0]!
    expect(body.reason).toBeUndefined()
    expect(validateBrep(body.brep!).issues.map((i) => i.message)).toEqual([])
    expect(rel(massProperties(body.brep!).volume, 6000 - PI * 4 * 30)).toBeLessThan(1e-9)

    const pocket: History = {
      ...base,
      features: [
        circle("s1", "XY", 5, 10, 2, 30),
        { id: "pocket", type: "extrude", sketch: "s1", depth: 12, direction: "down", operation: "subtract" }
      ]
    }
    const exactPocket = rebuildExact(pocket)
    expect(exactPocket.result.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(rel(massProperties(exactPocket.bodies[0]!.brep!).volume, 6000 - PI * 4 * 12)).toBeLessThan(1e-9)

    // The mesh replay sees the same body (to the meshing tolerance) and the same cut.
    const meshed = rebuild(hole)
    expect(meshed.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(rel(meshVolume(meshed.bodies[0]!.mesh), 6000 - PI * 4 * 30)).toBeLessThan(5e-3)
  })

  test("the imported body is mirrored and joined to its image, and keeps the exact volume", () => {
    const imp = importStepToHistory(explodedStep())
    const h = withImported(history([{ id: "m", type: "mirror", plane: "YZ", offset: 10, bodies: ["imported1"], join: true }]), imp)
    const exact = rebuildExact(h)
    expect(exact.bodies.length).toBe(1)
    expect(exact.bodies[0]!.reason).toBeUndefined()
    expect(rel(massProperties(exact.bodies[0]!.brep!).volume, 12000)).toBeLessThan(1e-9)
  })

  test("a body that is valid as written is imported as it is, without healing", () => {
    const text = writeStepBreps([{ name: "block", brep: makeBox(5, 5, 5) }])
    const imp = importStepToHistory(text)
    expect(imp.report[0]!.status).toBe("exact")
    expect(imp.report[0]!.healed).toBeUndefined()
    expect(imp.bases[0]!.source?.name).toBe("block")
  })

  test("a body with a gap above the healing tolerance is refused with the gap, and no body is made", () => {
    const imp = importStepToHistory(explodedStep(3e-3), { heal: { tol: 1e-5 } })
    expect(imp.bases).toEqual([])
    expect(imp.refused.length).toBe(1)
    const r = imp.refused[0]!
    expect(r.status).toBe("refused")
    expect(r.diagnostics.some((d) => d.includes("above the healing tolerance"))).toBe(true)
    expect(r.diagnostics.some((d) => d.includes("needs a healing tolerance of at least"))).toBe(true)
    // The same file heals when the tolerance covers the gap.
    expect(importStepToHistory(explodedStep(3e-3), { heal: { tol: 2e-2 } }).bases.length).toBe(1)
  })

  test("a missing face is refused with the open edges, not passed on to fail a later Boolean", () => {
    const exploded = explodeWithGaps(makeBox(10, 10, 10), 0)
    const open = { ...exploded, faces: exploded.faces.slice(0, 5), shells: [{ faces: [0, 1, 2, 3, 4], closed: true }] }
    const imp = importStepToHistory(writeStepBreps([{ name: "lid-less", brep: open }]))
    expect(imp.bases).toEqual([])
    expect(imp.refused[0]!.diagnostics.join(" ")).toContain("face")
  })

  test("ids stay unique when the history already has an imported feature", () => {
    const imp = importStepToHistory(explodedStep())
    const once = withImported(history([]), imp)
    const twice = withImported(once, imp)
    expect(new Set(twice.bases!.map((b) => b.id)).size).toBe(2)
    expect(twice.bases!.length).toBe(2)
  })

  test("a scene export skips a loose body with its tolerance and writes it only when allowed", () => {
    const imp = importStepToHistory(explodedStep(), { heal: { tighten: false } })
    const element = { id: "e1", type: "brep", name: "foreign", brep: imp.bases[0]!.brep, x: 0, y: 0, z: 0 }
    const refused = sceneToStep([element, { id: "e2", type: "brep", name: "sound", brep: makeBox(5, 5, 5), x: 0, y: 0, z: 0 }])
    expect(refused.skipped.map((s) => s.name)).toEqual(["foreign"])
    expect(refused.skipped[0]!.reason).toContain("loose body")
    expect(refused.step).toBeDefined()
    expect(refused.step).not.toContain("foreign")
    const allowed = sceneToStep([element], { allowLoose: true })
    expect(allowed.skipped).toEqual([])
    expect(allowed.step).toContain("LOOSE foreign")
  })

  test("a loose imported body is accepted, said to be loose, and what is built on it cannot be exported silently", () => {
    const imp = importStepToHistory(explodedStep(), { heal: { tighten: false } })
    expect(imp.refused).toEqual([])
    expect(imp.report[0]!.loose).toBe(true)
    expect(imp.warnings.some((w) => w.includes("loose"))).toBe(true)
    const h = withImported(history([{ id: "h1", type: "hole", plane: "XY", offset: 30, at: [5, 10], diameter: 4, depth: 30 }]), imp)
    const exact = rebuildExact(h)
    expect(exact.warnings.some((w) => w.includes("loose"))).toBe(true)
    const brep = exact.bodies[0]!.brep!
    expect(brep.faces.some((f) => f.loose === true)).toBe(true)
    expect(() => writeStepBreps([{ name: "x", brep }])).toThrow(StepExportError)
  })

  test("an imported body is removed unless a feature names it", () => {
    const imp = importStepToHistory(explodedStep())
    const id = imp.bases[0]!.id
    const alone = withImported(history([]), imp)
    const gone = removeImported(alone, id)
    expect(gone.refusal).toBeUndefined()
    expect(gone.history.bases).toBeUndefined()
    expect(removeImported(alone, "nope").refusal).toContain("not an imported body")
    const moved = withImported(history([{ id: "m1", type: "move", targets: [id], translate: [1, 0, 0] }]), imp)
    expect(importedUses(moved, id)).toEqual(["m1"])
    expect(removeImported(moved, id).refusal).toContain("m1")
    expect(removeImported(moved, id).history).toBe(moved)
  })
})
