/**
 * The solid bodies around a program, in the display world (spec 31 §4.3): stock, vise jaws and parallels, clamps, table;
 * lathe bar, chuck and jaws, tailstock; printer bed and build volume. Plain data: the viewport turns it into meshes, the setup
 * checks intersect the tool with it, and the verifier gets the boxes of the configured workholding.
 *
 * Mill vise with `jawAxis: "x"`: the jaws run along X and clamp across Y (fixed jaw at the back, +Y; moving jaw towards the
 * operator, -Y). The jaws grip the bottom `clampDepth` of the stock; the stock sits on parallels on the vise bed.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { LatheSetup, MachineSetup, MillSetup, PrinterSetup, StockBox } from "./machine-setup.ts"

export type BodyRole = "stock" | "jaw" | "parallel" | "vise-base" | "clamp" | "table" | "chuck" | "collet" | "tailstock" | "bed" | "build-volume"

export type BodyShape =
  | { readonly type: "box"; readonly min: Vec3; readonly max: Vec3 }
  /** A cylinder (or tube, `inner` > 0) along display +x from `x0` to `x1`, on the axis y = z = 0. */
  | { readonly type: "cylinder-x"; readonly x0: number; readonly x1: number; readonly radius: number; readonly inner: number }
  /** A cone along display +x from radius `r0` at `x0` to `r1` at `x1`. */
  | { readonly type: "cone-x"; readonly x0: number; readonly x1: number; readonly r0: number; readonly r1: number }

export interface Body {
  readonly id: string
  readonly role: BodyRole
  readonly shape: BodyShape
  /** Rotation about display +x (lathe jaws), radians, applied after the shape. */
  readonly rotateX?: number
  /** Turns with the spindle (lathe bar, chuck, jaws). */
  readonly spins: boolean
  readonly assumed: boolean
  /** A fixture the tool must not touch (jaws, clamps, parallels, table, chuck). */
  readonly obstacle: boolean
  /** Drawn as edges only (stock outline, build volume). */
  readonly wire?: boolean
}

const box = (min: Vec3, max: Vec3): BodyShape => ({ type: "box", min, max })

const millBodies = (setup: MillSetup): Body[] => {
  const s: StockBox = setup.stock
  const assumedHold = setup.assumed.includes("workholding")
  const assumedTable = setup.assumed.includes("table")
  const out: Body[] = [{ id: "stock", role: "stock", shape: box(s.min, s.max), spins: false, assumed: setup.assumed.includes("stock"), obstacle: false, wire: true }]
  const cx = (s.min.x + s.max.x) / 2, cy = (s.min.y + s.max.y) / 2
  const w = setup.workholding
  let tableTop = s.min.z
  if (w.kind === "vise") {
    const jawTop = s.min.z + w.clampDepth
    const bedTop = s.min.z - w.parallels
    const half = w.jawLength / 2
    const t = w.jawThickness
    // Jaw boxes in (along, across) coordinates, then mapped onto X/Y by the jaw axis.
    const place = (a0: number, a1: number, c0: number, c1: number, z0: number, z1: number): BodyShape =>
      w.jawAxis === "x" ? box({ x: a0, y: c0, z: z0 }, { x: a1, y: c1, z: z1 }) : box({ x: c0, y: a0, z: z0 }, { x: c1, y: a1, z: z1 })
    const along = w.jawAxis === "x" ? cx : cy
    const lo = w.jawAxis === "x" ? s.min.y : s.min.x
    const hi = w.jawAxis === "x" ? s.max.y : s.max.x
    out.push(
      { id: "jaw-fixed", role: "jaw", shape: place(along - half, along + half, hi, hi + t, bedTop, jawTop), spins: false, assumed: assumedHold, obstacle: true },
      { id: "jaw-moving", role: "jaw", shape: place(along - half, along + half, lo - t, lo, bedTop, jawTop), spins: false, assumed: assumedHold, obstacle: true }
    )
    if (w.parallels > 0) {
      const pw = Math.min(8, (hi - lo) / 4)
      out.push(
        { id: "parallel-1", role: "parallel", shape: place(along - half, along + half, lo, lo + pw, bedTop, s.min.z), spins: false, assumed: assumedHold, obstacle: true },
        { id: "parallel-2", role: "parallel", shape: place(along - half, along + half, hi - pw, hi, bedTop, s.min.z), spins: false, assumed: assumedHold, obstacle: true }
      )
    }
    const baseDepth = 60
    out.push({ id: "vise-base", role: "vise-base", shape: place(along - half - 10, along + half + 10, lo - t - 40, hi + t + 20, bedTop - baseDepth, bedTop), spins: false, assumed: assumedHold, obstacle: true })
    tableTop = bedTop - baseDepth
  } else if (w.kind === "clamps") {
    // Two strap clamps over the long edges, 10 mm onto the stock.
    const longX = s.max.x - s.min.x >= s.max.y - s.min.y
    const strap = (id: string, side: -1 | 1): Body => {
      const shape = longX
        ? box({ x: cx - 10, y: side < 0 ? s.min.y - 50 : s.max.y - 10, z: s.max.z }, { x: cx + 10, y: side < 0 ? s.min.y + 10 : s.max.y + 50, z: s.max.z + w.height })
        : box({ x: side < 0 ? s.min.x - 50 : s.max.x - 10, y: cy - 10, z: s.max.z }, { x: side < 0 ? s.min.x + 10 : s.max.x + 50, y: cy + 10, z: s.max.z + w.height })
      return { id, role: "clamp", shape, spins: false, assumed: assumedHold, obstacle: true }
    }
    out.push(strap("clamp-1", -1), strap("clamp-2", 1))
  }
  if (w.kind !== "none") {
    const hl = setup.table.length / 2, hw = setup.table.width / 2
    out.push({ id: "table", role: "table", shape: box({ x: cx - hl, y: cy - hw, z: tableTop - 50 }, { x: cx + hl, y: cy + hw, z: tableTop }), spins: false, assumed: assumedTable, obstacle: true })
  }
  return out
}

