/**
 * Honesty slices of spec 69 phase A: what the executor decides from the real tool assembly, the real machine and the real replay.
 */
import { describe, expect, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import type { Cutter } from "./cutters.ts"
import { findMachine } from "./machines.ts"
import { checkNcClearance, type TableGeometry } from "./machine-clearance.ts"
import type { GSegment } from "../testing/gcode-interpreter.ts"

const run = (job: ManufacturingJob): CamArtifact => {
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!

// A narrow deep pocket cut with a slim extension holder: the wide chuck above the extension reaches the stock top.
const slim: Cutter = {
  id: "ext-6", name: "Ø6 on a slim extension", kind: "flat", diameter: 6, flutes: 3, material: "carbide", coating: "none",
  fluteLength: 10, shankDiameter: 6, stickout: 12, holder: { diameter: 6, length: 30 }
}
const stepped: Cutter = { ...slim, id: "ext-6-chuck", holder: { diameter: 6, length: 30, steps: [{ diameter: 50, length: 20 }] } }

const pocketJob = (tool: Cutter): ManufacturingJob => ({
  schemaVersion: 1, id: "deep", name: "Deep slot", material: "6061",
  part: { kind: "elements", elements: [{ id: "block", type: "cube", x: 0, y: 0, z: 25, width: 100, height: 40, depth: 50 }] },
  machine: findMachine("vmc-standard")!, tools: [tool], quality: { resolution: 0.5 },
  operations: [{ id: "slot", strategy: "pocket", tool: tool.id, region: { boundary: [{ x: -6, y: -15 }, { x: 6, y: -15 }, { x: 6, y: 15 }, { x: -6, y: 15 }] }, top: 50, bottom: 5 }]
})

describe("A3: the stepped tool assembly decides holder-clearance", () => {
  test("a single-cylinder holder clears the slot; the same tool with its wide chuck step collides with the stock top", () => {
    const single = run(pocketJob(slim))
    const withStep = run(pocketJob(stepped))
    expect(claim(single, "holder-clearance").status).toBe("passed")
    expect(claim(withStep, "holder-clearance").status).toBe("failed")
    expect(withStep.issues.some((i) => i.tag === "HolderCollision" && /Holder of/.test(i.message))).toBe(true)
    // Same program: only the evidence about the assembly differs.
    expect(withStep.nc.replace("EXT-6-CHUCK", "EXT-6")).toBe(single.nc)
  })
})

describe("A4: moves with the table turned get a machine-clearance verdict", () => {
  const tool: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }
  const table: TableGeometry = { cx: 0, cy: 0, top: -30, length: 200, width: 200 }
  const rotary = { layout: "table-AC" as const, pivot: { x: 0, y: 0, z: -100 } }
  const seg = (line: number, z: number, a: number): GSegment => ({ kind: "linear", from: { x: 0, y: 0, z }, to: { x: 0, y: 0, z }, feed: 100, line, rotary: { a, c: 0 } })

  test("swinging the table up into the tool is a collision at its NC line; a clear swing is certified", () => {
    const hit = checkNcClearance([seg(1, 0, 0), seg(2, 0, 60)], () => tool, table, { rotary })
    expect(hit.rotaryMoves).toBe(0)
    expect(hit.rotaryChecked).toBe(1)
    expect(hit.first?.line).toBe(2)
    expect(hit.first!.clearance).toBeLessThan(0)
    // High above the table the same swing is clear, with a positive certified margin.
    const clear = checkNcClearance([seg(1, 120, 0), seg(2, 120, 30)], () => tool, table, { rotary })
    expect(clear.first).toBeUndefined()
    expect(clear.unresolved).toBe(0)
    expect(clear.rotaryChecked).toBe(1)
    expect(clear.minClearance).toBeGreaterThan(0)
  })

  test("without a rotary scene the turned move is counted unchecked (the old behaviour), and an arc with the table turned is unresolved", () => {
    const blind = checkNcClearance([seg(1, 0, 0), seg(2, 0, 60)], () => tool, table)
    expect(blind.rotaryMoves).toBe(1)
    expect(blind.rotaryChecked).toBe(0)
    const arc: GSegment = { kind: "arc", from: { x: 5, y: 0, z: 120 }, to: { x: -5, y: 0, z: 120 }, center: { x: 0, y: 0 }, clockwise: true, radiusStart: 5, radiusEnd: 5, feed: 100, line: 3 }
    const turnedArc = checkNcClearance([seg(1, 120, 0), seg(2, 120, 30), arc], () => tool, table, { rotary })
    expect(turnedArc.unresolved).toBe(1)
  })
})
