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
import type { MultiaxisStrategy } from "../operations/multiaxis.ts"
import type { SwarfWall } from "../operations/swarf.ts"

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

/**
 * What a filament printer is (the fields a slicer needs): the plate, the build height, the nozzle and filament it takes, how hot
 * and how fast it goes, and the dialect of its firmware. A printer has no spindle: its `limits` carry the speed ceiling as `maxFeed`
 * (mm/min) and a spindle of 0 rpm.
 */
export interface KernelPrinter {
  readonly bed: { readonly width: number; readonly depth: number; readonly origin: "corner" | "center" }
  /** Tallest print, mm. */
  readonly buildHeight: number
  readonly nozzle: { readonly diameter: number; readonly maxTemperature: number }
  readonly filamentDiameter: number
  readonly maxBedTemperature: number
  /** Highest print speed, mm/s. */
  readonly maxSpeed: number
  readonly kinematics: "cartesian" | "corexy" | "bed-slinger" | "delta"
  readonly flavor: "marlin" | "klipper" | "reprap"
  /** A bowden tube needs a longer retraction than a direct drive. */
  readonly extruder: "direct" | "bowden"
}

export interface KernelMachine {
  readonly id: string
  readonly name: string
  /** What the machine is: a milling centre (`mill`), a turning / mill-turn centre (`lathe`) or a filament printer (`printer`). */
  readonly kind: "mill" | "lathe" | "printer"
  /** Present on a `printer`. */
  readonly printer?: KernelPrinter
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

/**
 * What a hole-making operation does beyond the plain cycle (`operations/hole-cycles.ts`). Carried by a `drill` operation; an
 * operation without it is the ordinary spot / drill / tap / ream cycle. A host that does not know a `cycle` must refuse the
 * operation, never run it as a plain drill.
 */
export type HoleCycle =
  /** A countersink cutter's cone to the finished `diameter` at the surface: `bottom` is `top` less `countersinkDepth(tool, diameter)`. */
  | { readonly kind: "countersink"; readonly diameter: number }
  /**
   * Deep-hole / gun-drill style pecking: first peck `peck`, each next one `peckReduction` shorter down to `minPeck`; `retract`
   * `full` goes back to the R plane after every peck, `chip-break` lifts `chipBreakRetract` mm and does a full retract every
   * `fullRetractEvery` pecks (0 = never). `dwell` seconds at the bottom.
   */
  | { readonly kind: "deep"; readonly peck: number; readonly retract: "full" | "chip-break"; readonly peckReduction?: number; readonly minPeck?: number; readonly chipBreakRetract?: number; readonly fullRetractEvery?: number; readonly dwell?: number }
  /**
   * Back-boring from the far side: the bar goes through the Ø`pilotDiameter` hole, the cutter is brought to the bore axis below
   * the face at Z `face` (the setup's coordinates, like `top` and `bottom`) and bores up `top - face` mm to Ø`diameter`; `bottom` is the lowest the tool tip goes.
   */
  | { readonly kind: "back-bore"; readonly diameter: number; readonly pilotDiameter: number; readonly face: number }
  /**
   * Drilling along other axes than Z on an indexed (3+2) machine: each site is entered at `entry` (CAD world mm) and goes
   * `depth` mm along the unit `direction` into the material. `peck` as the plain cycle.
   */
  | { readonly kind: "tilted"; readonly sites: ReadonlyArray<{ readonly entry: Vec3; readonly direction: Vec3; readonly depth: number }>; readonly peck?: number; readonly chipBreak?: boolean }

export type OperationSpec =
  | (OperationBase & { readonly strategy: "face"; readonly bottom: number })
  | (OperationBase & { readonly strategy: "adaptive"; readonly region: RegionSpec; readonly top: number; readonly bottom: number; readonly allowance?: number })
  | (OperationBase & { readonly strategy: "pocket"; readonly region: RegionSpec; readonly top: number; readonly bottom: number; readonly allowance?: number; readonly finish?: boolean })
  /**
   * `tabs` hold a through-cut part: material left standing at `position` (0..1 along the tool-centre path), `width` mm long
   * and `height` mm above `bottom`. `leadIn` is how the cutter enters and leaves the wall (default `arc`, `leadRadius` mm).
   */
  | (OperationBase & { readonly strategy: "profile"; readonly loop: ReadonlyArray<Vec2>; readonly side: "outside" | "inside"; readonly top: number; readonly bottom: number; readonly allowance?: number; readonly finish?: boolean; readonly within?: RegionSpec; readonly tabs?: ReadonlyArray<ProfileTab>; readonly leadIn?: ProfileLeadIn; readonly leadRadius?: number })
  | (OperationBase & { readonly strategy: "bore"; readonly center: Vec2; readonly diameter: number; readonly top: number; readonly bottom: number; readonly allowance?: number })
  /**
   * Holes at points: drilled (peck / chip break from the cutting data), spotted, rigid-tapped with a `tap` cutter (the feed is its
   * pitch x speed; the post needs G84) or reamed with a `reamer` (fed in and out). `bottom` is the tip's lowest point.
   */
  | (OperationBase & { readonly strategy: "drill"; readonly points: ReadonlyArray<Vec2>; readonly top: number; readonly bottom: number; readonly cut?: "drill" | "spot" | "tap" | "ream"; readonly cycle?: HoleCycle })
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
  | (OperationBase & { readonly strategy: "multiaxis"; readonly mode?: MultiaxisStrategy; readonly top: number; readonly stepover: number; readonly angle?: number; readonly toolAxis?: "normal" | "lead"; readonly lead?: number; readonly tilt?: number; readonly walls?: ReadonlyArray<SwarfWall>; readonly near?: ReadonlyArray<Vec3> })

export type Strategy = OperationSpec["strategy"]

/** Material a profile leaves standing to hold a through-cut part (`ProfileParams.tabs`). */
export interface ProfileTab {
  /** 0..1 along the tool-centre path. */
  readonly position: number
  /** Length of the material left standing along the wall, mm (the cutter is lifted over a window one cutter diameter longer). */
  readonly width: number
  /** Height above the operation's `bottom`, mm. */
  readonly height: number
}

export type ProfileLeadIn = "direct" | "arc" | "ramp" | "helix"
export const PROFILE_LEAD_INS = ["direct", "arc", "ramp", "helix"] as const

/** Tabs the planner puts on every outline it cuts through the full stock height: `count` evenly spaced along the path. */
export interface TabRequirement {
  readonly count: number
  readonly width: number
  readonly height: number
}

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
  /** Hold the outlines the program cuts through the full stock height with tabs (spec 69 A1); without it the plan only says so in a note. */
  readonly tabs?: TabRequirement
}

