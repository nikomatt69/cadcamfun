import { describe, expect, test } from "bun:test"
import { boxSolid, checkMotion, cylinderSolid, headScene, trunnionScene, type Cutter, type TableEnvelope } from "./index.ts"

const flat: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }
const head = { pivot: { x: 0, y: 0, z: 100 }, gauge: 40, tilt: [-120, 120] as const }
const table = (top: number): TableEnvelope => ({ centre: { x: 0, y: 0 }, top, radius: 15, depth: 50 })

describe("collision solids", () => {
  test("the capped cylinder has the exact signed distance inside, beside and above", () => {
    const up = { x: 0, y: 0, z: 1 }
    const c = cylinderSolid({ x: 0, y: 0, z: 0 }, up, 0, 10, 5)
    expect(c.sdf({ x: 0, y: 0, z: 5 })).toBeCloseTo(-5, 9)
    expect(c.sdf({ x: 8, y: 0, z: 5 })).toBeCloseTo(3, 9)
    expect(c.sdf({ x: 0, y: 0, z: 12 })).toBeCloseTo(2, 9)
    expect(c.sdf({ x: 8, y: 0, z: 12 })).toBeCloseTo(Math.hypot(3, 2), 9)
  })

  test("the box has the exact signed distance with the identity frame", () => {
    const b = boxSolid({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, (p) => p)
    expect(b.sdf({ x: 0, y: 0, z: 0 })).toBeCloseTo(-1, 9)
    expect(b.sdf({ x: 2, y: 0, z: 0 })).toBeCloseTo(1, 9)
    expect(b.sdf({ x: 2, y: 2, z: 0 })).toBeCloseTo(Math.SQRT2, 9)
  })
})

describe("continuous collision", () => {
  test("a head that holds still above the table is clear, with the shank's certified clearance", () => {
    // The shank's lowest sample is 18 mm below the nose and 12 mm above the table top: clearance 12 - 5 (radius) = 7 mm, and the
    // sample spacing (18 / 8) may hide up to half of it.
    const scene = headScene(flat, head, table(70))
    const r = checkMotion(scene, { tilt: 0, c: 0 }, { tilt: 0, c: 0 })
    expect(r.verdict).toBe("clear")
    expect(r.clearance).toBeCloseTo(7 - 18 / 8 / 2, 6)
  })

  test("a shank that starts inside the table is reported as a collision at the start", () => {
    const r = checkMotion(headScene(flat, head, table(90)), { tilt: 0, c: 0 }, { tilt: 30, c: 0 })
    expect(r.verdict).toBe("collision")
    expect(r.at).toBe(0)
    expect(r.clearance).toBeLessThan(0)
  })

  test("a head tilt that lifts the shank is clear over the whole move", () => {
    const r = checkMotion(headScene(flat, head, table(70)), { tilt: 0, c: 0 }, { tilt: 60, c: 0 })
    expect(r.verdict).toBe("clear")
    expect(r.clearance).toBeGreaterThan(0)
  })

  test("the bisection depth decides: a move the bound cannot yet prove is unresolved, and clear with enough depth", () => {
    const scene = headScene(flat, head, table(70))
    // At depth 0 the bound on the whole 60-degree move is about 1 mm, short of a 2 mm margin; bisection proves the clearance of
    // each part of the move, and the true clearance stays well above 2 mm.
    const margin = 2
    expect(checkMotion(scene, { tilt: 0, c: 0 }, { tilt: 60, c: 0 }, { margin, maxDepth: 0 }).verdict).toBe("unresolved")
    const refined = checkMotion(scene, { tilt: 0, c: 0 }, { tilt: 60, c: 0 }, { margin, maxDepth: 12 })
    expect(refined.verdict).toBe("clear")
    expect(refined.clearance).toBeGreaterThanOrEqual(margin)
  })

  test("a part turning under a fixed spindle is found in the sweep, not only at its end poses", () => {
    // The part box (30 x 30 x 10 half-extents) sits 10..30 mm below the table pivot; the shank bottom is 18 mm below the nose at
    // z = 40. At A = 0 the box is far below; the rotation about X swings its edge up through the shank's line.
    const part = { centre: { x: 0, y: 0, z: -20 }, half: { x: 30, y: 30, z: 10 } }
    const scene = trunnionScene(flat, "table-AC", { x: 0, y: 0, z: 40 }, { x: 0, y: 0, z: 0 }, part)
    expect(checkMotion(scene, { tilt: 0, c: 0 }, { tilt: 0, c: 0 }).verdict).toBe("clear")
    const sweep = checkMotion(scene, { tilt: 0, c: 0 }, { tilt: 135, c: 0 })
    expect(sweep.verdict).toBe("collision")
    expect(sweep.at).toBeGreaterThan(0)
  })
})

/** The densest reference: the clearance at `n` evenly spaced poses, with every probe point sampled by its own axis. */
const denseMinimum = (scene: Parameters<typeof checkMotion>[0], from: { tilt: number; c: number }, to: { tilt: number; c: number }, n: number): number => {
  let m = Infinity
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const pose = { tilt: from.tilt + (to.tilt - from.tilt) * t, c: from.c + (to.c - from.c) * t }
    const obstacles = scene.obstaclesAt(pose)
    for (const cap of scene.probesAt(pose)) {
      for (let j = 0; j <= 64; j++) {
        const f = j / 64
        const p = { x: cap.a.x + (cap.b.x - cap.a.x) * f, y: cap.a.y + (cap.b.y - cap.a.y) * f, z: cap.a.z + (cap.b.z - cap.a.z) * f }
        for (const o of obstacles) m = Math.min(m, o.sdf(p) - cap.radius)
      }
    }
  }
  return m
}

describe("certified bound against a dense reference", () => {
  test("the certified clearance never exceeds the densely sampled clearance of the move", () => {
    const part = { centre: { x: 0, y: 0, z: -20 }, half: { x: 30, y: 30, z: 10 } }
    const cases = [
      { scene: headScene(flat, head, table(70)), from: { tilt: 0, c: 0 }, to: { tilt: 60, c: 0 } },
      { scene: headScene(flat, head, table(84)), from: { tilt: -20, c: 0 }, to: { tilt: 40, c: 0 } },
      { scene: trunnionScene(flat, "table-AC", { x: 0, y: 0, z: 40 }, { x: 0, y: 0, z: 0 }, part), from: { tilt: 0, c: 0 }, to: { tilt: 135, c: 0 } },
      { scene: trunnionScene(flat, "table-AC", { x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 0 }, part), from: { tilt: 0, c: 0 }, to: { tilt: 90, c: 40 } }
    ]
    for (const { scene, from, to } of cases) {
      const r = checkMotion(scene, from, to, { margin: -1e9, maxDepth: 14 })
      const dense = denseMinimum(scene, from, to, 2000)
      if (r.verdict === "collision") {
        // A collision reports the sampled overlap: an upper bound on the true clearance, and the reference shows the overlap.
        expect(dense).toBeLessThan(0)
        expect(r.clearance).toBeGreaterThanOrEqual(dense - 1e-9)
      } else {
        expect(r.clearance).toBeLessThanOrEqual(dense + 1e-9)
      }
    }
  })
})
