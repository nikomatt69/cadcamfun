/**
 * The exact view of a validation report must not depend on how busy the machine is. It used to be a wall-clock budget of 1.5 s, so
 * a normal part came back `exactPending` whenever the machine was loaded. It is now a budget of work (the kernel's counted steps,
 * the same on any machine) under a generous clock cap: the same part gives the same verdict at any speed, and `exactPending`
 * is kept for models that are big.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { brep, rebuild, type History } from "@cadcamfun/core"
import { REPORT_EXACT_BUDGET_MS, REPORT_EXACT_WORK_STEPS, exactReport, parametricReport } from "../src/parametric.ts"
import { verificationOf } from "../src/parametric-verification.ts"

/** A 60 x 40 x 8 plate with two holes and its vertical edges rounded: a normal part, about a second of exact work on an idle machine. */
const part = (): History => ({
  parameters: { w: 60, h: 40, t: 8 },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: 8, at: [15, 20], diameter: 6, depth: 8 },
    { id: "h2", type: "hole", plane: "XY", offset: 8, at: [45, 20], diameter: 6, depth: 8 },
    { id: "round", type: "fillet", radius: 3, edges: { parallel: "z" } }
  ]
} as unknown as History)

const clocks: Array<{ mockRestore: () => void }> = []
afterEach(() => { while (clocks.length > 0) clocks.pop()!.mockRestore() })
/** The kernel's clock running `factor` times faster than real time: a machine `factor` times slower than the one the budget was set on. */
const slowMachine = (factor: number) => {
  const real = performance.now.bind(performance)
  const spy = spyOn(performance, "now").mockImplementation(() => real() * factor)
  clocks.push(spy)
}

/** A clock that moves `ms` at every read, whatever the real speed: the kernel's work takes the same reads on any machine, so a clock budget runs out at the same point. */
const steppingClock = (ms: number) => {
  let now = 0
  const spy = spyOn(performance, "now").mockImplementation(() => (now += ms))
  clocks.push(spy)
}

const verdict = (history: History, budget?: Parameters<typeof exactReport>[2]) => {
  const result = rebuild(history)
  return JSON.stringify(exactReport(history, result, budget).bodies)
}

describe("the exact view of a report is a budget of work, not of time", () => {
  test("the default is a work budget under a generous clock cap", () => {
    expect(REPORT_EXACT_WORK_STEPS).toBeGreaterThanOrEqual(3_000)
    // Far above the 1.5 s the wall-clock budget used to be, so a loaded machine does not reach it with a normal part.
    expect(REPORT_EXACT_BUDGET_MS).toBeGreaterThanOrEqual(20_000)
  })

  test("a normal part is exact, and says exactly the same on a machine 20 times slower", () => {
    const history = part()
    const normal = verdict(history)
    expect(JSON.parse(normal)[0]).toMatchObject({ exact: true, valid: true })
    slowMachine(20)
    expect(verdict(history)).toBe(normal)
  })

  test("the old clock budget is what made it flip: 1.5 s on that slow machine, the same part comes back pending", () => {
    const history = part()
    steppingClock(50)
    const [body] = JSON.parse(verdict(history, 1_500))
    expect(body.exact).toBe(false)
    expect(body.reason).toContain("time budget")
  })

  test("the same history costs the same number of steps every time, whatever the clock", () => {
    const history = part()
    const result = rebuild(history)
    const cost = () => { const before = brep.workSteps(); exactReport(history, result); return brep.workSteps() - before }
    const first = cost()
    expect(first).toBeGreaterThan(50)
    expect(first).toBeLessThan(REPORT_EXACT_WORK_STEPS)
    expect(cost()).toBe(first)
    slowMachine(7)
    expect(cost()).toBe(first)
  })

  test("a model that needs more work than the budget is pending, with the same reason every time and any clock", () => {
    const history = part()
    const result = rebuild(history)
    const [body] = exactReport(history, result, { ms: 600_000, work: 100 }).bodies
    expect(body).toMatchObject({ exact: false })
    expect((body as { reason: string }).reason).toContain("work budget of 100 steps")
    slowMachine(50)
    expect(JSON.stringify(exactReport(history, result, { ms: 600_000, work: 100 }).bodies)).toBe(JSON.stringify([body]))
  })

  test("the assistant is told a pending model is big, not that the machine was busy, and where to get the exact volume", () => {
    const history = part()
    const report = parametricReport(history)
    const pending = exactReport(history, rebuild(history), { ms: 600_000, work: 100 }).bodies
    const verification = verificationOf(history, { ...report, exact: pending })
    expect(verification.exactPending).toContain("too much work for the interactive budget")
    expect(verification.exactPending).toContain("parametric_exact")
    // A pending body is not reported as a defect of the model.
    expect(verification.attention.some((a) => a.includes("has no exact model"))).toBe(false)
    // And with the real report the verdict carries the exact volume.
    expect(verificationOf(history, report).exactPending).toBeUndefined()
    expect(verificationOf(history, report).volumeSource).toBe("exact")
  })

  test("a budget given as a number is a clock cap alone (parametric_exact, asked for on purpose)", () => {
    const history = part()
    const result = rebuild(history)
    const before = brep.workSteps()
    const [body] = exactReport(history, result, 60_000).bodies
    expect(body).toMatchObject({ exact: true })
    // More steps than the report's work budget would allow are fine here: no work cap.
    expect(brep.workSteps() - before).toBeGreaterThan(0)
  })
})
