import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, booleanBrep, deleteFaces, frame, makeBox, makeCylinder, massProperties, validateBrep, type Brep } from "./index.ts"

setDefaultTimeout(120_000)

const vol = (b: Brep) => massProperties(b).volume
const faceIdx = (b: Brep, pred: (f: Brep["faces"][number]) => boolean) => b.faces.map((f, i) => (pred(f) ? i : -1)).filter((i) => i >= 0)
const atZ = (z: number) => (f: Brep["faces"][number]) => f.surface.kind === "plane" && Math.abs(f.surface.frame.origin.z - z) < 1e-6 && Math.abs(f.surface.frame.z.z) > 0.99
const ok = (r: ReturnType<typeof deleteFaces>): { brep: Brep; effect: string } => {
  if (typeof r === "string") throw new Error(r)
  return r
}

describe("delete face with heal", () => {
  test("a blind hole is filled: wall and floor deleted, the plate is a plain box again", () => {
    const holed = booleanBrep(makeBox(40, 30, 10), makeCylinder(4, 6, frame({ x: 20, y: 15, z: 4 })), "subtract").brep
    const S = faceIdx(holed, (f) => f.surface.kind === "cylinder" || atZ(4)(f))
    expect(S.length).toBe(2)
    const out = ok(deleteFaces(holed, S))
    expect(out.effect).toBe("fill")
    expect(validateBrep(out.brep).valid).toBe(true)
    expect(Math.abs(vol(out.brep) - 12000)).toBeLessThan(1e-3)
    expect(out.brep.faces.length).toBe(6)
  })
  test("a through hole is filled between two planes", () => {
    const holed = booleanBrep(makeBox(40, 30, 10), makeCylinder(4, 14, frame({ x: 20, y: 15, z: -2 })), "subtract").brep
    const out = ok(deleteFaces(holed, faceIdx(holed, (f) => f.surface.kind === "cylinder")))
    expect(Math.abs(vol(out.brep) - 12000)).toBeLessThan(1e-3)
    expect(out.brep.faces.length).toBe(6)
  })
  test("a chamfer is deleted: the sharp edge returns", () => {
    const box = makeBox(20, 20, 10)
    const cham = blendBrep(box, [blendCandidates(box)[0]!], 2, "chamfer").brep
    expect(cham.faces.length).toBe(7)
    const S = faceIdx(cham, (f) => f.surface.kind === "plane" && Math.max(Math.abs(f.surface.frame.z.x), Math.abs(f.surface.frame.z.y), Math.abs(f.surface.frame.z.z)) < 0.99)
    expect(S.length).toBe(1)
    const out = ok(deleteFaces(cham, S))
    expect(Math.abs(vol(out.brep) - 4000)).toBeLessThan(1e-3)
    expect(out.brep.faces.length).toBe(6)
  })
  test("a fillet is deleted the same way", () => {
    const box = makeBox(20, 20, 10)
    const rounded = blendBrep(box, [blendCandidates(box)[0]!], 2).brep
    const S = faceIdx(rounded, (f) => f.surface.kind === "cylinder")
    expect(S.length).toBe(1)
    const out = ok(deleteFaces(rounded, S))
    expect(Math.abs(vol(out.brep) - 4000)).toBeLessThan(1e-3)
  })
  test("a boss is removed with its top; the wall alone has a mixed boundary and is refused", () => {
    const withBoss = booleanBrep(makeBox(40, 30, 10), makeCylinder(5, 8, frame({ x: 20, y: 15, z: 10 })), "union").brep
    const S = faceIdx(withBoss, (f) => f.surface.kind === "cylinder" || atZ(18)(f))
    expect(S.length).toBe(2)
    const out = ok(deleteFaces(withBoss, S))
    expect(out.effect).toBe("cut")
    expect(Math.abs(vol(out.brep) - 12000)).toBeLessThan(1e-3)
    expect(typeof deleteFaces(withBoss, [S[0]!])).toBe("string")
  })
  test("refusals: no faces, unknown face, the whole solid", () => {
    const box = makeBox(10, 10, 10)
    expect(typeof deleteFaces(box, [])).toBe("string")
    expect(typeof deleteFaces(box, [99])).toBe("string")
    expect(typeof deleteFaces(box, [0, 1, 2, 3, 4, 5])).toBe("string")
  })
})
