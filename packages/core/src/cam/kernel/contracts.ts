/**
 * Records of the CAM kernel (spec 29 §3-4): the manufacturing job it takes, the operations it runs and the artifact it
 * returns. Everything is plain readonly data in millimetres, CAD world coordinates for the inputs and work coordinates
 * (zero at the chosen origin on the stock top) for the toolpaths and the NC.
 */
import type { SetupOrientation } from "../setup.ts"
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { Coolant, Program, Toolpath, WorkOffset } from "../ir.ts"
import type { PostId, PostOptions } from "../post/types.ts"
import type { Cutter } from "./cutters.ts"
import type { CutClass, CuttingData, MachineLimits } from "./cutting-data.ts"

export const KERNEL_SCHEMA_VERSION = 1

/** Where the part comes from: the CAD elements as the editor stores them, or triangle meshes (history bodies). */
export type PartSource =
  | { readonly kind: "elements"; readonly elements: ReadonlyArray<Readonly<Record<string, unknown>>> }
  | { readonly kind: "meshes"; readonly meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }> }

export interface StockBox {
  readonly min: Vec3
  readonly max: Vec3
}

export type WorkOrigin = "stock-center" | "stock-corner"

export interface KernelMachine {
  readonly id: string
  readonly name: string
  /** What the machine is: a milling centre (`mill`) or a turning / mill-turn centre (`lathe`). */
  readonly kind: "mill" | "lathe"
  readonly limits: MachineLimits
  readonly post: PostId
  /** Published catalogue data and explicit setup assumptions; a stroke is not a work-coordinate limit. */
  readonly reference?: { readonly controller: string; readonly source: string; readonly stroke?: { readonly x: number; readonly y: number; readonly z: number }; readonly assumptions: ReadonlyArray<string> }
  /** Rapid traverse, mm/min (cycle time). */
  readonly rapidFeed?: number
  /** Seconds a tool change takes (cycle time). */
  readonly toolChangeSeconds?: number
  /** Axis travel in work coordinates; when present every move is checked against it. */
  readonly travel?: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ: number; readonly maxZ: number }
  /**
   * The table the spindle must clear: its footprint (mm) and the gap between the bottom of the stock and the table top, the
   * parallels' height. When present, every NC move is checked for the holder and shank against the table (`machine-clearance`).
   */
  readonly table?: { readonly length: number; readonly width: number; readonly gap: number }
  /**
   * The work offsets the control has, and the one the machine starts in. A program that names an offset the machine does
   * not have is refused (`machine-limits`): the offset is where the part sits, and an unknown one is a wrong datum.
   */
  readonly workOffsets?: { readonly available: ReadonlyArray<WorkOffset>; readonly default?: WorkOffset }
  /**
   * The coolant the machine can deliver. A cut that asks for a mode the machine does not have is planned with the mode it
   * does have, and the substitution is reported (`machine-limits`).
   */
  readonly coolant?: { readonly modes: ReadonlyArray<Coolant> }
  /**
   * How accurately the machine holds a position. The positioning accuracy is a term of the tolerance budget: the deviation
   * the program can be promised includes what the machine itself adds.
   */
  readonly accuracy?: { readonly positioningMm?: number; readonly repeatabilityMm?: number; readonly runoutMm?: number }
  /** The tool magazine: how many tools it holds. A program needing more tools than that is refused. */
  readonly toolCapacity?: number
  /**
   * The trunnion table that turns the part for five-axis operations. `pivot` is the centre of rotation of the table in the work
   * frame, mm: a property of the machine's trunnion (its height over the table and its position), so it is given here and not
   * derived from the stock. `layout` is C about Z with tilt A about X or B about Y; `tilt` and `rotation` are the ranges in degrees.
   */
  readonly fiveAxis?: {
    readonly layout: "table-AC" | "table-BC"
    readonly pivot: { readonly x: number; readonly y: number; readonly z: number }
    readonly tilt: readonly [number, number]
    readonly rotation?: readonly [number, number]
  }
  /**
   * What a turning centre holds and turns: the bar it takes, the chuck, the B head that tilts the milling spindle and
   * the C spindle that positions the workpiece. Absent on a plain 2-axis lathe (no B head).
   */
  readonly turning?: {
    /** Largest bar the chuck takes, mm. */
    readonly maxBarDiameter: number
    /** Longest bar the machine takes, mm. */
    readonly maxBarLength: number
    readonly chuckDiameter: number
    /** B head range, degrees; absent on a lathe without a tilting head. */
    readonly b?: readonly [number, number]
    /** C spindle indexing range, degrees. */
    readonly c?: readonly [number, number]
    /** The C spindle turns on without end (a continuous axis, not a 360° index). */
    readonly continuousC?: boolean
    /** Y travel of a mill-turn centre, mm. */
    readonly yTravel?: number
    readonly turret?: "rear" | "front"
  }
}

