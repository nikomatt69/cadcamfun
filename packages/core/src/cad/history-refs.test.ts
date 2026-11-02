/**
 * Persistent references stored in features (spec 41 N4/N5): a fillet and a hole keep their entity through a parameter edit and a feature
 * inserted upstream, in both replays, and fail with a clear "reference lost" error when the entity is gone.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { massProperties } from "./brep/mass.ts"
import { parseRef } from "./brep/naming-keys.ts"
import { rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { entityRefs } from "./history-naming.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(120_000)

const sketch = (id: string): Feature =>
  ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}-r`, kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } }) as unknown as Feature

const BASE = (w = 60, h = 40, t = 10): History => ({
  parameters: { w, h, t },
  features: [sketch("s"), { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" } as Feature]
})

/** The vertical edges of the plate, as references (the four edges between two side faces). */
const verticalEdgeRefs = (history: History): string[] => {
  const ex = rebuildExact(history)
  return entityRefs(ex, "plate", ["edge"]).filter((r) => /^edge\(plate\.side0\.\d,plate\.side0\.\d\)$/.test(r.key)).map((r) => `edge:${r.body}|${r.key}`)
}

const withFillet = (history: History, refs: string[], radius = 3): History =>
  ({ ...history, features: [...history.features, { id: "round", type: "fillet", radius, edges: { refs, parallel: "z" } } as Feature] })

/** A through hole on the top face of the plate, by reference. */
const withHole = (history: History, at: [number, number] = [0, 0], diameter = 8): History => ({
  ...history,
  features: [
    ...history.features,
    { id: "top", type: "plane", from: { kind: "face", near: [1, 1, 10], normal: [0, 0, 1], ref: "face:plate|plate.top" } } as Feature,
    { id: "bore", type: "hole", plane: "top", at, diameter, depth: "t" } as Feature
  ]
})

const volumes = (history: History) => {
  const mesh = rebuild(history)
  const exact = rebuildExact(history, mesh)
  const errors = mesh.issues.filter((i) => i.severity === "error")
  return {
    mesh, exact, errors,
    meshVolume: mesh.bodies.reduce((s, b) => s + Math.abs(meshVolume(b.mesh)), 0),
    exactVolume: exact.bodies.reduce((s, b) => s + (b.brep === undefined ? NaN : massProperties(b.brep).volume), 0)
  }
}

/** Plate with four vertical edges filleted at r and one through hole of diameter d. */
const analytic = (w: number, h: number, t: number, r = 3, d = 8) => (w * h - 4 * r * r * (1 - Math.PI / 4) - Math.PI * (d / 2) ** 2) * t

