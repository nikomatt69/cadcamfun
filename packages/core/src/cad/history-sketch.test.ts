/** The constraint report of a sketch feature (states, degrees of freedom, conflicts) and the edits that keep it solvable. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { History } from "./history.ts"
import { plateTemplate } from "./history-edit.ts"
import { addSketchConstraint, constraintNames, removeSketchConstraint, setConstraintDriven, sketchReport } from "./history-sketch.ts"

setDefaultTimeout(60_000)

describe("sketch report", () => {
  test("the plate sketch is fully constrained, every constraint named and ok", () => {
    const report = sketchReport(plateTemplate(), "sketch1")!
    expect(report.status).toBe("fully-constrained")
    expect(report.dof).toBe(0)
    expect(report.rows).toHaveLength(7)
    expect(report.rows.map((r) => r.state)).toEqual(Array(7).fill("ok"))
    expect(report.rows[5]).toMatchObject({ type: "length", value: "width", refs: ["l1"] })
    expect(sketchReport(plateTemplate(), "plate")).toBeUndefined()
    expect(sketchReport(plateTemplate(), "nope")).toBeUndefined()
  })

  test("the solver's names map back to the stored constraints, counting only the unnamed ones", () => {
    const h = plateTemplate()
    const sk = h.features[0]!
    if (sk.type !== "sketch") throw new Error("sketch expected")
    const named = [{ ...sk.sketch.constraints[0]!, id: "anchor" }, ...sk.sketch.constraints.slice(1)]
    expect(constraintNames(named).slice(0, 3)).toEqual(["anchor", "horizontal#0", "vertical#1"])
  })

  test("removing a dimension frees exactly one degree and the free points are listed", () => {
    const h = plateTemplate()
    const out = removeSketchConstraint(h, "sketch1", 6)
    expect(out.report?.status).toBe("under-constrained")
    expect(out.report?.dof).toBe(1)
    expect(Object.keys(out.report?.freedom ?? {}).length).toBeGreaterThan(0)
    expect(removeSketchConstraint(h, "sketch1", 99).refusal).toContain("no constraint 99")
  })

  test("a contradicting dimension is refused with the constraints that clash; the history is unchanged", () => {
    const h = plateTemplate()
    const out = addSketchConstraint(h, "sketch1", { type: "length", line: "l1", value: 99 })
    expect(out.refusal).toContain("cannot all hold")
    expect(out.refusal).toMatch(/length#\d/)
    expect(out.history).toBe(h)
  })

  test("a constraint that only repeats the others is kept and reported as redundant", () => {
    const out = addSketchConstraint(plateTemplate(), "sketch1", { type: "length", line: "l1", value: "width" })
    expect(out.refusal).toBeUndefined()
    expect(out.report?.status).toBe("over-constrained")
    expect(out.report?.rows.some((r) => r.state === "redundant")).toBe(true)
  })

  test("references that do not exist, repeated ids and non-dimensions as references are refused", () => {
    const h = plateTemplate()
    expect(addSketchConstraint(h, "sketch1", { type: "horizontal", line: "ghost" }).refusal).toContain("'ghost' is not an entity")
    expect(addSketchConstraint(h, "plate", { type: "horizontal", line: "l1" }).refusal).toContain("no sketch")
    expect(addSketchConstraint(h, "sketch1", { type: "parallel", a: "l1", b: "l3", driven: true }).refusal).toContain("not a dimension")
    const named = addSketchConstraint(h, "sketch1", { type: "parallel", a: "l1", b: "l3", id: "par" }).history
    expect(addSketchConstraint(named, "sketch1", { type: "parallel", a: "l2", b: "l4", id: "par" }).refusal).toContain("already used")
  })

  test("a reference dimension measures and constrains nothing; making it driving again is checked", () => {
    const h = plateTemplate()
    const ref = setConstraintDriven(h, "sketch1", 6, true)
    expect(ref.refusal).toBeUndefined()
    expect(ref.report?.rows[6]?.state).toBe("driven")
    expect(ref.report?.rows[6]?.measured).toBeCloseTo(40, 6)
    expect(ref.report?.dof).toBe(1)
    expect(setConstraintDriven(h, "sketch1", 1, true).refusal).toContain("not a dimension")
    const back = setConstraintDriven(ref.history, "sketch1", 6, false)
    expect(back.refusal).toBeUndefined()
    expect(back.report?.dof).toBe(0)
  })

  test("a sketch whose parameters do not evaluate is reported unsolved with the reason, not as a conflict", () => {
    const h: History = { ...plateTemplate(), parameters: { width: "depth + 1", depth: "width - 1", thick: 8, hole: 10 } }
    const report = sketchReport(h, "sketch1")!
    expect(report.status).toBe("unsolved")
    expect(report.message).toContain("failed")
    expect(report.dof).toBe(-1)
  })

  test("a rollback marker before the sketch does not hide it", () => {
    const h: History = { ...plateTemplate(), rollback: "sketch1" }
    expect(sketchReport(h, "sketch1")?.status).toBe("fully-constrained")
  })
})
