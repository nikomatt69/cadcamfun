import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { faceByName } from "./naming.ts"
import { booleanBrep } from "./boolean.ts"
import { frame } from "./math.ts"
import { makeCylinder } from "./primitives.ts"
import { moveNurbsFace, pushPullNurbsFace, recognizeNurbsFaces, tessellatedVolume } from "./nurbs-edit.ts"
import { surfacePatch, thickenSurfacePatch } from "./surface-patch.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(600_000)
const volume = tessellatedVolume
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
/** A biquadratic patch over the square 10 x 10 in x and y, rising and falling in z (a gentle bump): its projection on the XY plane is exactly 100 mm². */
const bump = () => ({
  degreeU: 2, degreeV: 2, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 1, 1, 1],
  points: [0, 5, 10].map((x) => [0, 5, 10].map((y) => [x, y, x === 5 && y === 5 ? 3 : x === 5 || y === 5 ? 1 : 0]))
})
/** The patch thickened 2 mm along Z: a solid of exactly 100 x 2 mm³, its top face a free-form patch. */
const block = () => thickenSurfacePatch(surfacePatch(bump()), 2, { x: 0, y: 0, z: 1 })
const top = (b: Brep) => faceByName(b, "thicken.top")!

describe("moving a free-form face", () => {
  test("the solid is read: two patch faces, the top one looking up", () => {
    const b = block()
    expect(volume(b)).toBeCloseTo(200, 6)
    const faces = recognizeNurbsFaces(b)
    expect(faces.map((f) => f.face).sort()).toEqual([faceByName(b, "thicken.bottom")!, top(b)].sort())
    const t = faces.find((f) => f.face === top(b))!
    expect(t.normal.z).toBeGreaterThan(0.9)
    expect(t.spread).toBeGreaterThan(0)
  })

  test("pushed out along Z the face moves as a rigid piece: the volume grows by 100 x d (the projected area, whatever the shape)", () => {
    const b = block()
    for (const d of [2.5]) {
      const r = ok(pushPullNurbsFace(b, top(b), d, { x: 0, y: 0, z: 1 }))
      expect(validateBrep(r).valid).toBe(true)
      expect(volume(r)).toBeCloseTo(200 + 100 * d, 4)
    }
  })

  test("pulled in the face cuts the same slab out, and the default direction is the face's mean normal", () => {
    const b = block()
    const r = ok(pushPullNurbsFace(b, top(b), -1, { x: 0, y: 0, z: 1 }))
    expect(volume(r)).toBeCloseTo(100, 4)
    const along = ok(pushPullNurbsFace(b, top(b), 1))
    // Along the mean normal (tilted a little from Z) the slab is a little thinner in Z, a little wider across: a different, larger-than-nothing volume close to 100.
    expect(volume(along) - 200).toBeGreaterThan(95)
    expect(volume(along) - 200).toBeLessThan(105)
  })

  test("the bottom face moves down: pushing it out thickens the part below", () => {
    const b = block()
    const bottom = faceByName(b, "thicken.bottom")!
    const r = ok(pushPullNurbsFace(b, bottom, 1.5, { x: 0, y: 0, z: -1 }))
    expect(volume(r)).toBeCloseTo(200 + 150, 4)
  })

  test("what it cannot do is refused with the reason: a direction the face folds across, a wall that is not a NURBS face, a zero distance", () => {
    const b = block()
    expect(pushPullNurbsFace(b, top(b), 1, { x: 1, y: 0, z: 0 })).toMatch(/folds across the direction/)
    expect(pushPullNurbsFace(b, top(b), 0)).toMatch(/non-zero/)
    const wall = b.faces.findIndex((f) => f.surface.kind === "extrusion")
    expect(pushPullNurbsFace(b, wall, 1)).toMatch(/not a NURBS face/)
  })
})

describe("a free-form face trimmed by a circle", () => {
  /** The thickened bump cut by a vertical cylinder of radius 4 at (5, 5): its top face is the bump trimmed by a circle. */
  const disc = () => booleanBrep(block(), makeCylinder(4, 20, frame({ x: 5, y: 5, z: -5 }, { x: 0, y: 0, z: 1 })), "intersect").brep

  test("the trimmed face is read, and moved with its footprint: the volume grows by the disc's area x d (closed form), the deviation of the polyline is reported", () => {
    const b = disc()
    expect(volume(b)).toBeCloseTo(Math.PI * 16 * 2, 1)
    const faces = recognizeNurbsFaces(b)
    expect(faces).toHaveLength(2)
    const up = faces.find((f) => f.normal.z > 0.9)!
    const moved = moveNurbsFace(b, up.face, 1, { x: 0, y: 0, z: 1 })
    if (typeof moved === "string") throw new Error(moved)
    expect(moved.deviation).toBeLessThanOrEqual(0.006)
    expect(validateBrep(moved.brep).valid).toBe(true)
    // The footprint is a little narrower than the trim (the deviation), so the growth is the disc's area x d less a ring of that width.
    const ring = 2 * Math.PI * 4 * moved.deviation! * 2
    expect(Math.abs(volume(moved.brep) - volume(b) - Math.PI * 16)).toBeLessThan(ring)
    const pulled = moveNurbsFace(b, up.face, -1, { x: 0, y: 0, z: 1 })
    if (typeof pulled === "string") throw new Error(pulled)
    expect(pulled.deviation).toBeLessThanOrEqual(0.006)
    expect(Math.abs(volume(b) - volume(pulled.brep) - Math.PI * 16)).toBeLessThan(ring)
  })
})
