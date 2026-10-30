import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, selectBlendEdges } from "./blend.ts"
import { booleanBrep } from "./boolean.ts"
import { draftPlanarFace } from "./draft.ts"
import { pushPullFace } from "./face-edit.ts"
import { massProperties } from "./mass.ts"
import { frame, type Vec3 } from "./math.ts"
import { makeBox, makeCylinder } from "./primitives.ts"
import { edgeLineage, provenanceOf, vertexLineage, type Provenance } from "./provenance.ts"
import { shellBrep } from "./shell.ts"
import { extrudeProfile, revolveProfile, type ProfileLoop } from "./sweep.ts"
import { mergeBreps, transformBrep, type Brep } from "./topology.ts"
import { translation } from "./math.ts"
import { validateBrep } from "./validate.ts"
import { uniqueFaceNames } from "./naming.ts"

setDefaultTimeout(120_000)

const vol = (b: Brep) => massProperties(b).volume

/** The N1 gate: every result face maps to at least one operand face or is new; the table is internally consistent. */
const consistent = (result: Brep, operands: ReadonlyArray<Brep>, p: Provenance) => {
  expect(p.faces.length).toBe(result.faces.length)
  const descendants = operands.map(() => new Map<number, number[]>())
  p.faces.forEach((f, r) => {
    expect(f.isNew || f.from.length > 0).toBe(true)
    expect(f.isNew).toBe(f.from.length === 0)
    for (const o of f.from) {
      expect(o.face).toBeGreaterThanOrEqual(0)
      expect(o.face).toBeLessThan(operands[o.operand]!.faces.length)
      const m = descendants[o.operand]!
      m.set(o.face, [...(m.get(o.face) ?? []), r])
    }
  })
  operands.forEach((_, k) => {
    // The pieces of a split face are exactly the result faces that list it; a face without descendants is deleted.
    for (const s of p.split[k]!) expect(new Set(s.into)).toEqual(new Set(descendants[k]!.get(s.face)))
    expect(p.deleted[k]!.every((fi) => !descendants[k]!.has(fi))).toBe(true)
    expect(p.deleted[k]!.length + descendants[k]!.size).toBe(operands[k]!.faces.length)
    for (const [face, into] of descendants[k]!) if (into.length > 1) expect(p.split[k]!.some((s) => s.face === face)).toBe(true)
  })
}
const fromOperand = (p: Provenance, r: number, operand: number) => p.faces[r]!.from.filter((o) => o.operand === operand)

