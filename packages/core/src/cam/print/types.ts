/** Shared records of the print slicer. */
import type { Vec2 } from "../../cad/vec.ts"

export type PathKind =
  | "wall-outer"
  | "wall-inner"
  | "skin"
  | "infill"
  | "bridge"
  | "support"
  | "support-interface"
  | "skirt"
  | "brim"
  | "raft"
  | "vase"

/** One continuous extruding path of a layer. A closed loop repeats its first point at the end. */
export interface Extrusion {
  readonly kind: PathKind
  readonly points: ReadonlyArray<Vec2>
  /** Per-point heights for a path that climbs while it prints (spiral vase); otherwise the layer's. */
  readonly zs?: ReadonlyArray<number>
  /** Bead width relative to the profile's extrusion width (the raft base is printed wide). */
  readonly widthScale?: number
}

export interface PlannedLayer {
  readonly index: number
  /** Z of the top of the layer, mm. */
  readonly z: number
  /** Thickness of the layer, mm. */
  readonly height: number
  readonly paths: ReadonlyArray<Extrusion>
}

export interface PrintStats {
  readonly layers: number
  readonly filamentMm: number
  readonly filamentGrams: number
  /** Time with the look-ahead planner of `program.ts` (acceleration and junction jerk) over the written program. */
  readonly timeSeconds: number
  /** The quick estimate of the emitter (length over feed plus a ramp per path), kept to show how far apart the two models are. */
  readonly pathTimeSeconds?: number
  readonly travelMm: number
  readonly retractions: number
  /** Bead length by kind, mm. */
  readonly lengthByKind: Readonly<Partial<Record<PathKind, number>>>
  /** Dimensions of what is printed (the part, not the adhesion), mm. */
  readonly size: { readonly x: number; readonly y: number; readonly z: number }
}