describe("fillet and hole by reference survive edits", () => {
  const base = BASE()
  const edges = verticalEdgeRefs(base)

  test("the plate offers four vertical edge references and a top face reference", () => {
    expect(edges).toHaveLength(4)
    const faces = entityRefs(rebuildExact(base), "plate", ["face"]).map((r) => r.key)
    expect(faces).toContain("plate.top")
  })

  const build = (w: number, h: number, t: number, insertUpstream = false): History => {
    let history = withHole(withFillet(BASE(w, h, t), edges))
    if (insertUpstream) {
      // A feature inserted between the plate and the fillet: a second through hole near a corner, then a boss on top.
      const hole = { id: "extra", type: "hole", plane: "XY", offset: "t", at: [10, 10], diameter: 5, depth: "t" } as unknown as Feature
      history = { ...history, features: [history.features[0]!, history.features[1]!, hole, ...history.features.slice(2)] }
    }
    return history
  }

  test("as built: both replays agree with the analytic volume", () => {
    const v = volumes(build(60, 40, 10))
    expect(v.errors).toEqual([])
    const want = analytic(60, 40, 10)
    expect(Math.abs(v.meshVolume - want) / want).toBeLessThan(0.01)
    expect(Math.abs(v.exactVolume - want) / want).toBeLessThan(1e-3)
    expect(v.exact.bodies[0]!.reason).toBeUndefined()
  })

  for (const [w, h, t] of [[80, 40, 10], [60, 55, 10], [60, 40, 14], [48, 32, 8]] as const) {
    test(`after a parameter change (w=${w}, h=${h}, t=${t}) the fillet is on the same edges and the hole on the same face`, () => {
      const v = volumes(build(w, h, t))
      expect(v.errors).toEqual([])
      const want = analytic(w, h, t)
      expect(Math.abs(v.meshVolume - want) / want).toBeLessThan(0.01)
      expect(Math.abs(v.exactVolume - want) / want).toBeLessThan(1e-3)
    })
  }

  test("after a feature inserted upstream the references still hit the same entities", () => {
    const v = volumes(build(60, 40, 10, true))
    expect(v.errors).toEqual([])
    const want = analytic(60, 40, 10) - Math.PI * 2.5 ** 2 * 10
    expect(Math.abs(v.meshVolume - want) / want).toBeLessThan(0.01)
    expect(Math.abs(v.exactVolume - want) / want).toBeLessThan(1e-3)
  })

  test("the reference is the selection: a stale geometric filter next to it does not change the result", () => {
    // The `parallel: "z"` hint and a `within` box that no longer contains the edges are ignored once refs are present.
    const history = build(60, 40, 10)
    const round = history.features.find((f) => f.id === "round") as unknown as { edges: Record<string, unknown> }
    round.edges.within = { min: [500, 500, 500], max: [501, 501, 501] }
    const v = volumes(history)
    expect(v.errors).toEqual([])
    expect(Math.abs(v.exactVolume - analytic(60, 40, 10)) / analytic(60, 40, 10)).toBeLessThan(1e-3)
  })
})

describe("a reference to something that is gone fails clearly", () => {
  const edges = verticalEdgeRefs(BASE())

  test("an edge reference whose face disappeared: 'reference lost', naming the feature that removed it, in both replays", () => {
    // A split at z = 5 keeps the part below: plate.top is gone, and with it the vertical edges' upper ends.
    const history: History = {
      ...BASE(),
      features: [...BASE().features, { id: "cut", type: "split", plane: "XY", offset: 5, keep: "below" } as Feature, { id: "round", type: "fillet", radius: 3, edges: { refs: ["edge:plate|edge(plate.side0.0,plate.top)"] } } as Feature]
    }
    const v = volumes(history)
    const errs = v.errors.filter((e) => e.feature === "round")
    expect(errs).toHaveLength(1)
    expect(errs[0]!.message).toMatch(/reference lost/)
    expect(errs[0]!.message).toContain("edge(plate.side0.0,plate.top)")
    expect(errs[0]!.message).toMatch(/removed by 'cut'/)
    expect(v.mesh.states["round"]!.state).toBe("failed")
    // The part keeps what the split made: nothing is filleted instead.
    expect(v.meshVolume).toBeCloseTo(60 * 40 * 5, 0)
    expect(v.exactVolume).toBeCloseTo(60 * 40 * 5, 0)
    void edges
  })

  test("a face reference whose face disappeared fails the hole's plane and nothing is cut", () => {
    const history = withHole({ ...BASE(), features: [...BASE().features, { id: "cut", type: "split", plane: "XY", offset: 5, keep: "below" } as Feature] })
    const v = volumes(history)
    const errs = v.errors
    expect(errs.some((e) => e.feature === "top" && /reference lost/.test(e.message) && /removed by 'cut'/.test(e.message))).toBe(true)
    expect(v.meshVolume).toBeCloseTo(60 * 40 * 5, 0)
  })

  test("a malformed reference and a reference of the wrong kind are refused with the reason", () => {
    const bad = volumes({ ...BASE(), features: [...BASE().features, { id: "round", type: "fillet", radius: 2, edges: { refs: ["nonsense"] } } as Feature] })
    expect(bad.errors.some((e) => e.feature === "round" && /is not a reference/.test(e.message))).toBe(true)
    const wrongKind = volumes({ ...BASE(), features: [...BASE().features, { id: "round", type: "fillet", radius: 2, edges: { refs: ["face:plate|plate.top"] } } as Feature] })
    expect(wrongKind.errors.some((e) => e.feature === "round" && /names a face, but a edge is needed/.test(e.message))).toBe(true)
  })

  test("references name the body they are on, so a feature whose body failed is skipped, not guessed", () => {
    const history: History = {
      ...BASE(),
      features: [{ ...BASE().features[0]!, sketch: { entities: [], constraints: [], shapes: [] } } as Feature, BASE().features[1]!, { id: "round", type: "fillet", radius: 2, edges: { refs: [edges[0]!] } } as Feature]
    }
    const v = volumes(history)
    expect(v.errors.some((e) => e.feature === "round")).toBe(true)
  })

  test("references parse back to the body and key they were made from", () => {
    expect(parseRef(edges[0]!)).toMatchObject({ kind: "edge", body: "plate" })
  })
})

