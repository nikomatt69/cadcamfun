import type { CycleMove } from "./ir.ts"

/** Shared by expanded and canned emission, without allocating expanded moves. */
export const assertCycleSafe = (cycle: CycleMove): void => {
  const { to, retractHeight, feed, peckDepth, dwellSeconds } = cycle
  if (![to.x, to.y, to.z, retractHeight, feed, peckDepth, dwellSeconds].every(Number.isFinite) ||
    feed <= 0 || peckDepth < 0 || dwellSeconds < 0 || to.z >= retractHeight) {
    throw new RangeError("Invalid drilling cycle geometry, feed, peck depth or dwell")
  }
  if (cycle.cycle === "peck" || cycle.cycle === "chipBreak") {
    const depth = retractHeight - to.z
    const peck = peckDepth > 0 ? peckDepth : depth
    if (!Number.isFinite(depth) || Math.ceil(depth / peck) > 100_000 ||
      retractHeight - peck === retractHeight || to.z + peck === to.z) {
      throw new RangeError("Drilling cycle exceeds the peck limit or cannot make numeric progress")
    }
  }
}
