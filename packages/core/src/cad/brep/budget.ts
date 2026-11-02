/**
 * A budget for exact modelling. The kernel is synchronous and runs on the caller's thread (the sidecar's, for the
 * assistant's reports): an exact rebuild of a heavy history, or one pathological Boolean, must not hold that thread for
 * minutes. `withBudget` sets a deadline for everything it runs; the kernel's long loops (face pairs of a Boolean, face
 * splitting, surface intersection, tessellation) call `checkBudget`, which throws `BudgetExceeded` once it has passed.
 * Nested budgets keep the earlier deadline. Without a budget the checks cost one comparison.
 *
 * The deadline is wall-clock, so on a loaded machine the same part may or may not finish inside it. A caller that needs the
 * same answer every time (the assistant's validation report: a verdict that flips with the load of the machine misleads it) also
 * gives `withBudget` an amount of `work`: every `checkBudget` is one step, and the same history takes the same number of steps
 * on any machine at any load. The budget then stops on whichever runs out first: the work (the deterministic limit, the one that
 * decides in practice) or the deadline (a generous safety net for a loop that is not counted).
 */
export class BudgetExceeded extends Error {
  override readonly name = "BudgetExceeded"
  /** What ran out: the deadline or the amount of work. */
  readonly reason: "time" | "work"
  constructor(readonly budgetMs: number, reason: "time" | "work" = "time", readonly work?: number) {
    super(reason === "work"
      ? `the exact model exceeded its work budget of ${work} steps`
      : `the exact model exceeded its time budget of ${Math.round(budgetMs)} ms`)
    this.reason = reason
  }
}

let deadline = Infinity
let budget = Infinity
/** Steps taken so far (every `checkBudget`), and the step at which the innermost work budget ends. */
let steps = 0
let stepLimit = Infinity
let workBudget = Infinity

/**
 * Runs `f` with at most `ms` milliseconds for the kernel's work (less when an enclosing budget ends sooner). With `work`, it also
 * stops after that many steps of the kernel's counted loops (see `checkBudget`), whatever the clock says.
 */
export const withBudget = <T>(ms: number, f: () => T, work?: number): T => {
  const previous = deadline, previousBudget = budget, previousLimit = stepLimit, previousWork = workBudget
  const end = performance.now() + ms
  if (end < deadline) { deadline = end; budget = ms }
  if (work !== undefined && steps + work < stepLimit) { stepLimit = steps + work; workBudget = work }
  try {
    return f()
  } finally {
    deadline = previous
    budget = previousBudget
    stepLimit = previousLimit
    workBudget = previousWork
  }
}

/** Counts one step of work and throws `BudgetExceeded` when the current budget (the steps or the deadline) has run out. */
export const checkBudget = (): void => {
  steps++
  if (steps > stepLimit) throw new BudgetExceeded(budget, "work", workBudget)
  if (deadline !== Infinity && performance.now() > deadline) throw new BudgetExceeded(budget)
}

/** Steps of work counted so far by every `checkBudget` (a monotone counter: a difference measures what a call cost). */
export const workSteps = (): number => steps

/** Milliseconds left of the current budget; `Infinity` without one. A builder that knows its cost refuses early instead of spending the budget on a failure. */
export const remainingBudgetMs = (): number => (deadline === Infinity ? Infinity : Math.max(0, deadline - performance.now()))

/** The budget of a caller that can wait (a STEP export, the CAM kernel preparing a part): long exact builds, such as a thread of dozens of turns, are allowed under it. */
export const LONG_BUDGET_MS = 600_000
