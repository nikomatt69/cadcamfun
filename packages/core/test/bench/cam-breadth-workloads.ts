/**
 * Bench workloads of the CAM breadth lane: engagement along a program, feed optimisation, and the lathe stock-removal replay.
 * Each returns a checksum so the work cannot be skipped.
 */
import type { Move } from "../../src/cam/ir.ts"
import type { Cutter } from "../../src/cam/kernel/cutters.ts"
import { engagementAlong, stockBlock } from "../../src/cam/kernel/engagement.ts"
import { optimizeFeeds } from "../../src/cam/kernel/feed-optimise.ts"
import { findMaterial } from "../../src/cam/kernel/materials.ts"

const cutter: Cutter = { id: "t", name: "em10", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 25, shankDiameter: 10, stickout: 45 }

/** A 100 x 80 pocket roughed by 4 mm stepover zigzag passes: about 3 000 mm of cutting path at 0.25 mm cells. */
const zigzag = (): Move[] => {
  const moves: Move[] = [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 0, y: 0, z: -3 }, feed: 300 }]
  let forward = true
  for (let y = 0; y <= 70; y += 4) {
    moves.push({ _tag: "Linear", to: { x: forward ? 90 : 0, y, z: -3 }, feed: 900 })
    if (y + 4 <= 70) moves.push({ _tag: "Linear", to: { x: forward ? 90 : 0, y: y + 4, z: -3 }, feed: 900 })
    forward = !forward
  }
  return moves
}

export const CAM_BREADTH_WORKLOADS: Readonly<Record<string, () => number>> = {
  "engagement-pocket": () => {
    const stock = stockBlock(-10, -10, 100, 80, -10, 0, 0.25)
    const r = engagementAlong(zigzag(), stock, cutter)
    let sum = 0
    for (let k = 0; k < r.steps.count; k++) sum += r.steps.ae[k]!
    return sum
  },
  "feed-optimise-pocket": () => {
    const stock = stockBlock(-10, -10, 100, 80, -10, 0, 0.5)
    const r = optimizeFeeds({ moves: zigzag(), stock, cutter, material: findMaterial("steel-c45")!, machine: { maxRpm: 12000, maxFeed: 9000, powerKw: 11, torqueNm: 60 }, rpm: 5000, mode: "power" })
    return r.report.cutSecondsAfter
  }
}
