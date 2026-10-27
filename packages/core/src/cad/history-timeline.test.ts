import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { holeSites } from "./dfm.ts"
import { CELLS } from "./history-cells.ts"
import { rebuildExact } from "./history-brep.ts"
import { dependencyGraph, dependentsOf, insertFeature, moveFeature, moveFeatureTo, plateTemplate, removeFeature } from "./history-edit.ts"
import { activeHistory, bodyCreator, bodyRefs, declaredNeeds, withRollback, withSuppressed } from "./history-timeline.ts"
import { rebuild, type Feature, type History } from "./history.ts"
import { RECIPES, buildRecipe } from "./recipes.ts"
import { model, type ModelScript } from "./script.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(120_000)

const historyOf = (build: (m: ModelScript) => void): History => { const m = model(); build(m); return m.build() }

/** The history without `id`, built the old way: `removeFeature` (declared references), then whatever names a removed body. */
const without = (history: History, id: string): History => {
  let h = removeFeature(history, id)
  const gone = () => new Set(history.features.map((f) => f.id).filter((x) => !h.features.some((f) => f.id === x)))
  for (;;) {
    const removed = gone()
    const next = h.features.find((f) => bodyRefs(f).some((b) => removed.has(bodyCreator(b))))
    if (next === undefined) return h
    h = removeFeature(h, next.id)
  }
}

/** Same bodies, mesh volumes within the Float32 tolerance, and (with `exact`) identical exact B-reps. */
const expectSameModel = (a: History, b: History, exact: boolean, label: string) => {
  const ra = rebuild(a), rb = rebuild(b)
  expect({ label, bodies: ra.bodies.map((x) => x.id) }).toEqual({ label, bodies: rb.bodies.map((x) => x.id) })
  ra.bodies.forEach((body, i) => {
    const va = Math.abs(meshVolume(body.mesh)), vb = Math.abs(meshVolume(rb.bodies[i]!.mesh))
    expect({ label, body: body.id, rel: Math.abs(va - vb) / Math.max(1, vb) < 1e-5 }).toEqual({ label, body: body.id, rel: true })
  })
  if (!exact) return
  const ea = rebuildExact(a, ra).bodies, eb = rebuildExact(b, rb).bodies
  expect({ label, exact: ea.map((x) => (x.brep === undefined ? "none" : JSON.stringify(x.brep))) }).toEqual({ label, exact: eb.map((x) => (x.brep === undefined ? "none" : JSON.stringify(x.brep))) })
}

/** One small history per feature kind: the first matrix cell of each kind, plus the kinds the matrix has no cell of. */
const KINDS: ReadonlyArray<{ readonly id: string; readonly history: History }> = [
  ...CELLS.filter((c, i) => CELLS.findIndex((d) => d.id.split(".")[0] === c.id.split(".")[0]) === i && c.expectIssues !== true).map((c) => ({ id: c.id, history: historyOf(c.build) })),
  { id: "plane.offset", history: historyOf((m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); const p = m.plane({ kind: "offset", base: "XY", distance: 10 }); m.hole({ plane: p, at: [20, 15], diameter: 8, depth: 10 }) }) },
  { id: "rib.line", history: historyOf((m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); m.rib(m.sketch("XY", 10).path([[5, 15], [35, 15]]), { thickness: 3, depth: 8 }) }) },
  { id: "text.emboss", history: historyOf((m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: 10 }); m.text({ text: "CAD", height: 8, strokeWidth: 1, depth: 1, plane: "XY", offset: 10, at: [30, 15], align: "centre" }) }) },
  { id: "mate.faces", history: historyOf((m) => { const a = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); const b = m.extrude(m.sketch("XY").rectangle([100, 100], 20, 20), { depth: 10, operation: "new" }); m.mate({ body: b, face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: a, near: [20, 15, 10], normal: [0, 0, 1] } }) }) }
]

