/**
 * Cutting tools of the CAM kernel (spec 29 §3 ToolAssemblySnapshot): the cutter shape, its material and coating, the
 * flute / shank / holder envelope and the limits the cutting data and the collision checks need. A catalogue diameter
 * alone is not a tool.
 *
 * The kernel keeps its own record and converts it to the legacy `Tool` the operations take and to the `VerifyTool` the
 * replay checks take, so both see the same cutter.
 */
import { METRIC_THREADS } from "../../cad/fasteners.ts"
import type { Tool } from "../tool.ts"
import type { VerifyTool } from "../verify/schema.ts"

export type CutterKind =
  | "flat"
  | "ball"
  | "bull"
  | "chamfer"
  | "spot"
  | "drill"
  | "facemill"
  | "threadmill"
  | "engraver"
  /** A machine tap (rigid tapping): `diameter` is the nominal (major) diameter, `pitch` the thread it cuts. */
  | "tap"
  /** A machine reamer: `diameter` is the finished bore. */
  | "reamer"
  /** A countersink: a cone of included `angle` (82 / 90 / 100 / 120) from the flat `tipDiameter` up to `diameter`. */
  | "countersink"
  /**
   * A boring / back-boring bar: one insert of axial height `headHeight` sweeps `diameter` about the spindle axis, on a body of
   * `neckDiameter` that is what goes through the pilot hole. Bores on the way up as well as on the way down.
   */
  | "boringbar"
  /** A T-slot / disc cutter: a disc of `diameter` and thickness `headHeight` on a neck of `neckDiameter`. */
  | "tslot"
  /** A dovetail cutter: widest at the tip (`diameter`), flanks at half of the included `angle` from the axis over `headHeight`, on a neck. */
  | "dovetail"

export type ToolMaterial = "hss" | "hss-co" | "carbide" | "pcd"

export type Coating = "none" | "tin" | "ticn" | "altin" | "alcrn" | "zrn" | "dlc" | "diamond"

export interface Holder {
  readonly diameter: number
  readonly length: number
  /**
   * Sections stacked above the first one, from the holder face upward (a collet nut, then a taper, then the spindle nose): each
   * with its own diameter and length. The first section is `diameter` x `length`; a holder without `steps` is one cylinder.
   */
  readonly steps?: ReadonlyArray<{ readonly diameter: number; readonly length: number }>
}

export interface Cutter {
  readonly id: string
  readonly name: string
  readonly kind: CutterKind
  /** Cutting diameter, mm (the largest diameter of a chamfer / spot / engraver cone). */
  readonly diameter: number
  readonly flutes: number
  readonly material: ToolMaterial
  readonly coating: Coating
  /** Corner radius of a bull nose, mm. */
  readonly cornerRadius?: number
  /** Included angle of a chamfer / spot drill / engraver cone or a drill point, degrees. */
  readonly angle?: number
  /** Flat tip diameter of an engraver, mm. */
  readonly tipDiameter?: number
  /** Thread mill or tap: the pitch its profile cuts, mm. */
  readonly pitch?: number
  /** Boring bar / T-slot / dovetail: diameter of the body above the cutting head, mm. */
  readonly neckDiameter?: number
  /** Boring bar insert height, T-slot disc thickness, dovetail flank height: the axial extent of the cutting head from the tip, mm. */
  readonly headHeight?: number
  /** Length of the cutting edges from the tip, mm. */
  readonly fluteLength: number
  readonly shankDiameter: number
  /** Length from the tip to the holder face, mm. */
  readonly stickout: number
  readonly holder?: Holder
  readonly maxRpm?: number
  /** Carousel pocket, when the machine's tool table is known. */
  readonly number?: number
}

