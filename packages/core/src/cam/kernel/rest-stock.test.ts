import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
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