describe("suppress (spec 58 T2)", () => {
  test("the fixtures cover every one of the 24 feature kinds", () => {
    const kinds = new Set(KINDS.flatMap((k) => k.history.features.map((f) => f.type)))
    expect([...kinds].sort()).toEqual(["coil", "combine", "draft", "extrude", "fillet", "hole", "loft", "mate", "mirror", "move", "pattern", "plane", "primitive", "pushpull", "revolve", "rib", "scale", "sheet", "shell", "sketch", "split", "sweep", "text", "thread"])
  })

  for (const kind of KINDS) {
    test(`${kind.id}: suppressing the last feature equals the history without it, mesh and exact`, () => {
      const last = kind.history.features[kind.history.features.length - 1]!
      const suppressed = withSuppressed(kind.history, [last.id])
      expectSameModel(suppressed, without(kind.history, last.id), true, kind.id)
      expect(rebuild(suppressed).states[last.id]).toEqual({ state: "suppressed" })
    })
  }

  test("suppressing the first sketch of every fixture equals deleting it with what needs it (mesh)", () => {
    for (const kind of KINDS) {
      const first = kind.history.features.find((f) => f.type === "sketch")
      if (first === undefined) continue
      expectSameModel(withSuppressed(kind.history, [first.id]), without(kind.history, first.id), false, `${kind.id} without ${first.id}`)
    }
  })

  test("what needs a suppressed feature is suppressed-by it, naming the root, through references and named bodies", () => {
    const h = historyOf((m) => {
      const plate = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }, )
      const pocket = m.extrude(m.sketch("XY", 10).circle([20, 15], 10), { depth: 4, direction: "down", operation: "subtract", targets: [plate] })
      m.pattern({ feature: pocket, kind: "linear", count: 2, step: [12, 0, 0] })
      m.fillet({ radius: 1, targets: [plate] })
    })
    const [sketch1, plate, sketch2, pocket, pattern, fillet] = h.features.map((f) => f.id)
    const states = rebuild(withSuppressed(h, [plate!])).states
    expect(states[sketch1!]).toEqual({ state: "ok" })
    expect(states[plate!]).toEqual({ state: "suppressed" })
    expect(states[sketch2!]).toEqual({ state: "ok" })
    // The pocket names the plate's body, the pattern copies the pocket, the fillet names the plate: all left out because of the plate.
    expect([states[pocket!], states[pattern!], states[fillet!]]).toEqual([{ state: "suppressed-by", by: plate! }, { state: "suppressed-by", by: plate! }, { state: "suppressed-by", by: plate! }])
  })

  test("suppressing then releasing gives back the identical history (spec 58 T8)", () => {
    for (const kind of KINDS) {
      const ids = kind.history.features.map((f) => f.id)
      const back = withSuppressed(withSuppressed(kind.history, ids), ids, false)
      expect(JSON.stringify(back)).toBe(JSON.stringify(kind.history))
    }
    expect(() => withSuppressed(plateTemplate(), ["ghost"])).toThrow("ghost")
  })

  test("a suppressed hole is not drilled by the CAM and not in the active history", () => {
    const h = historyOf((m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 8, depth: 10 }) })
    const hole = h.features[2]!.id
    expect(holeSites(h, {}).length).toBe(1)
    expect(holeSites(withSuppressed(h, [hole]), {})).toEqual([])
    expect(activeHistory(withSuppressed(h, [hole])).features.map((f) => f.id)).toEqual(h.features.slice(0, 2).map((f) => f.id))
  })
})

describe("rollback (spec 58 T2)", () => {
  test("rolling back to every feature of every recipe equals its prefix, mesh and exact", () => {
    for (const recipe of RECIPES) {
      const h = buildRecipe(recipe.name, recipe.name === "stepped_shaft" ? { sections: [{ diameter: 30, length: 40 }, { diameter: 20, length: 30 }] } : {}).history
      h.features.forEach((f, i) => {
        const rolled = withRollback(h, f.id)
        expectSameModel(rolled, { ...h, features: h.features.slice(0, i + 1) }, true, `${recipe.name} @ ${f.id}`)
        const states = rebuild(rolled).states
        expect(h.features.slice(i + 1).every((g) => states[g.id]?.state === "rolled-back")).toBe(true)
      })
      expect(withRollback(withRollback(h, h.features[0]!.id), undefined)).toEqual(h)
    }
  })

  test("a rollback marker that names no feature builds everything and says so", () => {
    const h: History = { ...plateTemplate(), rollback: "ghost" }
    const r = rebuild(h)
    expect(r.bodies.length).toBe(1)
    expect(r.issues).toContainEqual({ feature: "timeline", severity: "warning", message: expect.stringContaining("'ghost'") })
  })
})

