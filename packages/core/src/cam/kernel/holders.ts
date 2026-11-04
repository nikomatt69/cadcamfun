/**
 * Holder library and minimum stick-out (spec 69 D2, spec 54 R3).
 *
 * A holder is a stack of coaxial sections above the cutter (nut, nose, body) that grips a range of shank diameters. The sizes below
 * are generic class dimensions (ER collet nuts, a slim shrink-fit chuck, a hydraulic chuck), not a vendor catalogue: a shop that needs
 * its own holders brings them as `HolderSpec` records (spec 69 D3 reads them from files).
 *
 * The minimum stick-out is the least length from the tip to the holder face at which no section of the holder reaches into an
 * obstacle. An obstacle is described the way a pocket wall or a fixture sees the tool: material at radial distance >= `distance` from
 * the tool axis up to `height` above the tip (the depth the tip sinks below the obstacle's top, measured along the axis). A section of
 * radius r collides when r + margin > distance and the section lies below `height`; the search is exact for such obstacles because the
 * sections are cylinders: stickout >= height + margin_z - (offset of the section above the holder face).
 */
import type { Cutter, Holder } from "./cutters.ts"

export interface HolderSpec {
  readonly id: string
  readonly name: string
  readonly kind: "er" | "shrink" | "hydraulic" | "sidelock"
  /** Shank diameters it grips, mm (inclusive range; a collet holder needs a collet size that matches). */
  readonly shankMin: number
  readonly shankMax: number
  /** First section, from the holder face up. */
  readonly diameter: number
  readonly length: number
  readonly steps?: ReadonlyArray<{ readonly diameter: number; readonly length: number }>
  /** Least length of shank the holder must grip, mm (stick-out can never be below flute length and never leave less than this in the holder). */
  readonly minGrip: number
}

export const HOLDER_LIBRARY: ReadonlyArray<HolderSpec> = [
  { id: "er11-std", name: "ER11 collet nut", kind: "er", shankMin: 1, shankMax: 7, diameter: 19, length: 28, steps: [{ diameter: 30, length: 30 }], minGrip: 10 },
  { id: "er16-std", name: "ER16 collet nut", kind: "er", shankMin: 1, shankMax: 10, diameter: 28, length: 30, steps: [{ diameter: 40, length: 30 }], minGrip: 12 },
  { id: "er20-std", name: "ER20 collet nut", kind: "er", shankMin: 2, shankMax: 13, diameter: 34, length: 32, steps: [{ diameter: 46, length: 30 }], minGrip: 14 },
  { id: "er25-std", name: "ER25 collet nut", kind: "er", shankMin: 2, shankMax: 16, diameter: 42, length: 34, steps: [{ diameter: 55, length: 30 }], minGrip: 16 },
  { id: "er32-std", name: "ER32 collet nut", kind: "er", shankMin: 3, shankMax: 20, diameter: 50, length: 36, steps: [{ diameter: 63, length: 30 }], minGrip: 18 },
  { id: "shrink-slim-3-6", name: "Slim shrink-fit chuck 3-6", kind: "shrink", shankMin: 3, shankMax: 6, diameter: 12, length: 40, steps: [{ diameter: 24, length: 30 }, { diameter: 40, length: 30 }], minGrip: 20 },
  { id: "shrink-slim-8-12", name: "Slim shrink-fit chuck 8-12", kind: "shrink", shankMin: 8, shankMax: 12, diameter: 24, length: 50, steps: [{ diameter: 34, length: 30 }, { diameter: 50, length: 30 }], minGrip: 30 },
  { id: "hyd-6-20", name: "Hydraulic chuck 6-20", kind: "hydraulic", shankMin: 6, shankMax: 20, diameter: 44, length: 60, steps: [{ diameter: 56, length: 30 }], minGrip: 30 },
  { id: "sidelock-6-20", name: "Weldon side-lock holder", kind: "sidelock", shankMin: 6, shankMax: 20, diameter: 48, length: 55, steps: [{ diameter: 60, length: 30 }], minGrip: 25 }
]

