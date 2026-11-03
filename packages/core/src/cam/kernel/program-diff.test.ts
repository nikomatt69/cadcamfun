import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob } from "./execute.ts"
import { programDiff } from "./program-diff.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import type { CamArtifact } from "./contracts.ts"

setDefaultTimeout(120_000)

const make = (elements: ReadonlyArray<Record<string, unknown>>): CamArtifact => {
  const job = jobOfSnapshot({ schemaVersion: 1, id: "diff", name: "Diff", material: "6061", machine: "vmc-standard", elements } as never)
  if (job.status !== "ok") throw new Error(job.issues.map((i) => i.message).join("; "))
  const result = runJob(job.value)
  if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
  return result.value
}

const plate = { id: "plate", type: "cube", width: 40, height: 30, depth: 6, x: 0, y: 0, z: 0 }
const hole = { id: "hole", type: "cylinder", radius: 3, height: 20, x: 0, y: 0, z: 0 }
const holed = [plate, hole, { id: "part", type: "boolean-subtract", operands: ["plate", "hole"] }]

describe("programDiff: what a regeneration changes", () => {
  const base = make([plate])

  test("the same artifact against itself is the same, safe and byte-identical", () => {
    const d = programDiff(base, base)
    expect(d.same).toBe(true)
    expect(d.safe).toBe(true)
    expect(d.nc.identical).toBe(true)
    expect(d.nc).toMatchObject({ linesAdded: 0, linesRemoved: 0 })
    expect(d.cycleTimeSeconds.delta).toBe(0)
  })

  test("an unchanged model regenerates to the same bytes", () => {
    const again = make([plate])
    expect(again.nc).toBe(base.nc)
    expect(programDiff(base, again).same).toBe(true)
  })

  test("a longer plate changes the same operations, and the time delta is the difference of the two artifacts", () => {
    const longer = make([{ ...plate, width: 55 }])
    const d = programDiff(base, longer)
    expect(d.same).toBe(false)
    expect(d.operations.added).toEqual([])
    expect(d.operations.removed).toEqual([])
    expect(d.operations.changed.length).toBeGreaterThan(0)
    expect(d.cycleTimeSeconds.delta).toBeCloseTo(longer.cycleTimeSeconds - base.cycleTimeSeconds, 9)
    expect(d.cycleTimeSeconds.delta).toBeGreaterThan(0)
    expect(d.nc.identical).toBe(false)
    expect(d.nc.linesAdded + d.nc.linesRemoved).toBeGreaterThan(0)
  })

  test("a feature added to the model adds its operations; removing it again lists exactly those as removed", () => {
    const withHole = make(holed)
    const gained = programDiff(base, withHole)
    expect(gained.operations.added.length).toBeGreaterThan(0)
    expect(gained.operations.added.map((o) => o.id)).toContain("surface-flats")
    const lost = programDiff(withHole, base)
    expect(lost.operations.removed.map((o) => o.id).sort()).toEqual(gained.operations.added.map((o) => o.id).sort())
    expect([...lost.tools.removed].sort()).toEqual([...gained.tools.added].sort())
  })

  test("a claim that got worse or a lower release makes the diff unsafe", () => {
    const worse: CamArtifact = { ...base, release: "blocked", claims: base.claims.map((c) => (c.id === "no-gouge" ? { ...c, status: "failed" as const } : c)) }
    const d = programDiff(base, worse)
    expect(d.release.direction).toBe(base.release === "blocked" ? "same" : "lower")
    expect(d.claims).toContainEqual({ id: "no-gouge", before: base.claims.find((c) => c.id === "no-gouge")!.status, after: "failed", direction: base.claims.find((c) => c.id === "no-gouge")!.status === "passed" ? "worse" : "changed" })
    if (base.claims.find((c) => c.id === "no-gouge")!.status === "passed") expect(d.safe).toBe(false)
    expect(programDiff(worse, base).claims.find((c) => c.id === "no-gouge")?.direction).toBe("better")
  })
})