describe("provenance of the Boolean", () => {
  const plate = makeBox(40, 25, 6)
  const bore = makeCylinder(4, 20, frame({ x: 20, y: 12, z: -5 }, { x: 0, y: 0, z: 1 }))

  test("a bore through a plate: the plate faces are the same or trimmed, the wall is the bore's, nothing is invented", () => {
    const r = booleanBrep(plate, bore, "subtract").brep
    const p = provenanceOf(r, [plate, bore])
    consistent(r, [plate, bore], p)
    expect(r.faces.length).toBe(7)
    // Top and bottom were cut by the bore: trimmed. The four sides were untouched: same.
    const rel = (name: string) => {
      const r2 = r.faces.findIndex((f) => f.name === name)
      expect(r2).toBeGreaterThanOrEqual(0)
      const a = fromOperand(p, r2, 0)
      expect(a.length).toBe(1)
      expect(plate.faces[a[0]!.face]!.name).toBe(name)
      return a[0]!.relation
    }
    expect(rel("top")).toBe("trimmed")
    expect(rel("bottom")).toBe("trimmed")
    for (const s of ["front", "back", "left", "right"]) expect(rel(s)).toBe("same")
    // The wall comes from the cylinder's lateral face, flipped (a subtraction turns the tool inside out); its caps are gone.
    const wall = r.faces.findIndex((f) => f.surface.kind === "cylinder")
    expect(fromOperand(p, wall, 0)).toEqual([])
    expect(fromOperand(p, wall, 1).length).toBe(1)
    expect(fromOperand(p, wall, 1)[0]!.flipped).toBe(true)
    expect(bore.faces[fromOperand(p, wall, 1)[0]!.face]!.surface.kind).toBe("cylinder")
    expect(p.deleted[1]!.length).toBe(2)
  })

  test("a slot across a plate splits the top face in two: both pieces list the top, the split is recorded", () => {
    const slot = makeBox(10, 40, 20, frame({ x: 15, y: -5, z: -5 }, { x: 0, y: 0, z: 1 }))
    const r = booleanBrep(plate, slot, "subtract").brep
    const p = provenanceOf(r, [plate, slot])
    consistent(r, [plate, slot], p)
    const top = plate.faces.findIndex((f) => f.name === "top")
    const pieces = r.faces.map((_, i) => i).filter((i) => fromOperand(p, i, 0).some((o) => o.face === top))
    expect(pieces.length).toBe(2)
    for (const i of pieces) expect(fromOperand(p, i, 0)[0]!.relation).toBe("split")
    expect(p.split[0]!.find((s) => s.face === top)!.into.length).toBe(2)
    // The faces count is conserved: the 6 plate faces became top, bottom, front and back in two pieces each, the two sides, and the slot walls (from the tool).
    expect(r.faces.length).toBe(12)
  })

  test("a union that makes two coplanar faces one records the merge with both ancestors", () => {
    const a = makeBox(10, 10, 10)
    const b = makeBox(10, 10, 10, frame({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
    const r = booleanBrep(a, b, "union").brep
    const p = provenanceOf(r, [a, b])
    consistent(r, [a, b], p)
    expect(r.faces.length).toBe(6)
    const top = r.faces.findIndex((f) => f.surface.kind === "plane" && f.name === "top")
    expect(top).toBeGreaterThanOrEqual(0)
    expect(p.faces[top]!.from.length).toBe(2)
    expect(p.faces[top]!.from.every((o) => o.relation === "merged")).toBe(true)
    expect(new Set(p.faces[top]!.from.map((o) => o.operand))).toEqual(new Set([0, 1]))
    // The two faces they shared are deleted from both.
    expect(p.deleted[0]!.length).toBe(1)
    expect(p.deleted[1]!.length).toBe(1)
  })

  test("a disjoint union keeps every face of both operands, same", () => {
    const a = makeBox(5, 5, 5)
    const b = makeBox(5, 5, 5, frame({ x: 20, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
    const r = booleanBrep(a, b, "union").brep
    const p = provenanceOf(r, [a, b])
    consistent(r, [a, b], p)
    expect(r.faces.length).toBe(12)
    expect(p.faces.every((f) => f.from.length === 1 && f.from[0]!.relation === "same")).toBe(true)
    expect(p.deleted[0]!.length + p.deleted[1]!.length).toBe(0)
  })

  test("the displacement recovery is transparent: a Boolean that needed it still traces to the caller's operands", () => {
    // Cylinder tangent to the box face along a line: the exact pipeline refuses, the recovery displaces the second operand.
    const a = makeBox(20, 20, 10)
    const b = makeCylinder(5, 12, frame({ x: 5, y: 10, z: -1 }, { x: 0, y: 0, z: 1 }))
    const r = booleanBrep(a, b, "union")
    const p = provenanceOf(r.brep, [a, b])
    consistent(r.brep, [a, b], p)
    expect(p.faces.some((f) => f.from.some((o) => o.operand === 1))).toBe(true)
  })
})

describe("provenance through transforms, merges and the unique names", () => {
  test("a moved body maps every face to itself; a merged pair maps to its parts", () => {
    const a = makeBox(4, 4, 4)
    const moved = transformBrep(a, translation({ x: 1, y: 2, z: 3 }))
    const p = provenanceOf(moved, [a])
    consistent(moved, [a], p)
    expect(p.faces.map((f) => f.from[0]!.face)).toEqual([0, 1, 2, 3, 4, 5])
    expect(p.faces.every((f) => f.from[0]!.relation === "same")).toBe(true)
    const both = mergeBreps([a, moved])
    const q = provenanceOf(both, [a, moved])
    consistent(both, [a, moved], q)
    expect(q.faces[7]!.from).toEqual([{ operand: 1, face: 1, relation: "same" }])
  })

  test("unique names rename but keep identity: the renamed body traces to the raw one", () => {
    const a = makeBox(10, 10, 10)
    const b = makeBox(10, 10, 10, frame({ x: 20, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
    const both = booleanBrep(a, b, "union").brep
    const unique = uniqueFaceNames(both)
    expect(unique).not.toBe(both)
    const p = provenanceOf(unique, [both])
    consistent(unique, [both], p)
    expect(p.faces.every((f, i) => f.from.length === 1 && f.from[0]!.face === i)).toBe(true)
    // And through to the original operands.
    const q = provenanceOf(unique, [a, b])
    consistent(unique, [a, b], q)
  })
})

describe("provenance of the feature operations (blend, shell, draft, push/pull, extrude, revolve)", () => {
  test("a fillet on one edge: the blend face is new, the two faces it joins and the two end faces are trimmed, the rest is the same", () => {
    const box = makeBox(20, 15, 10)
    const cands = blendCandidates(box)
    const edge = selectBlendEdges(cands, {})[0]!
    const res = blendBrep(box, [edge], 2)
    expect(res.blended).toBe(1)
    const p = provenanceOf(res.brep, [box])
    consistent(res.brep, [box], p)
    expect(res.brep.faces.length).toBe(7)
    const added = res.brep.faces.map((f, i) => ({ f, i })).filter(({ i }) => p.faces[i]!.isNew)
    expect(added.length).toBe(1)
    expect(added[0]!.f.surface.kind).toBe("cylinder")
    const relations = p.faces.filter((f) => !f.isNew).map((f) => f.from[0]!.relation)
    expect(relations.filter((r) => r === "trimmed").length).toBe(4)
    expect(relations.filter((r) => r === "same").length).toBe(2)
    expect(p.deleted[0]!.length).toBe(0)
  })

  test("a shell with one open face: the open face is deleted, the walls stay, the cavity faces are new", () => {
    const box = makeBox(30, 20, 12)
    const top = box.faces.findIndex((f) => f.name === "top")
    const res = shellBrep(box, 2, { open: [top] })
    expect(typeof res).not.toBe("string")
    if (typeof res === "string") return
    const p = provenanceOf(res.brep, [box])
    consistent(res.brep, [box], p)
    // Outer faces survive (the open top is trimmed to its rim, so it stays a face: it is an annulus).
    expect(p.faces.filter((f) => f.isNew).length).toBe(5)
    expect(vol(res.brep)).toBeCloseTo(30 * 20 * 12 - 26 * 16 * 10, 6)
  })

  test("push/pull of a face: the pushed face keeps its ancestor, the neighbours are trimmed or same", () => {
    const box = makeBox(20, 20, 10)
    const top = box.faces.findIndex((f) => f.name === "top")
    const r = pushPullFace(box, { near: { x: 10, y: 10, z: 10 }, face: top, distance: 5 })
    expect(typeof r).not.toBe("string")
    if (typeof r === "string") return
    const p = provenanceOf(r, [box])
    consistent(r, [box], p)
    expect(vol(r)).toBeCloseTo(20 * 20 * 15, 6)
    expect(p.faces.every((f) => f.isNew || f.from.length >= 1)).toBe(true)
    // The four walls of the prism are new; the pushed face is the old top, offset; the old top is not deleted (it is that face).
    expect(p.faces.filter((f) => f.isNew).length).toBe(4)
    const moved = r.faces.findIndex((f) => f.name === "top")
    expect(p.faces[moved]!.from).toEqual([{ operand: 0, face: top, relation: "offset" }])
    expect(p.deleted[0]!.length).toBe(0)
  })

  test("a draft: the new body's faces all descend from the box or are new", () => {
    const box = makeBox(20, 20, 10)
    const r = draftPlanarFace(box, { near: { x: 20, y: 10, z: 5 }, normal: { x: 1, y: 0, z: 0 }, pull: { x: 0, y: 0, z: 1 }, neutral: 0, angle: 3 })
    expect(typeof r).not.toBe("string")
    if (typeof r === "string") return
    const p = provenanceOf(r, [box])
    consistent(r, [box], p)
    expect(validateBrep(r).issues).toEqual([])
    expect(p.faces.some((f) => !f.isNew)).toBe(true)
  })

  test("extrude and revolve have no operands: every face is new, and the roles are the names", () => {
    const rect: ProfileLoop = [
      { kind: "line", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { kind: "line", a: { x: 4, y: 0 }, b: { x: 4, y: 3 } },
      { kind: "line", a: { x: 4, y: 3 }, b: { x: 0, y: 3 } }, { kind: "line", a: { x: 0, y: 3 }, b: { x: 0, y: 0 } }
    ]
    const e = extrudeProfile({ loops: [rect] }, 5, { name: "pad" })
    const pe = provenanceOf(e, [])
    expect(pe.faces.every((f) => f.isNew)).toBe(true)
    expect(e.faces.map((f) => f.name).sort()).toContain("pad.top")
    const shifted: ProfileLoop = rect.map((s) => (s.kind === "line" ? { ...s, a: { x: s.a.x + 2, y: s.a.y }, b: { x: s.b.x + 2, y: s.b.y } } : s)) as ProfileLoop
    const rv = revolveProfile({ loops: [shifted] }, Math.PI * 2, { name: "ring" })
    expect(provenanceOf(rv, []).faces.every((f) => f.isNew)).toBe(true)
  })
})

describe("edge and vertex lineage", () => {
  test("a bore in a plate: the sides' edges are the box's edges (some split), the rim circles are new", () => {
    const plate = makeBox(40, 25, 6)
    const bore = makeCylinder(4, 20, frame({ x: 20, y: 12, z: -5 }, { x: 0, y: 0, z: 1 }))
    const r = booleanBrep(plate, bore, "subtract").brep
    const p = provenanceOf(r, [plate, bore])
    const el = edgeLineage(r, [plate, bore], p)
    const circles = r.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.curve.kind === "circle")
    expect(circles.length).toBe(2)
    for (const c of circles) expect(el[c.i]!.isNew).toBe(true)
    const vertical = r.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.curve.kind === "line" && Math.abs(e.curve.dir.z) > 0.99)
    // Four vertical edges of the plate keep their ancestor; the cylinder seam is the bore tool.s edge.
    expect(vertical.length).toBe(5)
    expect(vertical.filter(({ i }) => el[i]!.from.some((x) => x.operand === 0)).length).toBe(4)
    expect(vertical.filter(({ i }) => el[i]!.from.some((x) => x.operand === 1)).length).toBe(1)
    // Vertices: the plate's 8 corners are the same vertices; the seam points of the rim circles are new.
    const vl = vertexLineage(r, [plate, bore])
    expect(vl.filter((v) => !v.isNew).length).toBe(8)
    void (undefined as unknown as Vec3)
  })
})
