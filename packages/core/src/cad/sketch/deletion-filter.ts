/**
 * Minimal unsatisfiable subset by a chunked deletion filter (shared by the sketcher and the assembly mate solver).
 *
 * `unsat(active)` answers whether the constraints in `active` cannot all hold. Blocks of items are dropped while the rest stays
 * unsatisfiable, halving the block size down to single items, so a conflict of k items among n costs about k * log2(n) re-solves
 * instead of n. The result is 1-minimal when the budget is not exhausted: dropping any one remaining item makes the rest satisfiable
 * (assuming satisfiability is monotone, which holds for exact feasibility).
 */
export interface MinimalSet {
  readonly items: number[]
  /** False when the re-solve budget (or an abort) stopped the reduction early: the set still cannot hold, but may not be minimal. */
  readonly minimal: boolean
  readonly solves: number
}

export const minimalUnsatisfiable = (
  candidates: ReadonlyArray<number>, unsat: (active: ReadonlySet<number>) => boolean, budget = 300, signal?: AbortSignal
): MinimalSet => {
  let current = [...candidates]
  let spent = 0
  let minimal = true
  for (let chunk = Math.ceil(current.length / 2); chunk >= 1; chunk = chunk === 1 ? 0 : Math.ceil(chunk / 2)) {
    let i = 0
    while (i < current.length) {
      if (spent >= budget || signal?.aborted) { minimal = false; break }
      const block = new Set(current.slice(i, i + chunk))
      const rest = current.filter((c) => !block.has(c))
      spent++
      if (unsat(new Set(rest))) current = rest
      else i += chunk
    }
    if (!minimal) break
  }
  return { items: current, minimal, solves: spent }
}
