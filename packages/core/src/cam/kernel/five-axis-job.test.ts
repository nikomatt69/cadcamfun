import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"
import { Schema } from "effect"
import { OperationSpecSchema } from "./schema.ts"

setDefaultTimeout(100_000)

// A dome on a base, cut by a five-axis finish on the trunnion machine. The part is the one the freeform test roughs.
const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const stock = { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }

const job = (machine: string, operations: ReadonlyArray<OperationSpec>): ManufacturingJob => ({
  schemaVersion: 1, id: "five", name: "Five-axis dome", material: "6061", part: { kind: "elements", elements: [base, dome] },
  stock, tools: [ball], operations, machine: findMachine(machine)!, quality: { resolution: 0.4 }
})
const multiaxis = (tool: string): Extract<OperationSpec, { strategy: "multiaxis" }> => ({ id: "five-finish", strategy: "multiaxis", tool, top: 17, stepover: 20, toolAxis: "normal" })

describe("five-axis operations in the kernel", () => {
  test("a five-axis finish on the trunnion writes simultaneous A/C words and the run completes", () => {
    const r = runJob(job("trunnion-5ax", [multiaxis(ball.id)]))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const a: CamArtifact = r.value
    expect(a.operations.map((o) => o.strategy)).toEqual(["multiaxis"])
    expect(a.operations[0]!.cut).toBe("finish-3d")
    expect(a.operations[0]!.parameters["mode"]).toBe("parallel")
    const skipped = a.operations[0]!.parameters["skippedSamples"] as number
    expect(skipped).toBeGreaterThan(0)
    expect(a.claims.filter((c) => c.id === "part-coverage")).toHaveLength(1)
    expect(a.claims.find((c) => c.id === "part-coverage")).toMatchObject({ status: "unresolved", detail: expect.stringContaining(`${skipped} required multiaxis contact samples`) })
    // The table turns while the axes move: the NC has rotary words on the cutting blocks.
    expect(a.nc).toMatch(/\bA-?\d/)
    expect(a.nc).toMatch(/\bC-?\d/)
    // The replay reads the NC the post wrote, so it must not fail on the G-words of the five-axis program.
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).not.toBe("failed")
    // Moves that turn the table are replayed on the tri-dexel (spec 72 step 0.3): the ball at the foot of the dome cuts into its flank,
    // which is a failed claim with an error, and the claim names the replay that found it and its declared error.
    const gouge = a.claims.find((c) => c.id === "no-gouge")!
    expect(gouge.status).toBe("failed")
    expect(gouge.detail).toMatch(/tri-dexel/)
    expect(a.issues.some((i) => i.tag === "Gouge" && /declared error/.test(i.message))).toBe(true)
    expect(a.release).toBe("blocked")
    expect(a.claims.find((c) => c.id === "material-removed")!.status).not.toBe("passed")
    // The five-axis removal is bracketed on the raw stock: a positive removal, lower bound not above the upper bound.
    const bracket = /between (\d+) and (\d+) mm³/.exec(a.claims.find((c) => c.id === "material-removed")!.detail)
    expect(bracket).not.toBeNull()
    expect(Number(bracket![1])).toBeGreaterThan(0)
    expect(Number(bracket![1])).toBeLessThanOrEqual(Number(bracket![2]))
    // The same bracket is structured on the artifact, so API and desktop do not parse the claim text.
    const five = a.stock.fiveAxis!
    expect(five).toBeDefined()
    expect(five.voxelMm).toBe(2)
    expect(five.removedLower).toBeGreaterThan(0)
    expect(five.removedLower).toBeLessThanOrEqual(five.removedUpper)
    expect(five.remainingLower).toBeLessThanOrEqual(five.remainingUpper)
    expect(five.removedLower + five.remainingUpper).toBeCloseTo(five.removedUpper + five.remainingLower, 0)
    // The bracket sums to the voxel grid volume (44 x 44 x 18 mm at 2 mm voxels), which covers the stock box.
    expect(five.removedLower + five.remainingUpper).toBeCloseTo(44 * 44 * 18, 0)
    expect(Math.round(five.removedLower)).toBe(Number(bracket![1]))
    expect(Math.round(five.removedUpper)).toBe(Number(bracket![2]))
    // The turned moves are checked in the trunnion scene (spec 69 A4): a verdict, never `unsupported`.
    expect(["passed", "failed", "unresolved"]).toContain(a.claims.find((c) => c.id === "machine-clearance")!.status)
    expect(a.claims.find((c) => c.id === "machine-clearance")!.detail).toMatch(/trunnion scene|reaches the table|not proven clear/)
  })

  test("the B/C trunnion writes B and C words together, no A word, and the bracket and replay follow", () => {
    const r = runJob(job("trunnion-5ax-bc", [multiaxis(ball.id)]))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const a = r.value
    expect(a.nc).toMatch(/\bB-?\d/)
    expect(a.nc).toMatch(/\bC-?\d/)
    expect(a.nc).not.toMatch(/\bA-?\d+\.\d/)
    // B and C move on the same cutting blocks (simultaneous, not indexed apart).
    expect(a.nc.split("\n").some((l) => /\bB-?\d/.test(l) && /\bC-?\d/.test(l) && /\bX-?\d/.test(l))).toBe(true)
    expect(a.stock.fiveAxis).toBeDefined()
    expect(a.stock.fiveAxis!.removedLower).toBeGreaterThan(0)
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).not.toBe("failed")
    expect(findMachine("trunnion-5ax-bc")!.fiveAxis).toEqual({ layout: "table-BC", pivot: { x: 0, y: 0, z: -100 }, tilt: [-120, 120] })
  })

  test("a five-axis operation on a machine without a rotary table fails that operation with a typed issue", () => {
    const r = runJob(job("vmc-standard", [multiaxis(ball.id)]))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.operations[0]!.status).toBe("failed")
    expect(r.value.issues.some((i) => /5-axis machine|rotary table/.test(i.message))).toBe(true)
  })

  test("the trunnion pivot is a machine property: the preset carries it and the 3-axis presets do not", () => {
    expect(findMachine("trunnion-5ax")!.fiveAxis!.pivot).toEqual({ x: 0, y: 0, z: -100 })
    expect(findMachine("vmc-standard")!.fiveAxis).toBeUndefined()
  })

  test("the same job on the same machine gives byte-identical NC", () => {
    const a = runJob(job("trunnion-5ax", [multiaxis(ball.id)]))
    const b = runJob(job("trunnion-5ax", [{ ...multiaxis(ball.id), mode: "parallel" }]))
    if (a.status !== "ok" || b.status !== "ok") throw new Error("the five-axis job must run")
    expect(a.value.nc).toBe(b.value.nc)
  })

  test("the shared operation schema preserves contour mode and execution generates its distinct NC", () => {
    const decoded = Schema.decodeUnknownSync(OperationSpecSchema)({ ...multiaxis(ball.id), mode: "contour", stepdown: 4 })
    expect(decoded).toMatchObject({ mode: "contour" })
    expect(() => Schema.decodeUnknownSync(OperationSpecSchema)({ ...decoded, mode: "unsupported" })).toThrow()
    const contour = runJob(job("trunnion-5ax", [decoded]))
    const parallel = runJob(job("trunnion-5ax", [{ ...multiaxis(ball.id), stepdown: 4 }]))
    if (contour.status !== "ok" || parallel.status !== "ok") throw new Error("Both modes must run")
    expect(contour.value.operations[0]!.status).toBe("ok")
    expect(contour.value.operations[0]!.parameters["mode"]).toBe("contour")
    expect(contour.value.nc).not.toBe(parallel.value.nc)
    expect(contour.value.nc).toMatch(/\bA-?\d/)
    expect(contour.value.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
  })
})

// Keep the plate recipe import used by the other suites' fixtures out of this file's scope.
void buildRecipe
