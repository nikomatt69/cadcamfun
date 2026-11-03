import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob } from "./execute.ts"
import { programDiff } from "./program-diff.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import type { CamArtifact } from "./contracts.ts"
import { buildRecipe } from "../../cad/index.ts"
import { matchOperations } from "./operation-match.ts"

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

describe("matchOperations: which operation is which after an edit (spec 59 A5)", () => {
  const mount = (fastener: string): CamArtifact => {
    const history = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener, counterbore: true } as never).history
    return make([{ id: "p", type: "parametric", history }])
  }
  const m5 = mount("M5"), m6 = mount("M6")

  test("operations with the same id pair by id; the same program pairs with itself and nothing is added or removed", () => {
    const m = matchOperations(m5, m5)
    expect(m.pairs.every((p) => p.by === "id" && p.confidence === 1)).toBe(true)
    expect(m.pairs).toHaveLength(m5.operations.length)
    expect([m.added, m.removed, m.carried, m.droppedOverrides]).toEqual([[], [], [], []])
  })

  test("a hole resized by its fastener changes the drill's id and is paired by geometry with a confidence, not shown as removed + added", () => {
    const m = matchOperations(m5, m6)
    const pair = m.pairs.find((p) => p.by === "signature")!
    expect(pair).toBeDefined()
    expect(pair.before).toMatch(/^drill-/)
    expect(pair.after).toMatch(/^drill-/)
    expect(pair.before).not.toBe(pair.after)
    expect(pair.confidence).toBeGreaterThanOrEqual(0.5)
    expect(m.added).toEqual([])
    expect(m.removed).toEqual([])
    const d = programDiff(m5, m6)
    expect(d.operations.added).toEqual([])
    expect(d.operations.removed).toEqual([])
    expect(d.operations.matched).toContainEqual(pair)
    expect(d.operations.changed.find((c) => c.from === pair.before)).toMatchObject({ id: pair.after, confidence: pair.confidence })
  })

  test("the overrides of a person on the paired operation are carried to the new one with their values", () => {
    const before: CamArtifact = { ...m5, operations: m5.operations.map((o) => (o.id.startsWith("drill-") ? { ...o, overridden: ["feed"], parameters: { ...o.parameters, feed: 777 } } : o)) }
    const m = matchOperations(before, m6)
    expect(m.carried).toEqual([{ before: expect.stringMatching(/^drill-/), after: expect.stringMatching(/^drill-/), parameters: { feed: 777 } }])
    expect(m.droppedOverrides).toEqual([])
  })

  test("an operation that moved too far is not paired, and its overrides are reported as dropped, never carried", () => {
    const far: CamArtifact = {
      ...m6,
      program: { ...m6.program, toolpaths: m6.program.toolpaths.map((t) => (t.id.startsWith("drill-") ? { ...t, moves: t.moves.map((mv) => ("to" in mv ? { ...mv, to: { ...mv.to, x: mv.to.x + 500 } } : mv)) } : t)) }
    }
    const before: CamArtifact = { ...m5, operations: m5.operations.map((o) => (o.id.startsWith("drill-") ? { ...o, overridden: ["feed"], parameters: { ...o.parameters, feed: 777 } } : o)) }
    const m = matchOperations(before, far)
    expect(m.pairs.some((p) => p.by === "signature")).toBe(false)
    expect(m.removed.some((id) => id.startsWith("drill-"))).toBe(true)
    expect(m.added.some((id) => id.startsWith("drill-"))).toBe(true)
    expect(m.carried).toEqual([])
    expect(m.droppedOverrides).toEqual([{ id: expect.stringMatching(/^drill-/), parameters: ["feed"], reason: expect.stringContaining("not carried over") }])
  })

  test("a higher minimum confidence refuses a pair the default accepts", () => {
    expect(matchOperations(m5, m6, { minConfidence: 0.99 }).pairs.some((p) => p.by === "signature")).toBe(false)
  })
})