/** Process overrides an operation may carry; anything absent comes from the cutting data. */
export interface ProcessOverrides {
  readonly rpm?: number
  readonly feed?: number
  readonly plungeFeed?: number
  /** Axial depth per pass, mm. */
  readonly stepdown?: number
  /** Radial step, % of the cutter diameter. */
  readonly stepover?: number
  readonly coolant?: Coolant
  /** Radial engagement the strategy really takes, mm, when the planner knows it (a last side pass): the cutting data is computed for it. */
  readonly radialEngagement?: number
}

interface OperationBase extends ProcessOverrides {
  readonly id: string
  readonly name?: string
  /** Cutter id in the job's library. */
  readonly tool: string
}

/** A closed planar region in CAD world XY: a boundary and the islands inside it. */
export interface RegionSpec {
  readonly boundary: ReadonlyArray<Vec2>
  readonly islands?: ReadonlyArray<ReadonlyArray<Vec2>>
}

export type OperationSpec =
  | (OperationBase & { readonly strategy: "face"; readonly bottom: number })
  | (OperationBase & { readonly strategy: "adaptive"; readonly region: RegionSpec; readonly top: number; readonly bottom: number; readonly allowance?: number })
  | (OperationBase & { readonly strategy: "pocket"; readonly region: RegionSpec; readonly top: number; readonly bottom: number; readonly allowance?: number; readonly finish?: boolean })
  | (OperationBase & { readonly strategy: "profile"; readonly loop: ReadonlyArray<Vec2>; readonly side: "outside" | "inside"; readonly top: number; readonly bottom: number; readonly allowance?: number; readonly finish?: boolean })
  | (OperationBase & { readonly strategy: "bore"; readonly center: Vec2; readonly diameter: number; readonly top: number; readonly bottom: number; readonly allowance?: number })
  /**
   * Holes at points: drilled (peck / chip break from the cutting data), spotted, rigid-tapped with a `tap` cutter (the feed is its
   * pitch x speed; the post needs G84) or reamed with a `reamer` (fed in and out). `bottom` is the tip's lowest point.
   */
  | (OperationBase & { readonly strategy: "drill"; readonly points: ReadonlyArray<Vec2>; readonly top: number; readonly bottom: number; readonly cut?: "drill" | "spot" | "tap" | "ream" })
  | (OperationBase & { readonly strategy: "thread"; readonly center: Vec2; readonly diameter: number; readonly pitch: number; readonly internal: boolean; readonly top: number; readonly length: number; readonly rightHand?: boolean })
  | (OperationBase & { readonly strategy: "engrave"; readonly paths: ReadonlyArray<{ readonly points: ReadonlyArray<Vec2>; readonly closed: boolean }>; readonly top: number; readonly depth: number })
  | (OperationBase & { readonly strategy: "chamfer"; readonly loops: ReadonlyArray<{ readonly points: ReadonlyArray<Vec2>; readonly side: "outside" | "inside" }>; readonly top: number; readonly width: number; readonly tipOffset?: number })
  /**
   * 3D strategies over the part's surface. Finishing: `parallel` raster, `waterline` constant Z, `steep-shallow` (waterline on walls,
   * raster on flats), `scallop` (constant 3D stepover), `spiral` / `radial` about `center`, `flat` (horizontal faces at their height).
   */
  | (OperationBase & { readonly strategy: "surface"; readonly mode: SurfaceMode; readonly slopeAngle?: number; readonly allowance?: number; readonly scallop?: number; readonly clearing?: "contour" | "adaptive"; readonly angle?: number; readonly restFrom?: string; readonly center?: Vec2 })
  /**
   * Simultaneous five-axis finishing on a trunnion table: the tool leans off the surface normal (`lead` towards the travel, `tilt`
   * sideways) and the table turns with the linear axes. The moves carry A/B/C words; `top` is the highest the tool may be.
   */
  | (OperationBase & { readonly strategy: "multiaxis"; readonly top: number; readonly stepover: number; readonly angle?: number; readonly toolAxis?: "normal" | "lead"; readonly lead?: number; readonly tilt?: number })