/**
 * Hole and feature breadth the planner may use (spec 72 P2-5), all off unless asked. The kernel runs the hole cycles it plans
 * (`drill` with `cycle`), so turning these on is safe here; every decision comes back in the artifact notes with the rule that made it.
 */
export interface JobBreadth {
  /** Countersinks with a countersink cutter, peck-drilled deep holes and back-bores from the far side. */
  readonly holeCycles?: boolean
  /** Holes along other axes are drilled along their own axis when the machine's rotaries reach them (needs a five-axis machine). */
  readonly tilted?: boolean
  /** Slots, steps, grooves and chamfer / fillet bands recognised on the exact solid (needs `elements` that build one, upright setup). */
  readonly namedFeatures?: boolean
}

/**
 * How a printer job is sliced; anything absent comes from the filament (temperatures, fan) and the printer (speed, nozzle, plate).
 * Lengths in mm, speeds in mm/s, temperatures in degrees C.
 */
export interface PrintRequirement {
  readonly layerHeight?: number
  readonly firstLayerHeight?: number
  readonly walls?: number
  readonly topLayers?: number
  readonly bottomLayers?: number
  /** Share of the inside that is filled, %. */
  readonly infillDensity?: number
  readonly infillPattern?: "lines" | "grid" | "triangles" | "honeycomb" | "gyroid" | "concentric"
  readonly supports?: "none" | "buildplate" | "everywhere"
  /** Overhang angle from vertical beyond which a surface is supported, degrees. */
  readonly supportAngle?: number
  readonly adhesion?: "none" | "skirt" | "brim" | "raft"
  readonly brimWidth?: number
  readonly printSpeed?: number
  readonly nozzleTemperature?: number
  readonly bedTemperature?: number
  /** Part cooling, % (0 = off). */
  readonly fan?: number
  /** One spiral wall, no infill. */
  readonly vase?: boolean
  /** `auto` lays the part on the face that needs the least support. */
  readonly orientation?: "as-designed" | "auto"
  readonly seam?: "nearest" | "aligned" | "random"
  readonly retractionDistance?: number
  readonly zHop?: number
  /** Extrusion multiplier, %. */
  readonly flow?: number
  readonly relativeExtrusion?: boolean
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
  readonly breadth?: JobBreadth
  /** `definition`: a post definition (`post/definition.ts`) that writes the NC instead of the machine's built-in post; a bad one fails the job before planning. */
  readonly post?: { readonly options?: Partial<PostOptions>; readonly definition?: unknown }
  /** How a printer job is sliced (only read when the machine is a `printer`). */
  readonly print?: PrintRequirement
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
  readonly id: "bed-fit" | "heated-start" | "layers-rise" | "wall-coverage" | "skin-coverage" | "no-spill" | "filament" | "cutting-data" | "machine-limits" | "operations-complete" | "no-rapid-in-stock" | "holder-clearance" | "no-gouge" | "material-removed" | "nc-replay" | "machine-travel" | "machine-clearance" | "setup-workholding" | "part-coverage"
  readonly status: ClaimStatus
  readonly detail: string
}