/** Display x of the bar's back end (in the chuck) and of its free end. */
export const latheStockEnds = (setup: LatheSetup): { readonly back: number; readonly free: number } =>
  setup.zero === "face" ? { back: -setup.stock.length, free: 0 } : { back: 0, free: setup.stock.length }

const latheBodies = (setup: LatheSetup): Body[] => {
  const { back, free } = latheStockEnds(setup)
  const r = setup.stock.diameter / 2
  const w = setup.workholding
  const assumed = setup.assumed.includes("workholding")
  const out: Body[] = [
    { id: "stock", role: "stock", shape: { type: "cylinder-x", x0: back, x1: free, radius: r, inner: setup.stock.bore / 2 }, spins: true, assumed: setup.assumed.includes("stock"), obstacle: false },
    { id: "chuck", role: "chuck", shape: { type: "cylinder-x", x0: back - 90, x1: back, radius: w.chuckDiameter / 2, inner: 0 }, spins: true, assumed, obstacle: true }
  ]
  const front = back + w.gripLength
  if (w.kind === "collet") {
    out.push({ id: "collet", role: "collet", shape: { type: "cylinder-x", x0: back, x1: front, radius: r + 8, inner: r }, spins: true, assumed, obstacle: true })
  } else {
    const count = w.kind === "3-jaw" ? 3 : 4
    for (let i = 0; i < count; i++) {
      // The jaw on top of the bar, rotated round the axis; 3 jaws at 120 degrees, 4 at 90 starting at 45.
      const angle = count === 3 ? (i * 2 * Math.PI) / 3 : Math.PI / 4 + (i * Math.PI) / 2
      out.push({ id: `jaw-${i + 1}`, role: "jaw", shape: box({ x: back, y: -10, z: r }, { x: front, y: 10, z: r + w.jawHeight }), rotateX: angle, spins: true, assumed, obstacle: true })
    }
  }
  if (w.tailstock) {
    out.push({ id: "tailstock", role: "tailstock", shape: { type: "cone-x", x0: free, x1: free + 40, r0: 2, r1: 18 }, spins: false, assumed, obstacle: true })
  }
  return out
}

const printerBodies = (setup: PrinterSetup): Body[] => {
  const { width, depth, origin } = setup.bed
  const x0 = origin === "corner" ? 0 : -width / 2
  const y0 = origin === "corner" ? 0 : -depth / 2
  return [
    { id: "bed", role: "bed", shape: box({ x: x0, y: y0, z: -4 }, { x: x0 + width, y: y0 + depth, z: 0 }), spins: false, assumed: false, obstacle: false },
    { id: "build-volume", role: "build-volume", shape: box({ x: x0, y: y0, z: 0 }, { x: x0 + width, y: y0 + depth, z: setup.buildHeight }), spins: false, assumed: false, obstacle: false, wire: true }
  ]
}

export const machineBodies = (setup: MachineSetup): ReadonlyArray<Body> =>
  setup.kind === "mill" ? millBodies(setup) : setup.kind === "lathe" ? latheBodies(setup) : printerBodies(setup)

/**
 * The configured mill workholding as verifier fixtures (program coordinates = display coordinates on a mill). Assumed bodies
 * are not fixtures: the verifier must not claim a clamp it was never told about.
 */
export const fixtureBoxes = (setup: MachineSetup): ReadonlyArray<{ readonly id: string; readonly bounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ: number; readonly maxZ: number } }> => {
  if (setup.kind !== "mill") return []
  return machineBodies(setup).flatMap((b) => b.obstacle && !b.assumed && b.role !== "table" && b.shape.type === "box"
    ? [{ id: b.id, bounds: { minX: b.shape.min.x, maxX: b.shape.max.x, minY: b.shape.min.y, maxY: b.shape.max.y, minZ: b.shape.min.z, maxZ: b.shape.max.z } }]
    : [])
}
