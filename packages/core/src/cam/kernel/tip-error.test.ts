/**
 * Spec 69 B6: the tip-error gate of tool-centre-point output. The replay of the emitted NC (carried back to machine coordinates) is measured
 * against the planned path, point by point; the figure is written on the artifact (`tipError`) with the limit it is held to.
 *
 * Gate: with the post splitting at 0.005 mm (`post.options.tolerance`) the measured tip error of every dialect that has a tip-control word
 * stays within 0.005 mm plus the declared rounding of the written angles (the artifact's `limit`), and a program whose tip is wrong is
 * caught: a pivot that is off by 2 mm in the carried kinematics (the replay's, not the post's) shows as an error far over the limit.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../../cad/history-brep.ts"
import { model } from "../../cad/script.ts"
import { fiveAxisKinematic } from "../five-axis.ts"
import { swarfWalls } from "../swarf-walls.ts"
import type { PostId, PostOptions } from "../post/types.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"
import { tipError } from "./tip-error.ts"

setDefaultTimeout(300_000)

const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const trunnion = findMachine("trunnion-5ax")!
const domeJob = (post: PostId, options?: Partial<PostOptions>): ManufacturingJob => ({
  schemaVersion: 1, id: "five", name: "Five-axis dome", material: "6061", part: { kind: "elements", elements: [base, dome] },
  stock: { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }, tools: [ball],
  operations: [{ id: "five-finish", strategy: "multiaxis", tool: ball.id, top: 17, stepover: 20, toolAxis: "normal" }],
  machine: { ...trunnion, post }, quality: { resolution: 0.4 }, ...(options !== undefined ? { post: { options } } : {})
})

const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 30, taper: 5 })
const history = m.build()
const cone = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history }
const exact = rebuildExact(history).bodies[0]!.brep!
const wall = swarfWalls(exact).walls.find((w) => exact.faces[w.face]!.surface.kind === "cone")!.wall
const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!
const winding = { ...trunnion, fiveAxis: { ...trunnion.fiveAxis!, rotation: [-720, 720] as const } }
const swarfJob = (post: PostId, options?: Partial<PostOptions>): ManufacturingJob => ({
  schemaVersion: 1, id: "swarf", name: "Swarf cone", material: "6061", part: { kind: "elements", elements: [cone] },
  stock: { min: { x: -24, y: -24, z: 0 }, max: { x: 24, y: 24, z: 31 } }, tools: [flat],
  operations: [{ id: "swarf-cone", strategy: "multiaxis", mode: "swarf", tool: flat.id, top: 30, stepover: 20, walls: [wall] }],
  machine: { ...winding, post }, quality: { resolution: 0.5 }, ...(options !== undefined ? { post: { options } } : {})
})

const run = (j: ManufacturingJob): CamArtifact => {
  const r = runJob(j)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

const GATE = 0.005
const figures: string[] = []

describe("B6: tool-centre-point tip error", () => {
  for (const post of ["fanuc", "siemens", "heidenhain"] as const) {
    for (const [name, make] of [["dome", domeJob], ["swarf", swarfJob]] as const) {
      test(`${post} ${name}: the tip the NC makes is within ${GATE} mm of the plan (plus the declared angle rounding)`, () => {
        const a = run(make(post, { tcp: true, tolerance: GATE }))
        expect(a.tipError).toBeDefined()
        const e = a.tipError!
        figures.push(`${post} ${name}: max ${e.max.toFixed(5)} mm, mean ${e.mean.toFixed(5)} mm over ${e.samples} points, limit ${e.limit.toFixed(5)} mm`)
        expect(e.samples).toBeGreaterThan(50)
        expect(e.max).toBeLessThanOrEqual(e.limit)
        expect(e.limit).toBeLessThan(GATE + 0.05)
        expect(a.issues.some((i) => /strays .* mm from the planned path/.test(i.message))).toBe(false)
      })
    }
  }

  test("a post that applies the wrong pivot is caught: the tip is reported far over the limit and the release is not verified", () => {
    const five = trunnion.fiveAxis!
    const kinematics = fiveAxisKinematic({ layout: five.layout, limits: { tilt: five.tilt }, pivot: { ...five.pivot, z: five.pivot.z + 2 }, tcp: "program" })
    const a = run(domeJob("fanuc", { tcp: true, tolerance: GATE, kinematics }))
    expect(a.tipError!.max).toBeGreaterThan(a.tipError!.limit * 20)
    expect(a.issues.some((i) => i.tag === "ReplayMismatch" && /strays .* mm from the planned path/.test(i.message) && i.severity === "error")).toBe(true)
    expect(a.release).not.toBe("verified-program")
  })

  test("haas (turning rapids written as feed moves) is not measured, and says so by having no figure", () => {
    expect(run(domeJob("haas", { tcp: true, tolerance: GATE })).tipError).toBeUndefined()
  })

  test("a program without tool-centre-point words has no tip figure", () => {
    expect(run(domeJob("fanuc")).tipError).toBeUndefined()
  })

  test("the figure measures: a replay path 0.05 mm off the plan is reported as 0.05 mm", () => {
    const planned = [{ rapid: false, from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 0, z: 0 }, line: 1 }, { rapid: false, from: { x: 10, y: 0, z: 0 }, to: { x: 10, y: 10, z: 0 }, line: 2 }]
    const replayed = [
      { kind: "linear" as const, from: { x: 0, y: 0.05, z: 0 }, to: { x: 10, y: 0.05, z: 0 }, feed: 100, line: 5 },
      { kind: "linear" as const, from: { x: 10, y: 0.05, z: 0 }, to: { x: 10, y: 10, z: 0 }, feed: 100, line: 6 }
    ]
    const e = tipError(planned, replayed)
    expect(e.max).toBeCloseTo(0.05, 6)
    expect(e.line).toBe(5)
    expect(tipError(planned, [{ kind: "linear", from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 0, z: 0 }, feed: 1, line: 1 }]).max).toBe(0)
  })

  test("measured figures", () => {
    // Written to the test output so the spec figure is the measured one.
    console.log(`B6 tip error (post tolerance ${GATE} mm):\n${figures.join("\n")}`)
    expect(figures.length).toBeGreaterThan(0)
  })
})