const LEGACY_KIND: Readonly<Record<CutterKind, Tool["kind"]>> = {
  flat: "endmill",
  ball: "ballnose",
  bull: "endmill",
  chamfer: "vbit",
  spot: "vbit",
  drill: "drill",
  facemill: "facemill",
  threadmill: "endmill",
  engraver: "vbit",
  // The replay sweeps a tap and a reamer as cylinders of their cutting diameter (the tap's lead chamfer is ignored: conservative).
  tap: "endmill",
  reamer: "endmill",
  countersink: "vbit",
  // A boring bar, a T-slot and a dovetail cutter are swept as the cylinder of their largest diameter (more removal than the
  // real head, never less): the conservative bound the replay accepts for shapes it has no exact profile for.
  boringbar: "endmill",
  tslot: "endmill",
  dovetail: "endmill"
}

/** The legacy record the operations take (`cam/tool.ts`). */
export const legacyTool = (c: Cutter, fallbackMaxRpm = 24000): Tool => ({
  id: c.id,
  name: c.name,
  kind: LEGACY_KIND[c.kind],
  diameter: c.diameter,
  flutes: c.flutes,
  maxRpm: c.maxRpm ?? fallbackMaxRpm,
  stickout: c.stickout,
  ...(c.angle !== undefined && LEGACY_KIND[c.kind] === "vbit" ? { angle: c.angle } : {}),
  ...(c.kind === "ball" ? { tipRadius: c.diameter / 2 } : c.kind === "bull" && c.cornerRadius !== undefined ? { tipRadius: c.cornerRadius } : {})
})

