/**
 * A time budget for exact modelling. The kernel is synchronous and runs on the caller's thread (the sidecar's, for the
 * assistant's reports): an exact rebuild of a heavy history, or one pathological Boolean, must not hold that thread for
 * minutes. `withBudget` sets a deadline for everything it runs; the kernel's long loops (face pairs of a Boolean, face
 * splitting, surface intersection, tessellation) call `checkBudget`, which throws `BudgetExceeded` once it has passed.
 * Nested budgets keep the earlier deadline. Without a budget the checks cost one comparison.
 */
export class BudgetExceeded extends Error {
  override readonly name = "BudgetExceeded"
  constructor(readonly budgetMs: number) {
    super(`the exact model exceeded its time budget of ${Math.round(budgetMs)} ms`)
  }
}

let deadline = Infinity
let budget = Infinity

/** Runs `f` with at most `ms` milliseconds for the kernel's work (less when an enclosing budget ends sooner). */
export const withBudget = <T>(ms: number, f: () => T): T => {
  const previous = deadline, previousBudget = budget
  const end = performance.now() + ms
  if (end < deadline) { deadline = end; budget = ms }
  try {
    return f()
  } finally {
    deadline = previous
    budget = previousBudget
  }
}

/** Throws `BudgetExceeded` when the current budget has run out. */
export const checkBudget = (): void => {
  if (deadline !== Infinity && performance.now() > deadline) throw new BudgetExceeded(budget)
}

/** Milliseconds left of the current budget; `Infinity` without one. A builder that knows its cost refuses early instead of spending the budget on a failure. */
export const remainingBudgetMs = (): number => (deadline === Infinity ? Infinity : Math.max(0, deadline - performance.now()))

/** The budget of a caller that can wait (a STEP export, the CAM kernel preparing a part): long exact builds, such as a thread of dozens of turns, are allowed under it. */
export const LONG_BUDGET_MS = 600_000