describe("push/pull, draft and shell by reference", () => {
  test("push/pull on `plate.top` by reference follows a height change", () => {
    for (const t of [10, 16]) {
      const history: History = { ...BASE(60, 40, t), features: [...BASE(60, 40, t).features, { id: "pull", type: "pushpull", near: [1, 1, 10], ref: "face:plate|plate.top", distance: 5 } as Feature] }
      const v = volumes(history)
      expect(v.errors).toEqual([])
      expect(v.meshVolume).toBeCloseTo(60 * 40 * (t + 5), -1)
      expect(v.exactVolume).toBeCloseTo(60 * 40 * (t + 5), 1)
    }
  })

  test("a push/pull reference to a face that is not there is 'reference lost', not the nearest face", () => {
    const history: History = { ...BASE(), features: [...BASE().features, { id: "pull", type: "pushpull", near: [1, 1, 10], ref: "face:plate|plate.gone", distance: 5 } as Feature] }
    const v = volumes(history)
    expect(v.errors.some((e) => e.feature === "pull" && /reference lost/.test(e.message))).toBe(true)
    expect(v.meshVolume).toBeCloseTo(60 * 40 * 10, 0)
  })

  test("draft by reference tilts the named wall", () => {
    const history: History = { ...BASE(), features: [...BASE().features, { id: "lean", type: "draft", near: [0, 20, 5], ref: "face:plate|plate.side0.3", angle: 3, pull: [0, 0, 1], neutral: 0 } as Feature] }
    const v = volumes(history)
    expect(v.errors).toEqual([])
    const named = rebuildExact(history).bodies[0]!.brep
    expect(named).toBeDefined()
    // The wall leans (material added above the neutral plane or removed: the volume changes from the straight plate).
    expect(Math.abs(v.exactVolume - 60 * 40 * 10)).toBeGreaterThan(1)
    expect(Math.abs(v.exactVolume - v.meshVolume) / v.meshVolume).toBeLessThan(0.01)
  })

  test("a shell opens the faces it is given as references; a side face is refused", () => {
    const shell = (refs: string[]): History => ({ ...BASE(60, 40, 20), features: [...BASE(60, 40, 20).features, { id: "hollow", type: "shell", feature: "plate", thickness: 2, openFaces: refs } as Feature] })
    const open = volumes(shell(["face:plate|plate.top"]))
    expect(open.errors).toEqual([])
    // Open at the top: the cavity runs from the floor (2 mm up) through the top: wall volume = outer - inner.
    const want = 60 * 40 * 20 - 56 * 36 * 18
    expect(open.meshVolume).toBeCloseTo(want, -1)
    expect(open.exactVolume).toBeCloseTo(want, 0)
    const closed = volumes(shell([]))
    expect(closed.exactVolume).toBeCloseTo(60 * 40 * 20 - 56 * 36 * 16, 0)
    const side = volumes(shell(["face:plate|plate.side0.0"]))
    expect(side.errors.some((e) => e.feature === "hollow" && /top or bottom face of 'plate' only/.test(e.message))).toBe(true)
  })
})
