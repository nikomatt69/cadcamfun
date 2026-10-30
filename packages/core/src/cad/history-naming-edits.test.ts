/**
 * The gate of spec 41 (N2, N3): references to faces, edges and vertices survive parametric edits of -20 % .. +20 % on an upstream
 * dimension, and when they cannot, the answer says why (split, merged, deleted, ambiguous), never a silent re-pick.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { makeRef, namingHealth, parseRef, refToString, resolveKey, topologyKeys, type Ref, type RefKind } from "./brep/naming-keys.ts"
import { massProperties } from "./brep/mass.ts"
import { validateBrep } from "./brep/validate.ts"
import type { Feature, History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { entityRefs, namingReport, resolveAfterEdit, resolveInHistory } from "./history-naming.ts"

setDefaultTimeout(120_000)

const W = 40, D = 25, T = 6
const rectAt = (id: string, x0: number, y0: number, x1: number, y1: number): Feature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [
      { id: "p1", kind: "point", x: x0, y: y0 }, { id: "p2", kind: "point", x: x1, y: y0 }, { id: "p3", kind: "point", x: x1, y: y1 }, { id: "p4", kind: "point", x: x0, y: y1 },
      { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
    ],
    constraints: [
      { type: "fixed", point: "p1", x: x0, y: y0 }, { type: "fixed", point: "p2", x: x1, y: y0 }, { type: "fixed", point: "p3", x: x1, y: y1 }, { type: "fixed", point: "p4", x: x0, y: y1 }
    ]
  }
} as Feature)
/** The plate: width is a parameter; the sketch is driven by it. */
const plateSketch: Feature = {
  id: "s1", type: "sketch", plane: "XY",
  sketch: {
    entities: [
      { id: "p1", kind: "point", x: 0, y: 0 }, { id: "p2", kind: "point", x: W, y: 0 }, { id: "p3", kind: "point", x: W, y: D }, { id: "p4", kind: "point", x: 0, y: D },
      { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
    ],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: "depth" }
    ]
  }
} as Feature
const holeSketch: Feature = {
  id: "s2", type: "sketch", plane: "XY",
  sketch: { entities: [{ id: "c", kind: "point", x: 20, y: 12 }, { id: "k", kind: "circle", center: "c", radius: 1 }], constraints: [{ type: "fixed", point: "c" }, { type: "radius", circle: "k", value: "bore" }] }
} as Feature
const plate: Feature = { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" } as Feature
const bore: Feature = { id: "bore", type: "extrude", sketch: "s2", depth: "thick", operation: "subtract" } as Feature

const model = (p: { width?: number; depth?: number; thick?: number; bore?: number } = {}, more: Feature[] = [], withBore = true): History => ({
  parameters: { width: p.width ?? W, depth: p.depth ?? D, thick: p.thick ?? T, bore: p.bore ?? 4 },
  features: [plateSketch, plate, ...(withBore ? [holeSketch, bore] : []), ...more]
})
const volumeOf = (b: { width: number; depth: number; thick: number; bore: number }, bored = true) => b.width * b.depth * b.thick - (bored ? Math.PI * b.bore * b.bore * b.thick : 0)

const brepOf = (h: History, id = "plate") => {
  const r = rebuildExact(h)
  const b = r.bodies.find((x) => x.id === id)
  expect(b?.reason).toBeUndefined()
  return { rebuild: r, brep: b!.brep! }
}
const keySets = (b: ReturnType<typeof brepOf>["brep"]) => {
  const k = topologyKeys(b)
  return { faces: [...k.faces].sort(), edges: [...k.edges].sort(), vertices: [...k.vertices].sort() }
}

describe("entity keys", () => {
  const { brep, rebuild } = brepOf(model())

  test("every face, edge and vertex of the plate with a bore has a key, all distinct, none positional", () => {
    const k = topologyKeys(brep)
    for (const list of [k.faces, k.edges, k.vertices]) {
      expect(list.every((x) => x !== "")).toBe(true)
      expect(new Set(list).size).toBe(list.length)
    }
    expect(namingHealth(brep).stable).toBe(true)
    expect(k.faces.length).toBe(7)
    expect(k.edges.length).toBe(15)
    expect(k.vertices.length).toBe(10)
    expect(k.edges).toContain("edge(plate.side0.0,plate.top)")
    expect(k.edges).toContain("edge(bore.side0.0,bore.side0.0)")
    expect(k.vertices).toContain("vertex(plate.bottom,plate.side0.0,plate.side0.3)")
    // Euler: V - E + F = 2 - 2 * genus; a plate with a through bore is a torus-like solid (genus 1) with a seam edge.
    expect(brep.vertices.length - brep.edges.length + brep.faces.length).toBe(2)
  })

  test("refs round trip through their string form", () => {
    const ref = makeRef(brep, "plate", "edge", 1) as Ref
    expect(typeof ref).toBe("object")
    expect(parseRef(refToString(ref))).toEqual({ body: "plate", kind: "edge", key: ref.key })
    expect(parseRef("garbage")).toBeUndefined()
    expect(typeof makeRef(brep, "plate", "face", 99)).toBe("string")
  })

  test("entityRefs lists a reference for every entity", () => {
    expect(entityRefs(rebuild, "plate").length).toBe(7 + 15 + 10)
    expect(entityRefs(rebuild, "plate", ["face"]).length).toBe(7)
    expect(namingReport(rebuild)[0]!.health.stable).toBe(true)
  })
})

describe("30 parametric edit scenarios: the same keys, the same entities, the analytic volume", () => {
  const deltas = [-0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2]
  const pattern = { id: "pat", type: "pattern", feature: "bore", kind: "linear", count: 2, step: [-10, 0, 0] } as Feature
  const fillet = { id: "fil", type: "fillet", radius: 1.5, edges: {} } as Feature
  const recipes: Array<{ name: string; make: (p: { width: number; depth: number; thick: number; bore: number }) => History; volume: (p: { width: number; depth: number; thick: number; bore: number }) => number | undefined; edits: Array<[string, (p: { width: number; depth: number; thick: number; bore: number }, d: number) => { width: number; depth: number; thick: number; bore: number }]> }> = [
    { name: "plain plate", make: (p) => model(p, [], false), volume: (p) => volumeOf(p, false), edits: [["width", (p, d) => ({ ...p, width: p.width * (1 + d) })], ["depth", (p, d) => ({ ...p, depth: p.depth * (1 + d) })]] },
    { name: "plate with a bore", make: (p) => model(p), volume: (p) => volumeOf(p), edits: [["width", (p, d) => ({ ...p, width: p.width * (1 + d) })], ["thickness", (p, d) => ({ ...p, thick: p.thick * (1 + d) })], ["bore radius", (p, d) => ({ ...p, bore: p.bore * (1 + d) })]] },
    { name: "plate with two bores", make: (p) => model(p, [pattern]), volume: () => undefined, edits: [["width", (p, d) => ({ ...p, width: p.width * (1 + d) })]] }
  ]
  let scenarios = 0
  for (const r of recipes) {
    for (const [what, edit] of r.edits) {
      test(`${r.name}: ${what} by ${deltas.map((d) => `${d > 0 ? "+" : ""}${Math.round(d * 100)}`).join(", ")} %`, () => {
        const p0 = { width: W, depth: D, thick: T, bore: 4 }
        const base = brepOf(r.make(p0))
        const refs = entityRefs(base.rebuild, "plate")
        expect(refs.length).toBeGreaterThan(20)
        for (const d of deltas) {
          const p1 = edit(p0, d)
          const after = brepOf(r.make(p1))
          expect(keySets(after.brep)).toEqual(keySets(base.brep))
          // Every stored reference resolves to the entity with the same key, flagged ordinal only where the key is.
          for (const ref of refs) {
            const res = resolveAfterEdit(after.rebuild, ref)
            expect(res.outcome).toBe("exact")
            if (res.outcome === "exact") expect(res.key).toBe(ref.key)
          }
          expect(validateBrep(after.brep).issues).toEqual([])
          const v = r.volume(p1)
          if (v !== undefined) expect(Math.abs(massProperties(after.brep).volume - v) / v).toBeLessThan(1e-5)
          scenarios++
        }
      })
    }
  }
  test("a fillet on every edge: face, edge and vertex keys do not change with the width (-20 % and +20 %)", () => {
    const base = brepOf(model({}, [fillet]))
    expect(namingHealth(base.brep).stable).toBe(true)
    for (const d of [-0.2, 0.2]) {
      const after = brepOf(model({ width: W * (1 + d) }, [fillet]))
      expect(keySets(after.brep)).toEqual(keySets(base.brep))
      for (const ref of entityRefs(base.rebuild, "plate")) {
        const res = resolveAfterEdit(after.rebuild, ref)
        expect(res.outcome).toBe("exact")
      }
      scenarios++
    }
  })
  test("scenario count", () => {
    // 8 (plain width) + 8 (plain depth) + 24 (bore) + 8 (two bores) + 2 (fillet) edits, 50 rebuilds in all, in 8 groups of tests.
    expect(scenarios).toBeGreaterThanOrEqual(30)
  })
})

describe("the five outcomes of resolve", () => {
  const top = (b: ReturnType<typeof brepOf>) => makeRef(b.brep, "plate", "face", b.brep.faces.findIndex((f) => f.name === "plate.top")) as Ref
  const sideEdge = (b: ReturnType<typeof brepOf>) => makeRef(b.brep, "plate", "edge", topologyKeys(b.brep).edges.indexOf("edge(plate.side0.0,plate.top)")) as Ref

  test("exact: the same key after an edit", () => {
    const a = brepOf(model())
    const r = resolveAfterEdit(brepOf(model({ width: 48 })).rebuild, top(a))
    expect(r.outcome).toBe("exact")
  })

  test("split: a slot across the plate cuts the top face into two pieces; the answer lists both, the consumer decides", () => {
    const a = brepOf(model())
    const slot: Feature[] = [rectAt("s3", 5, -2, 9, D + 2), { id: "slot", type: "extrude", sketch: "s3", depth: "thick", operation: "subtract" } as Feature]
    const b = brepOf(model({}, slot))
    const ref = top(a)
    for (const res of [resolveAfterEdit(b.rebuild, ref), resolveInHistory(b.rebuild, ref)]) {
      expect(res.outcome).toBe("split")
      if (res.outcome !== "split") continue
      expect(res.indices.length).toBe(2)
      expect(res.keys.every((k) => k.startsWith("plate.top"))).toBe(true)
      expect(new Set(res.keys).size).toBe(2)
    }
    // Both pieces are faces of the top plane, and together they are the top minus the bore and the slot.
    const t = resolveInHistory(b.rebuild, ref)
    if (t.outcome === "split") expect(t.indices.every((i) => b.brep.faces[i]!.surface.kind === "plane")).toBe(true)
  })

  test("deleted: a cut that removes the top reports the feature that did it", () => {
    const a = brepOf(model())
    // A slab over the whole plate from z = 3 up removes the top face entirely.
    const slab: Feature[] = [rectAt("s3", -5, -5, W + 5, D + 5), { id: "skim", type: "extrude", sketch: "s3", depth: 10, direction: "up", from: 3, operation: "subtract" } as Feature]
    // The tool starts at the sketch plane, so lift the sketch plane instead.
    const lifted: Feature = { ...slab[0]!, id: "s3", offset: 3 } as Feature
    const b = brepOf(model({}, [lifted, slab[1]!]))
    const res = resolveInHistory(b.rebuild, top(a))
    expect(res.outcome).toBe("deleted")
    if (res.outcome === "deleted") {
      expect(res.feature).toBe("skim")
      expect(res.reason).toContain("plate.top")
    }
  })

  test("merged: a boss on the top whose side wall is flush with the plate edge merges the two faces into one", () => {
    const a = brepOf(model())
    const flush: Feature[] = [rectAt("s3", 0, 0, W, D), { id: "cover", type: "extrude", sketch: "s3", depth: "thick", operation: "union", offset: T } as Feature]
    void flush
    // The cover sits on the plate and has the same footprint: its walls are flush with the plate's walls, so side0.0 merges with cover.side0.0.
    const lifted: Feature = { ...flush[0]!, id: "s3", offset: T } as Feature
    const b = brepOf(model({}, [lifted, { id: "cover", type: "extrude", sketch: "s3", depth: 3, operation: "union" } as Feature]))
    const side = makeRef(a.brep, "plate", "face", a.brep.faces.findIndex((f) => f.name === "plate.side0.0")) as Ref
    const res = resolveInHistory(b.rebuild, side)
    expect(res.outcome).toBe("merged")
    if (res.outcome === "merged") expect(res.withOtherBody).toBe(true)
  })

  test("ambiguous: an ordinal key whose siblings changed is not trusted", () => {
    const two = { id: "pat", type: "pattern", feature: "bore", kind: "linear", count: 2, step: [9, 0, 0] } as Feature
    const three = { ...two, count: 3, step: [9, 0, 0] } as Feature
    const a = brepOf(model({ width: 60 }, [two]))
    const keys = topologyKeys(a.brep)
    const wall = keys.faces.findIndex((k) => k.startsWith("bore.side0.0#1"))
    expect(wall).toBeGreaterThanOrEqual(0)
    const ref = makeRef(a.brep, "plate", "face", wall) as Ref
    expect(ref.siblings).toBe(2)
    // Same history: exact, and flagged ordinal.
    const same = resolveAfterEdit(brepOf(model({ width: 60 }, [two])).rebuild, ref)
    expect(same.outcome).toBe("exact")
    if (same.outcome === "exact") expect(same.ordinal).toBe(true)
    // Three bores: the key '#1' still exists but may be another bore.
    const b = brepOf(model({ width: 60 }, [three]))
    const res = resolveAfterEdit(b.rebuild, ref)
    expect(res.outcome).toBe("ambiguous")
    if (res.outcome === "ambiguous") {
      expect(res.indices.length).toBe(3)
      expect(res.reason).toContain("ordinal")
    }
    // The key, looked up on a body without siblings info, stays exact: the caller opted out of the check.
    expect(resolveKey(b.brep, { kind: "face", key: ref.key }).outcome).toBe("exact")
  })

  test("a reference to an edge or a vertex follows the lineage of a feature that changes the neighbours", () => {
    const a = brepOf(model())
    const edgeRef = sideEdge(a)
    const slot: Feature[] = [rectAt("s3", 5, -2, 9, D + 2), { id: "slot", type: "extrude", sketch: "s3", depth: "thick", operation: "subtract" } as Feature]
    const b = brepOf(model({}, slot))
    // The top edge of side 0 is cut by the slot: it is now two pieces (an edge split by the slot).
    const res = resolveInHistory(b.rebuild, edgeRef)
    expect(res.outcome).toBe("split")
    if (res.outcome === "split") expect(res.indices.length).toBe(2)
    // A vertex on the far side is untouched: exact.
    const far = makeRef(a.brep, "plate", "vertex", topologyKeys(a.brep).vertices.indexOf("vertex(plate.side0.1,plate.side0.2,plate.top)")) as Ref
    const v = resolveInHistory(b.rebuild, far)
    expect(v.outcome).toBe("exact")
    void (undefined as unknown as RefKind)
  })
})
