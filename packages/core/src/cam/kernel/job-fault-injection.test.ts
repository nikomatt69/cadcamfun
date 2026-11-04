/**
 * Spec 69 B3 / spec 72 0.4 at the level of whole kernel jobs: overcuts are seeded into `runJob` itself (the contour of an outside profile is
 * moved into the wall of a block by 0.15 to 1.0 mm), and the job's own `no-gouge` claim must fail and block the release; 15 clean jobs
 * (the contour on the part) must keep `no-gouge` passed. Sensitivity and false-positive rate are measured and printed; the gate asserts them.
 * A fault under 0.15 mm is below the declared replay resolution (0.1 mm cell) and is not claimed.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(240_000)

const mulberry32 = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const blockJob = (w: number, h: number, d: number, inset: number, tool: string): ManufacturingJob => {
  const loop = [{ x: inset, y: inset }, { x: w - inset, y: inset }, { x: w - inset, y: h - inset }, { x: inset, y: h - inset }]
  return {
    schemaVersion: 1, id: "f", name: "Block", material: "6061",
    part: { kind: "elements", elements: [{ id: "block", type: "cube", x: w / 2, y: h / 2, z: d / 2, width: w, height: h, depth: d }] },
    stock: { min: { x: -4, y: -4, z: 0 }, max: { x: w + 4, y: h + 4, z: d + 1 } },
    operations: [
      { id: "face", strategy: "face", tool: "flat-16-n", bottom: d },
      { id: "contour", strategy: "profile", tool, loop, side: "outside", top: d, bottom: 0 }
    ],
    machine: findMachine("vmc-standard")!, quality: { resolution: 0.1 }
  }
}

const gouge = (a: CamArtifact): string => a.claims.find((c) => c.id === "no-gouge")!.status

describe("B3 at job level: seeded overcuts in runJob", () => {
  test("30 seeded overcuts are all failed and blocked, 15 clean jobs all pass no-gouge", () => {
    const rand = mulberry32(69)
    let found = 0, blocked = 0, falsePositive = 0
    for (let i = 0; i < 30; i++) {
      const w = 24 + Math.floor(rand() * 20), h = 24 + Math.floor(rand() * 20), d = 6 + Math.floor(rand() * 6)
      const fault = 0.15 + rand() * 0.85
      const tool = rand() < 0.5 ? "flat-6-n" : "flat-10-n"
      const r = runJob(blockJob(w, h, d, fault, tool))
      if (r.status !== "ok") throw new Error(r.issues.map((x) => x.message).join("; "))
      if (gouge(r.value) === "failed") found++
      if (r.value.release === "blocked") blocked++
    }
    for (let i = 0; i < 15; i++) {
      const w = 24 + Math.floor(rand() * 20), h = 24 + Math.floor(rand() * 20), d = 6 + Math.floor(rand() * 6)
      const r = runJob(blockJob(w, h, d, 0, rand() < 0.5 ? "flat-6-n" : "flat-10-n"))
      if (r.status !== "ok") throw new Error(r.issues.map((x) => x.message).join("; "))
      if (gouge(r.value) !== "passed") falsePositive++
    }
    console.log(`B3 job level: sensitivity ${found}/30 (blocked ${blocked}/30), false positives ${falsePositive}/15`)
    expect(found).toBe(30)
    expect(blocked).toBe(30)
    expect(falsePositive).toBe(0)
  })

  test("30 seeded undercuts (contour left outside the wall by 0.4 to 1.0 mm) fail material-removed", () => {
    const rand = mulberry32(72)
    let found = 0
    for (let i = 0; i < 30; i++) {
      const w = 24 + Math.floor(rand() * 20), h = 24 + Math.floor(rand() * 20), d = 6 + Math.floor(rand() * 6)
      const r = runJob(blockJob(w, h, d, -(0.4 + rand() * 0.6), rand() < 0.5 ? "flat-6-n" : "flat-10-n"))
      if (r.status !== "ok") throw new Error(r.issues.map((x) => x.message).join("; "))
      if (r.value.claims.find((c) => c.id === "material-removed")!.status === "failed") found++
    }
    console.log(`B3 job level: undercut sensitivity ${found}/30`)
    expect(found).toBe(30)
  })
})