export type ReleaseLevel = "blocked" | "preview" | "verified-program"

export interface OperationOutcome {
  readonly id: string
  readonly name: string
  readonly strategy: Strategy | "print"
  readonly toolId: string
  readonly cut: CutClass | "print"
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
   * The voxel stock is seeded with the removal the three-axis operations left, so these volumes are against the stock the
   * rotary operation actually ran on (the raw box less the predecessor's removal), not against the raw box.
   * `removedLower..removedUpper` and `remainingLower..remainingUpper` are mm³ on that stock; the true value lies inside.
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

/** What the slicer measured on a printer program and the checks of that program against the part. */
export interface PrintReport {
  readonly dialect: "marlin" | "klipper" | "reprap"
  readonly filament: { readonly material: string; readonly densityGcm3: number; readonly diameter: number }
  readonly nozzle: { readonly diameter: number; readonly temperature: number; readonly bedTemperature: number }
  readonly layers: number
  readonly layerHeight: number
  /** Filament pushed through the nozzle, mm, and its mass, g. */
  readonly filamentMm: number
  readonly filamentGrams: number
  readonly timeSeconds: number
  readonly travelMm: number
  readonly retractions: number
  /** Bead length by feature (wall-outer, wall-inner, skin, infill, bridge, support, ...), mm. */
  readonly lengthByKind: Readonly<Record<string, number>>
  /** The size of the printed part, mm. */
  readonly size: { readonly x: number; readonly y: number; readonly z: number }
  /** How the part was turned on the plate. */
  readonly orientation: string
  readonly settings: PrintRequirement
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
  /** Present when the machine is a printer: what was printed and how it was measured. */
  readonly print?: PrintReport
}

export type CamResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "failed"; readonly issues: ReadonlyArray<CamIssue> }

export type { Toolpath }