describe("lineage and reorder (spec 58 T3)", () => {
  test("the replay records that a hole changed the plate's body", () => {
    const h = plateTemplate()
    expect(rebuild(h).lineage).toMatchObject({ plate: [], hole1: ["plate"] })
  })

  test("a hole cannot move above the extrusion it cuts: refused with the extrusion named", () => {
    const h = plateTemplate()
    const edit = moveFeatureTo(h, "hole1", 0)
    expect(edit.history).toBe(h)
    expect(edit.refusal).toContain("'plate'")
    expect(moveFeature(h, "hole1", -1)).toBe(h)
    expect(dependencyGraph(h).get("hole1")).toEqual(new Map([["plate", "lineage"]]))
  })

  test("a valid move in several steps keeps the model; a move below a dependent is refused", () => {
    const h = historyOf((m) => {
      m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
      m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 8, depth: 10 })
      m.extrude(m.sketch("XY").rectangle([200, 0], 10, 10), { depth: 5, operation: "new" })
    })
    const [s1, plate, hole, s2, block] = h.features.map((f) => f.id)
    let moved = moveFeatureTo(h, s2!, 0)
    expect(moved.refusal).toBeUndefined()
    moved = moveFeatureTo(moved.history, block!, 1)
    expect(moved.refusal).toBeUndefined()
    expect(moved.history.features.map((f) => f.id)).toEqual([s2!, block!, s1!, plate!, hole!])
    const volume = (x: History) => rebuild(x).bodies.reduce((v, b) => v + Math.abs(meshVolume(b.mesh)), 0)
    expect(volume(moved.history)).toBeCloseTo(volume(h), 3)
    expect(moveFeatureTo(h, s1!, 2).refusal).toContain(`'${plate}'`)
  })

  test("dependentsOf is the declared needs read from the other side, on every recipe and the matrix (no regression)", () => {
    const histories = [...RECIPES.map((r) => buildRecipe(r.name, r.name === "stepped_shaft" ? { sections: [{ diameter: 30, length: 40 }] } : {}).history), ...KINDS.map((k) => k.history)]
    for (const h of histories) for (const f of h.features) {
      expect(dependentsOf(h, f.id)).toEqual(h.features.filter((g: Feature) => declaredNeeds(g).includes(f.id)).map((g) => g.id))
    }
  })

  test("insertFeature puts a feature after another, refusing one that needs something below the insertion point", () => {
    const h = plateTemplate()
    const fillet: Feature = { id: "round", type: "fillet", radius: 1, targets: ["plate"] }
    expect(insertFeature(h, fillet, "plate").history.features.map((f) => f.id)).toEqual(["sketch1", "plate", "round", "hole1"])
    expect(insertFeature(h, fillet, "sketch1").refusal).toContain("'plate'")
    expect(insertFeature(h, { ...fillet, id: "hole1" }, "plate").refusal).toContain("already used")
  })
})

describe("failures (spec 58 T5)", () => {
  const filleted = (radius: number): History => historyOf((m) => {
    const plate = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    m.fillet({ radius, targets: [plate] })
    m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 4, depth: 10 })
  })

  test("a fillet radius larger than the faces fails only that feature, leaves the body as it was, and later features build", () => {
    const h = filleted(20)
    const r = rebuild(h)
    const [, plate, fillet, hole] = h.features.map((f) => f.id)
    expect(r.states[fillet!]).toEqual({ state: "failed" })
    expect(r.states[hole!]).toEqual({ state: "ok" })
    const box = 40 * 30 * 10, bore = Math.PI * 2 ** 2 * 10
    expect(Math.abs(meshVolume(r.bodies[0]!.mesh))).toBeCloseTo(box - bore, -1)
    expect(r.bodies.map((b) => b.id)).toEqual([plate!])
  })

  test("the remedy names a size that works, checked by rebuilding with it", () => {
    const failed = rebuild(filleted(20)).issues.find((i) => i.severity === "error")!
    expect(failed.remedy).toMatch(/at most [\d.]+ mm/)
    const size = Number(/at most ([\d.]+) mm/.exec(failed.remedy!)![1])
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThan(20)
    const fixed = rebuild(filleted(size))
    expect(fixed.issues.filter((i) => i.feature === failed.feature)).toEqual([])
    expect(Object.values(fixed.states).every((s) => s.state === "ok")).toBe(true)
  })

  test("what names a failed feature is skipped, naming the failed root; what does not name it still builds", () => {
    const h: History = {
      parameters: plateTemplate().parameters,
      features: [
        { id: "s", type: "sketch", plane: "XY", sketch: { entities: [{ id: "a", kind: "point", x: 0, y: 0 }, { id: "b", kind: "point", x: 10, y: 0 }, { id: "l", kind: "line", p1: "a", p2: "b" }], constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 10 }, { type: "length", line: "l", value: 20 }] } },
        { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" },
        { id: "copies", type: "pattern", feature: "e", kind: "linear", count: 2, step: [20, 0, 0] },
        ...plateTemplate().features
      ]
    }
    const r = rebuild(h)
    expect(r.states["s"]).toEqual({ state: "failed" })
    expect(r.states["e"]).toEqual({ state: "skipped", by: "s" })
    expect(r.states["copies"]).toEqual({ state: "skipped", by: "s" })
    expect(r.issues.find((i) => i.feature === "copies")?.message).toContain("'s' failed")
    expect(["sketch1", "plate", "hole1"].map((id) => r.states[id]?.state)).toEqual(["ok", "ok", "ok"])
    expect(r.bodies.map((b) => b.id)).toEqual(["plate"])
    // The exact replay builds nothing of a skipped feature either.
    expect(rebuildExact(h, r).bodies.map((b) => b.id)).toEqual(["plate"])
  })
})
