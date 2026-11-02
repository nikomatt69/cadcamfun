import { describe, expect, spyOn, test } from "bun:test"
import { BudgetExceeded, checkBudget, remainingBudgetMs, withBudget, workSteps } from "./budget.ts"

const steps = (n: number) => { for (let i = 0; i < n; i++) checkBudget() }

describe("the work budget counts the kernel's steps, not the clock", () => {
  test("every checkBudget is one step, and a budget without work only has a deadline", () => {
    const before = workSteps()
    withBudget(60_000, () => steps(25))
    expect(workSteps() - before).toBe(25)
    // No budget at all: the checks still count and never throw.
    steps(10)
    expect(workSteps() - before).toBe(35)
  })

  test("it stops at exactly the step it was given, with a reason that says work", () => {
    let done = 0
    let caught: unknown
    try { withBudget(60_000, () => { for (; ; ) { checkBudget(); done++ } }, 100) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(BudgetExceeded)
    expect((caught as BudgetExceeded).reason).toBe("work")
    expect((caught as BudgetExceeded).message).toBe("the exact model exceeded its work budget of 100 steps")
    expect(done).toBe(100)
  })

  test("a slow clock changes nothing: the same work finishes inside the work budget however long it seems to take", () => {
    const real = performance.now.bind(performance)
    // A machine 50 times slower than the clock budget expects: the deadline is 60 s away, the 20 steps take "10 s".
    const slow = spyOn(performance, "now").mockImplementation(() => real() * 50)
    try {
      expect(() => withBudget(60_000, () => steps(20), 1_000)).not.toThrow()
    } finally { slow.mockRestore() }
  })

  test("the deadline is still a safety net: a clock past it stops the work with a reason that says time", () => {
    const real = performance.now.bind(performance)
    let now = real()
    const clock = spyOn(performance, "now").mockImplementation(() => now)
    try {
      let caught: unknown
      try { withBudget(1_000, () => { for (let i = 0; i < 10; i++) { checkBudget(); now += 400 } }, 1_000_000) } catch (e) { caught = e }
      expect(caught).toBeInstanceOf(BudgetExceeded)
      expect((caught as BudgetExceeded).reason).toBe("time")
      expect((caught as BudgetExceeded).message).toContain("time budget")
    } finally { clock.mockRestore() }
  })

  test("nested budgets keep the tighter work limit, and the outer one goes on counting what the inner one spent", () => {
    let inner = 0
    expect(() => withBudget(60_000, () => {
      withBudget(60_000, () => { steps(30); inner = 30 }, 50)
      // 30 of the outer 100 are gone; 70 are left.
      steps(70)
      checkBudget()
    }, 100)).toThrow(/work budget of 100 steps/)
    expect(inner).toBe(30)
    // The inner budget cannot widen the outer one.
    expect(() => withBudget(60_000, () => withBudget(60_000, () => steps(60), 1_000), 40)).toThrow(/work budget of 40 steps/)
    // Afterwards nothing is left of either limit.
    expect(() => steps(10_000)).not.toThrow()
    expect(remainingBudgetMs()).toBe(Infinity)
  })
})