export type Strategy = OperationSpec["strategy"]

export const SURFACE_MODES = ["roughing", "rest", "parallel", "waterline", "steep-shallow", "scallop", "spiral", "radial", "flat"] as const
export type SurfaceMode = typeof SURFACE_MODES[number]

export interface QualityRequirement {
  /** Wall / floor stock the roughing leaves for finishing, mm (default: the material's). */
  readonly finishAllowance?: number
  /** Cusp of ball-nose finishing, mm (default 0.01). */
  readonly scallop?: number
  /** Chord tolerance of the paths, mm (default 0.01). */
  readonly tolerance?: number
  /** Replay cell size, mm (default: adaptive to the stock, at most 0.5). */
  readonly resolution?: number
  /** Break the top edges of outlines, pockets and holes with a chamfer of this width, mm (the planner adds 2D chamfer operations). */
  readonly deburr?: number
}

export interface ManufacturingJob {
  readonly schemaVersion: typeof KERNEL_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  /** Material id, name, EN/AISI number or legacy family (`materials.ts` `findMaterial`). */
  readonly material: string
  readonly part: PartSource
  /** Stock block in CAD world coordinates; default: the part bounds plus 2 mm on the sides and 1 mm on top. */
  readonly stock?: StockBox
  /** Manual refixture: CAD direction facing the spindle; operations use the oriented setup coordinates. */
  readonly setupOrientation?: SetupOrientation
  readonly origin?: WorkOrigin
  readonly workOffset?: WorkOffset
  /** Cutter library; default `DEFAULT_CUTTERS`. */
  readonly tools?: ReadonlyArray<Cutter>
  readonly machine?: KernelMachine
  /** Operations in machining order, in oriented setup coordinates when specified; otherwise CAD world coordinates. Planned from the part when absent. */
  readonly operations?: ReadonlyArray<OperationSpec>
  readonly quality?: QualityRequirement
  readonly post?: { readonly options?: Partial<PostOptions> }
}

// ---------------------------------------------------------------- results

export type CamIssueTag =
  | "InvalidInput"
  | "UnknownMaterial"
  | "UnknownTool"
  | "NoSuitableTool"
  | "UnsupportedCapability"
  | "GenerationFailed"
  | "EmptyToolpath"
  | "MachineLimit"
  | "RapidInStock"
  | "HolderCollision"
  | "Gouge"
  | "RemainingStock"
  | "ReplayMismatch"
  | "Cancelled"

export interface CamIssue {
  readonly tag: CamIssueTag
  readonly severity: "error" | "warning"
  readonly stage: "prepare" | "plan" | "cutting-data" | "generate" | "post" | "replay" | "evidence"
  readonly operationId?: string
  readonly message: string
  /** NC line (1-based) of the finding, when it comes from the replay. */
  readonly line?: number
  readonly point?: Vec3
}

export type ClaimStatus = "passed" | "failed" | "unsupported" | "unresolved"