/** The record the replay checks take (`cam/verify`): cutting profile, flute length, shank and holder. */
export const verifyTool = (c: Cutter): VerifyTool => ({
  kind: LEGACY_KIND[c.kind] === "facemill" ? "endmill" : LEGACY_KIND[c.kind],
  diameter: c.diameter,
  cuttingLength: c.fluteLength,
  shankDiameter: c.shankDiameter,
  stickout: c.stickout,
  ...(c.holder !== undefined ? { holderDiameter: c.holder.diameter, holderLength: c.holder.length, ...(c.holder.steps !== undefined && c.holder.steps.length > 0 ? { holderSteps: c.holder.steps } : {}) } : {}),
  ...(c.angle !== undefined && (c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" || c.kind === "countersink" || c.kind === "drill") ? { angle: c.angle } : {}),
  ...(c.kind === "bull" && c.cornerRadius !== undefined ? { tipRadius: c.cornerRadius } : {})
})

/**
 * Depth from the surface at which a countersink cone reaches the finished diameter `diameter`, mm: the cone runs from its flat tip
 * (`tipDiameter`, 0 = a point) at the tip to its full diameter at `pointLength`, so the tip goes down by the cone height between the
 * tip and the finished diameter. Throws when the tool cannot make that diameter.
 */
export const countersinkDepth = (c: Cutter, diameter: number): number => {
  if (c.angle === undefined) throw new RangeError(`${c.id}: a countersink needs its included angle`)
  const tip = (c.tipDiameter ?? 0) / 2
  if (!(diameter / 2 > tip + 1e-9)) throw new RangeError(`${c.id}: a Ø${diameter} countersink is not wider than the Ø${c.tipDiameter ?? 0} flat of its tip`)
  if (diameter > c.diameter + 1e-9) throw new RangeError(`${c.id}: the cone is Ø${c.diameter} at most, a Ø${diameter} countersink is wider`)
  return (diameter / 2 - tip) / Math.tan((c.angle * Math.PI) / 360)
}

/** Height of the cone point below the full diameter (drills, spot drills, chamfer mills). */
export const pointLength = (c: Cutter): number => {
  if (c.angle === undefined) return 0
  const half = (c.angle * Math.PI) / 360
  return (c.diameter / 2 - (c.tipDiameter ?? 0) / 2) / Math.tan(half)
}

/** Cutter problems that would make any computation meaningless. */
export const cutterIssues = (c: Cutter): ReadonlyArray<string> => {
  const out: string[] = []
  const finite = [c.diameter, c.flutes, c.fluteLength, c.shankDiameter, c.stickout].every((v) => Number.isFinite(v) && v > 0)
  if (!finite) out.push(`${c.id}: diameter, flutes, flute length, shank and stickout must be positive numbers`)
  if (!Number.isInteger(c.flutes)) out.push(`${c.id}: the number of flutes must be an integer`)
  if (c.fluteLength > c.stickout + 1e-9) out.push(`${c.id}: the flutes (${c.fluteLength} mm) are longer than the stickout (${c.stickout} mm)`)
  if (c.kind === "bull" && (c.cornerRadius === undefined || c.cornerRadius <= 0 || c.cornerRadius >= c.diameter / 2)) out.push(`${c.id}: a bull nose needs 0 < corner radius < D/2`)
  if ((c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" || c.kind === "countersink" || c.kind === "dovetail") && (c.angle === undefined || c.angle <= 0 || c.angle >= 180)) out.push(`${c.id}: a ${c.kind} needs its included angle`)
  if ((c.kind === "threadmill" || c.kind === "tap") && (c.pitch === undefined || c.pitch <= 0)) out.push(`${c.id}: a ${c.kind === "tap" ? "tap" : "thread mill"} needs the pitch its profile cuts`)
  if (c.kind === "countersink" && c.tipDiameter !== undefined && c.tipDiameter >= c.diameter) out.push(`${c.id}: the flat of a countersink tip must be narrower than its cone`)
  if (c.kind === "boringbar" || c.kind === "tslot" || c.kind === "dovetail") {
    if (c.neckDiameter === undefined || !(c.neckDiameter > 0) || c.neckDiameter >= c.diameter) out.push(`${c.id}: a ${c.kind} needs a neck narrower than its head (0 < neck < D)`)
    if (c.headHeight === undefined || !(c.headHeight > 0) || c.headHeight > c.fluteLength + 1e-9) out.push(`${c.id}: a ${c.kind} needs a head height inside its cutting length`)
    else if (c.kind === "dovetail" && c.angle !== undefined && c.neckDiameter !== undefined && c.diameter / 2 - c.headHeight * Math.tan((c.angle * Math.PI) / 360) < c.neckDiameter / 2 - 1e-9) out.push(`${c.id}: the dovetail flanks run into the neck before the head height`)
  }
  return out
}

// ---------------------------------------------------------------- default library

const HOLDER: Holder = { diameter: 40, length: 50 }

const flat = (d: number, flutes: number, material: ToolMaterial = "carbide", coating: Coating = "altin", suffix = ""): Cutter => ({
  id: `flat-${d}${suffix}`, name: `End mill Ø${d} ${flutes}F ${material === "carbide" ? "carbide" : "HSS"} ${coating === "none" ? "uncoated" : coating.toUpperCase()}`, kind: "flat", diameter: d, flutes, material, coating,
  fluteLength: Math.max(3, Math.round(d * 2.5)), shankDiameter: Math.max(3, Math.ceil(d < 3 ? 3 : d)), stickout: Math.max(12, Math.round(d * 3.5 + 8)), holder: HOLDER
})

const ball = (d: number): Cutter => ({
  id: `ball-${d}`, name: `Ball end mill Ø${d} 2F carbide`, kind: "ball", diameter: d, flutes: 2, material: "carbide", coating: "altin",
  fluteLength: Math.max(3, Math.round(d * 2)), shankDiameter: Math.max(3, d < 3 ? 3 : d), stickout: Math.max(15, Math.round(d * 4 + 10)), holder: HOLDER
})

const drill = (d: number): Cutter => ({
  id: `drill-${d}`, name: `Drill Ø${d} carbide 140°`, kind: "drill", diameter: d, flutes: 2, material: "carbide", coating: "tin", angle: 140,
  fluteLength: Math.round(d * 5 + 4), shankDiameter: Math.max(3, Math.ceil(d)), stickout: Math.round(d * 5 + 15), holder: HOLDER
})

/** Reamer sizes of the default library (H7), and the drill a reamer follows: 0.2 mm under up to Ø6, 0.3 mm above. */
const REAMER_SIZES: ReadonlyArray<number> = [3, 4, 5, 6, 8, 10, 12]
export const reamDrill = (d: number): number => Math.round((d - (d <= 6 ? 0.2 : 0.3)) * 10) / 10

/** Drill sizes of the default library: every ISO tap drill and medium clearance hole of `cad/fasteners.ts`, the pre-ream sizes, plus round sizes. */
const DRILL_SIZES: ReadonlyArray<number> = [...new Set([
  ...METRIC_THREADS.filter((t) => t.d <= 20).flatMap((t) => [t.tapDrill, t.clearance.medium]),
  ...REAMER_SIZES.map(reamDrill),
  2, 3, 4, 5, 6, 7, 8, 10, 12
])].sort((a, b) => a - b)

/** HSS-E-PM machine tap, TiCN, form C lead (2-3 pitches): coarse metric M3-M12. Taps run in a rigid holder. */
const tap = (d: number, pitch: number): Cutter => ({
  id: `tap-m${d}`, name: `Machine tap M${d}x${pitch} HSS-E TiCN form C`, kind: "tap", diameter: d, flutes: d <= 5 ? 3 : 4, material: "hss-co", coating: "ticn", pitch,
  fluteLength: Math.round(d * 2.5 + 4), shankDiameter: Math.max(3.5, Math.round(d * 0.8 * 10) / 10), stickout: Math.round(d * 6 + 25), holder: HOLDER
})

/** Countersink of cone diameter `d` and included angle `angle`, with the small flat every ground tip has (a tenth of the diameter). */
const countersink = (d: number, angle: number): Cutter => ({
  id: `csk-${d}-${angle}`, name: `Countersink Ø${d} ${angle}° carbide`, kind: "countersink", diameter: d, flutes: 3, material: "carbide", coating: "tin", angle, tipDiameter: Math.round(d * 0.1 * 10) / 10,
  fluteLength: Math.ceil(d / 2 / Math.tan((angle * Math.PI) / 360)) + 1, shankDiameter: d <= 12 ? 8 : 12, stickout: Math.round(d * 2 + 20), holder: HOLDER
})

const reamer = (d: number): Cutter => ({
  id: `reamer-${d}`, name: `Reamer Ø${d} H7 carbide 6F`, kind: "reamer", diameter: d, flutes: 6, material: "carbide", coating: "tin",
  fluteLength: Math.round(d * 3 + 6), shankDiameter: Math.max(3, Math.ceil(d)), stickout: Math.round(d * 5 + 20), holder: HOLDER
})

/**
 * A modest, realistic crib of carbide tools a job uses when it does not bring its own library: end mills Ø1-Ø16, ball
 * mills, two bull noses, a face mill, spot drills, chamfer mills, an engraver, thread mills for the coarse metric
 * pitches, taps M3-M12, H7 reamers Ø3-Ø12 and the drills of the metric fastener table and of the reamers.
 */
export const DEFAULT_CUTTERS: ReadonlyArray<Cutter> = [
  ...[1, 2, 3, 4, 6, 8, 10, 12, 16].map((d) => flat(d, d < 3 ? 2 : d <= 12 ? 3 : 4)),
  // Aluminium / non-ferrous end mills: polished ZrN flutes, three flutes for chip room.
  ...[2, 3, 4, 6, 8, 10, 12, 16].map((d) => flat(d, d < 3 ? 2 : 3, "carbide", "zrn", "-n")),
  ...[1, 2, 3, 4, 6, 8, 10].map(ball),
  { id: "bull-6-r0.5", name: "Bull nose Ø6 R0.5 4F carbide", kind: "bull", diameter: 6, flutes: 4, material: "carbide", coating: "altin", cornerRadius: 0.5, fluteLength: 15, shankDiameter: 6, stickout: 30, holder: HOLDER },
  { id: "bull-10-r1", name: "Bull nose Ø10 R1 4F carbide", kind: "bull", diameter: 10, flutes: 4, material: "carbide", coating: "altin", cornerRadius: 1, fluteLength: 22, shankDiameter: 10, stickout: 40, holder: HOLDER },
  { id: "facemill-50", name: "Face mill Ø50 5 inserts", kind: "facemill", diameter: 50, flutes: 5, material: "carbide", coating: "ticn", fluteLength: 6, shankDiameter: 22, stickout: 45, holder: { diameter: 50, length: 40 } },
  { id: "spot-6", name: "Spot drill Ø6 90°", kind: "spot", diameter: 6, flutes: 2, material: "carbide", coating: "tin", angle: 90, fluteLength: 6, shankDiameter: 6, stickout: 25, holder: HOLDER },
  { id: "spot-10", name: "Spot drill Ø10 90°", kind: "spot", diameter: 10, flutes: 2, material: "carbide", coating: "tin", angle: 90, fluteLength: 8, shankDiameter: 10, stickout: 35, holder: HOLDER },
  { id: "chamfer-12", name: "Chamfer mill Ø12 90°", kind: "chamfer", diameter: 12, flutes: 4, material: "carbide", coating: "tin", angle: 90, tipDiameter: 0.5, fluteLength: 6, shankDiameter: 12, stickout: 35, holder: HOLDER },
  { id: "chamfer-20", name: "Chamfer mill Ø20 90°", kind: "chamfer", diameter: 20, flutes: 4, material: "carbide", coating: "tin", angle: 90, tipDiameter: 1, fluteLength: 10, shankDiameter: 16, stickout: 45, holder: HOLDER },
  { id: "engraver-60", name: "Engraver 60° tip 0.2", kind: "engraver", diameter: 3, flutes: 1, material: "carbide", coating: "none", angle: 60, tipDiameter: 0.2, fluteLength: 3, shankDiameter: 3, stickout: 20, holder: HOLDER },
  ...[0.5, 0.7, 0.8, 1, 1.25, 1.5, 1.75, 2].map((pitch): Cutter => {
    // A single-profile thread mill fits a hole a little larger than its own diameter.
    const d = pitch <= 0.8 ? 2.4 : pitch <= 1 ? 4.6 : pitch <= 1.5 ? 6.4 : 8.8
    return { id: `threadmill-p${pitch}`, name: `Thread mill Ø${d} P${pitch}`, kind: "threadmill", diameter: d, flutes: 3, material: "carbide", coating: "tin", pitch, fluteLength: Math.round(d * 2.5), shankDiameter: Math.max(4, Math.ceil(d)), stickout: Math.round(d * 4 + 15), holder: HOLDER }
  }),
  ...METRIC_THREADS.filter((t) => t.d >= 3 && t.d <= 12).map((t) => tap(t.d, t.pitch)),
  ...REAMER_SIZES.map(reamer),
  ...DRILL_SIZES.map(drill),
  ...[[12, 90], [16, 90], [20, 90], [16, 82], [20, 100]].map(([d, a]): Cutter => countersink(d!, a!)),
  // A back-boring bar for a pilot of Ø12 or more: 3 mm insert on a Ø6 body; T-slot and dovetail cutters for undercut channels.
  { id: "boringbar-b16", name: "Back-boring bar Ø16 on Ø6 body", kind: "boringbar", diameter: 16, flutes: 1, material: "carbide", coating: "tin", neckDiameter: 6, headHeight: 3, fluteLength: 40, shankDiameter: 6, stickout: 60, holder: HOLDER },
  { id: "tslot-12x4", name: "T-slot cutter Ø12 x 4", kind: "tslot", diameter: 12, flutes: 4, material: "carbide", coating: "altin", neckDiameter: 5, headHeight: 4, fluteLength: 12, shankDiameter: 6, stickout: 30, holder: HOLDER },
  { id: "tslot-20x6", name: "T-slot cutter Ø20 x 6", kind: "tslot", diameter: 20, flutes: 6, material: "carbide", coating: "altin", neckDiameter: 8, headHeight: 6, fluteLength: 16, shankDiameter: 10, stickout: 40, holder: HOLDER },
  { id: "dovetail-12-60", name: "Dovetail cutter Ø12 60°", kind: "dovetail", diameter: 12, flutes: 4, material: "carbide", coating: "altin", angle: 60, neckDiameter: 6, headHeight: 4, fluteLength: 10, shankDiameter: 8, stickout: 30, holder: HOLDER }
]

export const findCutter = (library: ReadonlyArray<Cutter>, id: string): Cutter | undefined => library.find((c) => c.id === id)
