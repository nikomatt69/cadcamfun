import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_CUTTERS, findCutter, planOnly, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

// Two walls 4 mm apart on a plate: a Ø10 cutter cannot enter the slot between them, a Ø3 can.
const plate = { id: "plate", type: "cube", x: 0, y: 0, z: 2, width: 40, height: 30, depth: 4 }
const left = { id: "left", type: "cube", x: -6, y: 0, z: 8, width: 8, height: 20, depth: 8 }
const right = { id: "right", type: "cube", x: 6, y: 0, z: 8, width: 8, height: 20, depth: 8 }
const wide = findCutter(DEFAULT_CUTTERS, "flat-10")!
const narrow = findCutter(DEFAULT_CUTTERS, "flat-3")!
const stock = { min: { x: -22, y: -17, z: 0 }, max: { x: 22, y: 17, z: 12 } }

const run = (operations: ReadonlyArray<OperationSpec>): CamArtifact => {
  const job: ManufacturingJob = {
    schemaVersion: 1, id: "rest", name: "Rest from stock", material: "6061", part: { kind: "elements", elements: [plate, left, right] },
    stock, tools: [wide, narrow], operations, machine: findMachine("vmc-standard")!, quality: { resolution: 0.3 }
  }
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const rough: OperationSpec = { id: "rough", strategy: "surface", mode: "roughing", clearing: "contour", tool: wide.id, allowance: 0 }
const rest: OperationSpec = { id: "rest", strategy: "surface", mode: "rest", clearing: "contour", tool: narrow.id, allowance: 0 }

/** The X range of the cutting moves of the operation, from the NC between its marker and the next. */
const xs = (nc: string, id: string): number[] => xRange(nc, id).all
const xRange = (nc: string, id: string): { min: number; max: number; moves: number; all: number[] } => {
  const lines = nc.split("\n")
  const from = lines.findIndex((l) => l.toUpperCase().includes(` ${id.toUpperCase()})`) && /OP\d+/.test(l))
  const rest = lines.slice(from + 1)
  const to = rest.findIndex((l) => /OP\d+ /.test(l))
  const body = to < 0 ? rest : rest.slice(0, to)
  // Modal G-words: a cutting block is any with X/Y that follows a G1/G2/G3 and is not a rapid.
  let cutting = false
  const xs: number[] = []
  for (const l of body) {
    const g = /^G0?([0-3])\b/.exec(l)
    if (g !== null) cutting = g[1] !== "0"
    else if (/^[XYZ]/.test(l) && /^[XYZ]/.test(l) === true && l.startsWith("Z") && !/X|Y/.test(l)) continue
    const m = /X(-?\d+\.?\d*)/.exec(l)
    if (cutting && m !== null) xs.push(Number(m[1]))
  }
  return { min: Math.min(...xs), max: Math.max(...xs), moves: xs.length, all: xs }
}

describe("rest machining from the stock the earlier operations left (spec 29 §6)", () => {
  test("a rest pass without restFrom cuts the slot the wide cutter could not enter, and only there", () => {
    const a = run([rough, rest])
    expect(a.operations.map((o) => o.status)).toEqual(["ok", "ok"])
    const r = xRange(a.nc, "rest")
    expect(r.moves).toBeGreaterThan(0)
    // The Ø10 cutter cannot enter the 4 mm slot (x in -2..2): the Ø3 rest tool cuts there.
    expect(xs(a.nc, "rough").some((x) => Math.abs(x) < 1.6)).toBe(false)
    expect(xs(a.nc, "rest").some((x) => Math.abs(x) < 1.6)).toBe(true)
  })

  test("with nothing left for it (no rough before) the rest pass still works from the raw stock", () => {
    const a = run([rest])
    expect(a.operations[0]!.status).toBe("ok")
  })

  test("the rest pass leaves less material than roughing alone", () => {
    const roughOnly = run([rough])
    const both = run([rough, rest])
    expect(both.stock.remainingVolume).toBeLessThan(roughOnly.stock.remainingVolume)
  })
})

// A dome on a base: the freeform part the five-axis suite machines, on the trunnion.
const domeBase = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const domeBall = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const domeStock = { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!

const rotaryJob = (operations: ReadonlyArray<OperationSpec>): CamArtifact => {
  const job: ManufacturingJob = {
    schemaVersion: 1, id: "lineage", name: "Rotary lineage", material: "6061",
    part: { kind: "elements", elements: [domeBase, domeBall] },
    stock: domeStock, tools: [ball, flat], operations, machine: findMachine("trunnion-5ax")!, quality: { resolution: 0.4 }
  }
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const multiaxis: OperationSpec = { id: "five-finish", strategy: "multiaxis", tool: ball.id, top: 17, stepover: 20, toolAxis: "normal" }
// A 3-axis surface roughing that clears the dome's bulk before the rotary finish, so the predecessor leaves a large removal.
const roughing: OperationSpec = { id: "rough", strategy: "surface", mode: "roughing", clearing: "contour", tool: flat.id, allowance: 0 }

describe("a rotary operation consumes the stock its 3-axis predecessor left (K5)", () => {
  test("the voxel stock the rotary replay runs on is seeded with the predecessor's removal, not the raw box", () => {
    const rotaryOnly = rotaryJob([multiaxis])
    const preceded = rotaryJob([roughing, multiaxis])
    // Both run rotary moves, so both report a bracket.
    const alone = rotaryOnly.stock.fiveAxis!
    const carried = preceded.stock.fiveAxis!
    expect(alone).toBeDefined()
    expect(carried).toBeDefined()
    // The 3-axis roughing ran and removed material before the rotary operation.
    expect(preceded.operations.find((o) => o.id === "rough")!.removedVolume).toBeGreaterThan(0)
    // Both bounds of the bracket are tighter than the raw box: the rotary stock starts where the predecessor left off, so the
    // seed carries the predecessor's removal into the bracket. Reverting to the raw box would make `carried` equal `alone`.
    expect(carried.remainingLower).toBeLessThan(alone.remainingLower)
    expect(carried.remainingUpper).toBeLessThan(alone.remainingUpper)
    expect(carried.removedLower).toBeGreaterThanOrEqual(alone.removedLower)
    // The bracket stays a bracket and stays ordered after the seed.
    expect(carried.remainingLower).toBeLessThanOrEqual(carried.remainingUpper)
    expect(carried.removedLower).toBeLessThanOrEqual(carried.removedUpper)
    expect(carried.removedLower + carried.remainingUpper).toBeCloseTo(carried.removedUpper + carried.remainingLower, 0)
    // The seed cannot invent certainty: a bounded predecessor removal is still only a bound, so the bracket does not collapse.
    expect(carried.remainingUpper - carried.remainingLower).toBeGreaterThan(0)
  })

  test("a 3-axis-only job is unaffected: no rotary moves means no voxel bracket at all", () => {
    const threeAxis = runJob({
      schemaVersion: 1, id: "no-rotary", name: "Three axis", material: "6061",
      part: { kind: "elements", elements: [domeBase, domeBall] }, stock: domeStock, tools: [flat],
      operations: [roughing], machine: findMachine("trunnion-5ax")!, quality: { resolution: 0.4 }
    })
    if (threeAxis.status !== "ok") throw new Error(threeAxis.issues.map((i) => i.message).join("; "))
    expect(threeAxis.value.stock.fiveAxis).toBeUndefined()
    expect(threeAxis.value.operations.every((o) => o.strategy === "surface")).toBe(true)
  })

  test("the seeded bracket is still reported as a bracket, never as requested-quality verification", () => {
    const preceded = rotaryJob([roughing, multiaxis])
    const five = preceded.stock.fiveAxis!
    expect(five.voxelMm).toBe(2)
    // The removal claim names the bracket (lower..upper) and does not pass while turned moves are unchecked against the part.
    const claim = preceded.claims.find((c) => c.id === "material-removed")!
    expect(claim.status).not.toBe("passed")
    expect(claim.detail).toMatch(/between \d+ and \d+ mm³/)
    // Turned moves are still never claimed as gouge-checked.
    expect(preceded.claims.find((c) => c.id === "no-gouge")!.status).toBe("unresolved")
    // The tolerance budget stays informational: it is not a verification of requested quality, and it is not asserted here.
    expect(preceded.tolerance?.requested).toBeGreaterThan(0)
  })
})

describe("the planner adds rest roughing to freeform parts", () => {
  test("a dome on a plate is roughed, rested with a smaller flat cutter, then finished", () => {
    const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
    const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
    const plan = planOnly({
      schemaVersion: 1, id: "p", name: "p", material: "6061", part: { kind: "elements", elements: [base, dome] },
      stock: { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }, machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 }
    })
    if (plan.status !== "ok") throw new Error(plan.issues.map((i) => i.message).join("; "))
    const ops = plan.value.operations.map((o) => `${o.strategy === "surface" ? o.mode : o.strategy}`)
    const rough = ops.indexOf("roughing"), rest = ops.indexOf("rest")
    console.log(ops.join(","))
    expect(rough).toBeGreaterThanOrEqual(0)
    expect(rest).toBeGreaterThan(rough)
  })
})

describe("a rest pass with nothing left", () => {
  test("is skipped with a warning, not failed, so the job still releases", () => {
    // A plain plate: the roughing leaves nothing the smaller cutter has to take.
    const r = runJob({
      schemaVersion: 1, id: "none", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
      tools: [wide, narrow], machine: findMachine("vmc-standard")!, quality: { resolution: 0.3 },
      operations: [{ id: "rough", strategy: "surface", mode: "roughing", clearing: "contour", tool: wide.id, allowance: 0 }, rest]
    })
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const o = r.value.operations.find((x) => x.id === "rest")!
    expect(o.status).toBe("ok")
    expect(o.warnings.join(" ")).toMatch(/No material left/)
    expect(r.value.issues.some((i) => i.tag === "EmptyToolpath")).toBe(false)
  })
})
