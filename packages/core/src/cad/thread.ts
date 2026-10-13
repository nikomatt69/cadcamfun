/**
 * Modelled threads: an ISO metric thread as real helical geometry, not a cosmetic note. The tool is a core (a cylinder at the root of
 * the thread) united with a helical ridge (the thread profile swept along a helix with the profile kept radial, `sweepSolid`'s `axis`),
 * the whole clipped to the thread length.
 *
 *   external   a threaded rod: core at the minor diameter d3 = d - 1.22687 P, ridge up to the major diameter d (crest flat P/8,
 *              flanks 60 degrees to each other). Added to a body, or made a body, by the caller.
 *   internal   the tool that CUTS a tapped hole: core at the minor diameter D1 = D - 1.08253 P (the tap drill), groove out to the
 *              major diameter D (root flat P/8). Subtracted from a body by the caller.
 *
 * The profile follows the ISO 68-1 basic profile (flank angle 60 degrees, H = 0.866 P). The flank is cut square to the helix, not to the
 * axis, which differs from the true axial section by the cosine of the helix angle (under 0.5 % up to M3 x 0.5); the axial widths are
 * corrected for it so pitch and crest widths are exact.
 */
import { booleanMesh } from "./csg.ts"
import { COIL_MAX_TURNS, coilGeometry } from "./helix.ts"
import { meshOf, type Mesh } from "./solid.ts"
import { sweepSolid } from "./sweep-loft.ts"
import type { Vec2 } from "./vec.ts"

const TAN30 = Math.tan(Math.PI / 6)
/** Height of the ridge of an external thread (h3) and the depth of an internal one (H1 + H/8 .. 5H/8 + H/8), in units of the pitch. */
const EXTERNAL_HEIGHT = 0.61343
const INTERNAL_HEIGHT = 0.54127

export interface ThreadSpec {
  /** Nominal (major) diameter, mm. */
  readonly diameter: number
  readonly pitch: number
  /** Length of the threaded part along Z, mm. */
  readonly length: number
  readonly internal: boolean
  readonly left?: boolean
  /** Where the axis stands and where the thread starts along Z. */
  readonly cx?: number
  readonly cy?: number
  readonly z0?: number
}

export interface ThreadSizes {
  readonly major: number
  /** Diameter at the root: d3 of an external thread, D1 (the tap drill) of an internal one. */
  readonly minor: number
  /** Radial height of the ridge or groove. */
  readonly height: number
  /** Width of the profile at the root and at the crest, along the axis. */
  readonly rootWidth: number
  readonly crestWidth: number
}

/** The ISO basic-profile measures of a thread. */
export const threadSizes = (diameter: number, pitch: number, internal: boolean): ThreadSizes => {
  const height = (internal ? INTERNAL_HEIGHT : EXTERNAL_HEIGHT) * pitch
  const crestWidth = pitch / 8
  return { major: diameter, minor: diameter - 2 * height, height, rootWidth: crestWidth + 2 * height * TAN30, crestWidth }
}

/** Why a thread cannot be built, or undefined. */
export const threadProblem = (t: ThreadSpec): string | undefined => {
  if (!(t.diameter > 0 && t.pitch > 0 && t.length > 0)) return "A thread needs a positive diameter, pitch and length"
  if (t.pitch > t.diameter / 2) return `A pitch of ${t.pitch} mm is too coarse for a ${t.diameter} mm thread`
  const sizes = threadSizes(t.diameter, t.pitch, t.internal)
  if (!(sizes.minor > 0)) return "The thread's minor diameter is not positive"
  if ((t.length + 2 * t.pitch) / t.pitch > COIL_MAX_TURNS) return `A thread has at most ${COIL_MAX_TURNS - 2} turns (this one is ${(t.length / t.pitch).toFixed(1)} long: ${t.length} mm at a pitch of ${t.pitch} mm)`
  return undefined
}

/** A solid cylinder along Z whose chord error is under 0.005 mm. */
const roundBar = (cx: number, cy: number, radius: number, from: number, to: number): Mesh => {
  const n = Math.max(24, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - 0.005 / radius))))
  const profile = Array.from({ length: n }, (_, k) => ({ x: cx + radius * Math.cos((2 * Math.PI * k) / n), y: cy + radius * Math.sin((2 * Math.PI * k) / n) }))
  return meshOf({ _tag: "Extrude", profile, height: to - from, origin: { x: 0, y: 0, z: from } }, 0.01)
}

/**
 * The thread as a mesh in world coordinates: a threaded rod (external) or the tool for a tapped hole (internal). Throws a
 * `RangeError` when the thread cannot be built (`threadProblem`).
 */
export const threadTool = (t: ThreadSpec): Mesh => {
  const problem = threadProblem(t)
  if (problem !== undefined) throw new RangeError(problem)
  const cx = t.cx ?? 0, cy = t.cy ?? 0, z0 = t.z0 ?? 0
  const sizes = threadSizes(t.diameter, t.pitch, t.internal)
  const rootRadius = sizes.minor / 2
  // The ridge starts a pitch before the thread and ends a pitch after, so the flat cuts at the ends meet the full profile.
  const turns = (t.length + 2 * t.pitch) / t.pitch
  // The profile reaches into the core so the two unite on a surface, not along a shared cylinder; its width grows with the flank.
  const sink = 0.05 * t.pitch
  const baseWidth = sizes.rootWidth + 2 * sink * TAN30
  const helixAngle = Math.atan(t.pitch / (2 * Math.PI * rootRadius))
  const stretch = 1 / Math.cos(helixAngle)
  const section: Vec2[] = [
    { x: -sink, y: (-baseWidth / 2) * stretch }, { x: sizes.height, y: (-sizes.crestWidth / 2) * stretch },
    { x: sizes.height, y: (sizes.crestWidth / 2) * stretch }, { x: -sink, y: (baseWidth / 2) * stretch }
  ]
  const helix = coilGeometry({ cx, cy, z0: z0 - t.pitch, radius: rootRadius, pitch: t.pitch, turns, wire: sizes.height, square: false, left: t.left === true, section })
  const ridge = sweepSolid({ ring: helix.ring, ring2d: helix.ring2d, normal: helix.normal, centre: helix.centre, path: helix.path, closed: false, axis: { point: { x: cx, y: cy, z: z0 - t.pitch }, direction: { x: 0, y: 0, z: 1 } } })
  const reach = t.diameter / 2 + 2 * t.pitch
  const slab = meshOf({ _tag: "Extrude", profile: [{ x: cx - reach, y: cy - reach }, { x: cx + reach, y: cy - reach }, { x: cx + reach, y: cy + reach }, { x: cx - reach, y: cy + reach }], height: t.length, origin: { x: 0, y: 0, z: z0 } }, 0.01)
  const clipped = booleanMesh(ridge, slab, "intersect")
  return booleanMesh(roundBar(cx, cy, rootRadius, z0, z0 + t.length), clipped, "union")
}

/** Volume of the helical ridge alone (Pappus: the profile's area times the path of its centroid), mm3 per turn. For checking a built thread. */
export const ridgeVolumePerTurn = (diameter: number, pitch: number, internal: boolean): number => {
  const s = threadSizes(diameter, pitch, internal)
  const area = ((s.rootWidth + s.crestWidth) / 2) * s.height
  // Centroid of a trapezoid (parallel sides a at the root, b at the crest, height h) measured from the root: h (a + 2b) / (3 (a + b)).
  const centroid = (s.height * (s.rootWidth + 2 * s.crestWidth)) / (3 * (s.rootWidth + s.crestWidth))
  return area * 2 * Math.PI * (s.minor / 2 + centroid)
}