export const holderOf = (spec: HolderSpec): Holder => ({ diameter: spec.diameter, length: spec.length, ...(spec.steps !== undefined && spec.steps.length > 0 ? { steps: spec.steps } : {}) })

/** Holders of `library` that grip `shankDiameter`, nearest range first. */
export const holdersFor = (shankDiameter: number, library: ReadonlyArray<HolderSpec> = HOLDER_LIBRARY): ReadonlyArray<HolderSpec> =>
  library.filter((h) => shankDiameter >= h.shankMin - 1e-9 && shankDiameter <= h.shankMax + 1e-9).sort((a, b) => a.diameter - b.diameter)

export interface Obstacle {
  /** Material at radial distance >= this from the tool axis, mm. */
  readonly distance: number
  /** ... up to this height above the tip, mm (the depth the tip sits below the obstacle's top). */
  readonly height: number
}

export interface StickoutRequest {
  /** Distance the tip must reach from the highest obstacle top, i.e. the deepest `height` of any obstacle, is derived from `obstacles`. */
  readonly obstacles: ReadonlyArray<Obstacle>
  /** Clearance kept between the holder and any obstacle, mm (default 1). */
  readonly margin?: number
  /** Extra length above the deepest reach, mm. Included in `margin` along the axis; kept separate for the report. */
}

export interface StickoutResult {
  readonly holder: HolderSpec
  /** Least tip-to-holder-face length that clears every obstacle, mm (never below the flute length plus the holder's grip rule). */
  readonly minimum: number
  /** The cutter can be held that long (`minimum <= cutter.stickout`). */
  readonly feasible: boolean
  /** The section that sets the minimum, or "flutes" when the cutter itself does. */
  readonly limitedBy: string
}

const sections = (h: HolderSpec): ReadonlyArray<{ readonly offset: number; readonly radius: number; readonly length: number }> => {
  const out: Array<{ offset: number; radius: number; length: number }> = []
  let offset = 0
  for (const s of [{ diameter: h.diameter, length: h.length }, ...(h.steps ?? [])]) { out.push({ offset, radius: s.diameter / 2, length: s.length }); offset += s.length }
  return out
}

/** The least stick-out for one holder. */
export const minimumStickout = (cutter: Cutter, holder: HolderSpec, request: StickoutRequest): StickoutResult => {
  const margin = request.margin ?? 1
  let minimum = cutter.fluteLength, limitedBy = "flutes"
  for (const s of sections(holder)) {
    for (const o of request.obstacles) {
      // The section is a problem only where it is wider than the free radius to the obstacle.
      if (s.radius + margin <= o.distance + 1e-12) continue
      // Its lower face sits at stickout + offset; the obstacle reaches `height` + margin above the tip: stickout + offset >= height + margin.
      const need = o.height + margin - s.offset
      // A section that starts above the obstacle's reach is clear; one that straddles it must be lifted whole.
      if (need > minimum) { minimum = need; limitedBy = `holder section Ø${s.radius * 2} against the obstacle at ${o.distance} mm` }
    }
  }
  return { holder, minimum, feasible: minimum <= cutter.stickout + 1e-9, limitedBy }
}

/**
 * The holder of the library that grips the cutter's shank and needs the shortest stick-out for the obstacles (ties: the slimmer holder).
 * `undefined` when no holder grips the shank. Feasible results come first; when none is feasible the least infeasible one is returned
 * with `feasible: false` so the caller can say how much longer the cutter would have to be.
 */
export const shortestHolder = (cutter: Cutter, request: StickoutRequest, library: ReadonlyArray<HolderSpec> = HOLDER_LIBRARY): StickoutResult | undefined => {
  const results = holdersFor(cutter.shankDiameter, library).map((h) => minimumStickout(cutter, h, request))
  results.sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.minimum - b.minimum || a.holder.diameter - b.holder.diameter)
  return results[0]
}

/** The cutter held in `holder` at `stickout`. */
export const heldIn = (cutter: Cutter, holder: HolderSpec, stickout: number): Cutter => ({ ...cutter, stickout, holder: holderOf(holder) })