export interface Claim {
  readonly id: "cutting-data" | "machine-limits" | "operations-complete" | "no-rapid-in-stock" | "holder-clearance" | "no-gouge" | "material-removed" | "nc-replay" | "machine-travel" | "machine-clearance" | "setup-workholding" | "part-coverage"
  readonly status: ClaimStatus
  readonly detail: string
}

export type ReleaseLevel = "blocked" | "preview" | "verified-program"

export interface OperationOutcome {
  readonly id: string
  readonly name: string
  readonly strategy: Strategy
  readonly toolId: string
  readonly cut: CutClass
  readonly status: "ok" | "failed"
  readonly cutting?: CuttingData
  /** The parameters handed to the strategy, after cutting data and overrides. */
  readonly parameters: Readonly<Record<string, unknown>>
  /** Which parameters came from the request rather than from the cutting data. */
  readonly overridden: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  /** Material top the operation started from, work Z (stock-aware entry). */
  readonly startZ?: number
  readonly cutLength: number
  readonly timeSeconds: number
  /** Volume removed by this operation in the final replay of the emitted NC, mm³. */
  readonly removedVolume: number
}

export interface StockSummary {
  readonly initialVolume: number
  readonly finalVolume: number
  readonly partVolume: number
  /** Material above the part (plus allowance) that the program leaves, mm³ and its thickest point. */
  readonly remainingVolume: number
  readonly maxRemaining: number
  readonly cellSize: number
  /**
   * Removal by moves with the table turned, bracketed on the voxel stock (the height field above does not cover them).
   * `removedLower..removedUpper` and `remainingLower..remainingUpper` are mm³ on the raw stock; the true value lies inside.
   * Absent when the program has no turned move.
   */
  readonly fiveAxis?: {
    readonly voxelMm: number
    readonly removedLower: number
    readonly removedUpper: number
    readonly remainingLower: number
    readonly remainingUpper: number
  }
}

/** One term of the tolerance budget: what it bounds, in mm, and where the bound comes from. */
export interface ToleranceTerm {
  readonly id: "source-tessellation" | "part-model" | "path" | "nc-rounding" | "stock-replay" | "machine-positioning"
  readonly mm: number
  readonly basis: string
}

/**
 * The deviation the program can be promised (spec 29 §3): the terms add, worst case, because nothing here shows they cancel.
 * `unbounded` names a source of error with no known bound (an imported mesh of unknown accuracy): the promise then does not hold.
 * Informational: it does not change the release level, which rests on the replay claims.
 */
export interface ToleranceBudget {
  readonly requested: number
  readonly terms: ReadonlyArray<ToleranceTerm>
  readonly achieved: number
  readonly unbounded: ReadonlyArray<string>
  readonly met: boolean
}

export interface CamArtifact {
  readonly schemaVersion: typeof KERNEL_SCHEMA_VERSION
  readonly jobId: string
  readonly material: { readonly id: string; readonly name: string; readonly iso: string }
  readonly machine: { readonly id: string; readonly name: string; readonly post: PostId }
  /** Manual setup orientation; omitted for legacy artifacts. */
  readonly setupOrientation?: SetupOrientation
  /** Work zero in oriented setup coordinates (toolpaths are relative to it). */
  readonly origin: Vec3
  /** Resolved raw stock in oriented setup coordinates; subtract `origin` to display it alongside the work-coordinate NC. */
  readonly stockBounds: StockBox
  readonly operations: ReadonlyArray<OperationOutcome>
  readonly program: Program
  readonly tools: ReadonlyArray<Cutter & { readonly number: number }>
  readonly nc: string
  readonly claims: ReadonlyArray<Claim>
  readonly issues: ReadonlyArray<CamIssue>
  readonly release: ReleaseLevel
  readonly stock: StockSummary
  readonly cycleTimeSeconds: number
  readonly identity: { readonly job: string; readonly part: string; readonly nc: string; readonly algorithm: string }
  /** Notes of the planner (features it could not machine and why). */
  readonly notes: ReadonlyArray<string>
  readonly tolerance?: ToleranceBudget
}

export type CamResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "failed"; readonly issues: ReadonlyArray<CamIssue> }

export type { Toolpath }
