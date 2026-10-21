import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"

setDefaultTimeout(100_000)

const plate = buildRecipe("mounting_plate", { width: 80, depth: 50, thickness: 10, fastener: "M5", counterbore: true })
const job = (machine: string): ManufacturingJob => ({
  schemaVersion: 1, id: "siemens plate", name: "Plate / M5 holes", material: "6061", machine: findMachine(machine)!, quality: { resolution: 0.4 },
  part: { kind: "elements", elements: [{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: plate.history } as never] }
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("the Siemens 840D post in the kernel", () => {
  const a = ok(runJob(job("siemens-840d-vmc")))

  test("the NC is native Sinumerik text: MPF header, ; comments, G71, T then D1, no ISO-only words", () => {
    const lines = a.nc.split("\n")
    expect(lines[0]).toBe("%_N_PLATE_M5_HOLES_MPF")
    expect(lines[1]).toBe(";$PATH=/_N_MPF_DIR")
    expect(a.nc).toMatch(/^G71 G90 G17 G94 G40 G64$/m)
    expect(a.nc).not.toMatch(/\bG21\b|\bG43\b|\bG49\b|\bG80\b|\bG81\b|\bG83\b|\bG84\b|\bM98\b/)
    expect(a.nc).not.toMatch(/^\(/m)
    expect(a.nc).toMatch(/^T\d+ M6$\n^D1$/m)
    expect(a.nc.trimEnd().endsWith("M30")).toBe(true)
  })

  test("drilling is written as moves and the threads are milled, because the post has neither canned cycles nor rigid tapping", () => {
    expect(a.operations.some((o) => o.cut === "tap")).toBe(false)
    expect(a.operations.some((o) => o.cut === "thread-mill" || o.cut === "drill" || o.strategy === "bore")).toBe(true)
  })

  test("the independent replay reads the program and the claims about it hold", () => {
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    expect(a.claims.find((c) => c.id === "operations-complete")!.status).toBe("passed")
    expect(a.operations.every((o) => o.status === "ok")).toBe(true)
    const replay = interpretGcode(a.nc, { start: { x: 0, y: 0, z: 40 } })
    expect(replay.errors).toEqual([])
    expect(replay.segments.length).toBeGreaterThan(50)
  })

  test("the same part on the Fanuc preset plans the same operations, apart from the tapping the Siemens post cannot write", () => {
    const fanuc = ok(runJob(job("vmc-standard")))
    expect(a.operations.map((o) => o.id)).toEqual(fanuc.operations.filter((o) => o.cut !== "tap").map((o) => o.id).filter((id) => a.operations.some((x) => x.id === id)))
    expect(a.nc).not.toBe(fanuc.nc)
  })

  test("deterministic, and an explicit tapping request is refused with a typed issue instead of writing a wrong cycle", () => {
    const again = ok(runJob(job("siemens-840d-vmc")))
    expect(again.nc).toBe(a.nc)
    const tap = runJob({ ...job("siemens-840d-vmc"), operations: [{ id: "tap", strategy: "drill", points: [{ x: 0, y: 0 }], top: 10, bottom: 0, cut: "tap", tool: "tap-m5" }] as never })
    const refused = ok(tap)
    expect(refused.issues.some((i) => i.tag === "GenerationFailed" && /rigid tapping .* mill the thread instead/.test(i.message))).toBe(true)
    expect(refused.release).toBe("blocked")
    expect(refused.nc).toBe("")
  })
})
