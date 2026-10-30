/** Post-processor contract (spec 04-core-cam.md §4). */
import type { FiveAxisKinematic } from "../five-axis.ts"
import type { RotaryLayout } from "../indexing.ts"
import type { CycleMove, Program, WorkOffset } from "../ir.ts"
import type { WorkFrame } from "../setup.ts"

export type PostId = "generic" | "fanuc" | "grbl" | "linuxcnc" | "haas" | "siemens" | "heidenhain" | "okuma" | "mazak"

/**
 * Vendor dialects written as thin layers over a base post (`mitsubishi.ts`, `brother.ts`). They are kept out of `PostId` on purpose: that
 * union is listed exhaustively by the API schemas, the machine profile and the desktop post pickers, which own their own lists.
 */
export type VendorPostId = "mitsubishi" | "brother"

export type ArcMode = "ijk" | "radius" | "linearize"

export interface PostOptions {
  /** Decimals for coordinates; fixed, never implicit `toString`. Default 3. */
  readonly decimals: number
  /** Prefix blocks with `N` numbers. */
  readonly lineNumbers?: { readonly start: number; readonly step: number }
  /** Emit `G81/G82/G83/G73` when the dialect has them; otherwise expand cycles. */
  readonly useCannedCycles: boolean
  /** Preferred arc format; unsupported formats fall back to `radius`, then `linearize`. */
  readonly arcMode: ArcMode
  /** Emit the header comment block. */
  readonly header: boolean
  /**
   * Chord tolerance (mm) used when arcs are linearized.
   */
  readonly tolerance: number
  /**
   * `toolId` -> carousel pocket, overriding the emitter's first-use numbering.
   * A tool id that is absent (or maps to a non-positive or non-integer number)
   * keeps first-use numbering, so a partial map cannot collide with an
   * explicit pocket: the emitter skips the numbers already taken.
   * `cam.program.planPrograms` builds a complete map from a setup's tool table.
   */
  readonly toolNumbers?: Readonly<Record<string, number>>
  /**
   * `false` when the program is written in machine coordinates (the control has no tool-centre-point control, or it is not to be
   * used): no tip-control word is written even if the dialect has one. Default: written whenever rotary moves are simultaneous.
   */
  /**
   * Write the control's own fixed cycle where the program marks one (`CycleBegin` .. `CycleEnd`, Heidenhain bore milling 208): the cycle
   * replaces the moves that expand it. Off by default: every post then writes the moves.
   */
  readonly nativeCycles?: boolean
  readonly tcp?: boolean
  /**
   * Raise Z to the highest point the program has reached before a tool change
   * (`M5` / `M9` / `T… M6`). A real changer cannot pull the tool out of the
   * material; off by default so existing output stays byte-identical.
   */
  readonly retractBeforeToolChange?: boolean
  /** Injected into the header when given; absent by default so output is deterministic. */
  readonly stamp?: string
  /**
   * Write the toolpaths that repeat another one translated (the same motion at another place: the holes of a pattern, the
   * copies of a pocket) as one subprogram, called once per copy, when the dialect has them (`Dialect.subprograms`). The
   * subprogram is incremental (`G91`) and starts where the tool stands, so a copy is the same text. Off by default so
   * existing output stays byte-identical.
   */
  readonly subprograms?: boolean
  /**
   * Contour tolerance (mm) of the control's high-speed smoothing (Fanuc AICC `G5.1 Q1`, Haas `G187`, Siemens `CYCLE832`,
   * Heidenhain cycle 32, LinuxCNC `G64 P`), switched on for each operation and off before each tool change and at the end.
   * Ignored on a dialect without it (`Dialect.smoothing`). Absent by default so existing output stays byte-identical.
   */
  readonly smoothing?: number
  /**
   * Feed (mm/min) of a rapid that turns a rotary axis inside a tool-centre-point section, on a control that keeps the tip only on
   * feed moves (`Dialect.tcpLimits.noRapidRotary`, Haas). Default 5000; the control clamps it to its own maximum cutting feed.
   */
  readonly tcpRapidFeed?: number
  /**
   * Tilted work planes (3+2 written with the control's own swivel words), by toolpath id: the toolpath is in the plane's own
   * coordinates (what an ordinary 3-axis operation computes) and the post writes the control's plane word before it
   * (`Dialect.tiltedPlane`: Fanuc `G68.2` + `G53.1`, Siemens `CYCLE800`, Heidenhain `PLANE SPATIAL`) and cancels it before a tool change,
   * before another plane and at the end. A toolpath that is not listed runs in the work offset itself. A post whose control has no such
   * word refuses the program (it would otherwise cut in the wrong place).
   */
  readonly workPlanes?: Readonly<Record<string, TiltedPlane>>
  /** Swivel data of the Siemens machine (`CYCLE800`): required by a Siemens program with `workPlanes`. */
  readonly swivel?: SwivelSettings
  /** Decimals of the plane angles (degrees). Default 4; a Fanuc with IS-B least input increment keeps 3, set it to 3 there. */
  readonly angleDecimals?: number
  /**
   * The five-axis machine the toolpaths with rotary moves were made for (`fiveAxisKinematic`). It says which frame their linear words
   * are in (`tcp: "control"`: part coordinates, `"program"`: machine coordinates) and lets the post write them in the frame the output
   * needs: `tcp` true (default for a `"control"` machine on a dialect that has a tip-control word) keeps the tip in part coordinates under
   * the control's tool-centre-point word; `tcp` false writes machine coordinates and no word. A move that turns the rotary axes is split
   * where the straight machine-axis line would leave the tip path by more than `tolerance`. Absent: the toolpaths are written as they are.
   */
  readonly kinematics?: FiveAxisKinematic
  /**
   * Limit of a rotary axis' speed, degrees/min (needs `kinematics`). A feed move that would turn an axis faster is slowed to the
   * speed that holds the limit, so the tip speed drops instead of the axis being clipped by the control.
   */
  readonly rotaryMaxRate?: number
  /**
   * Inverse-time feed (needs `kinematics`; the dialect's `inverseTime` words, `G93` / `G94`): a simultaneous move is written with `F` =
   * 1 / minutes the move takes at the tool tip, whatever the frame of its words, and `G94` is restored after the section.
   */
  readonly inverseTimeFeed?: boolean
  /** Siemens: the number of the kinematic transformation `TRAORI(n)` (default: the machine's first, a bare `TRAORI`). */
  readonly tcpTransformation?: number
}

/** A work plane tilted against the work offset, as the setup defines it (`WorkFrame`: z is the tool axis, x and y lie in the plane). */
export interface TiltedPlane {
  /** Origin and axes in the coordinates of the program's work offset, millimetres. */
  readonly frame: WorkFrame
  /** Rotary layout of the machine: names the axes the control turns back to 0 when the plane is cancelled (Fanuc). */
  readonly layout?: RotaryLayout
  /** Which of the two rotary solutions the control takes: `1` / `-1` (Siemens `_DIR`, Heidenhain `SEQ+` / `SEQ-`). Absent: the control's own pick. */
  readonly solution?: 1 | -1
}

/** Siemens `CYCLE800` settings that belong to the machine, not to the part. */
export interface SwivelSettings {
  /** Name of the swivel data record (`_TC`), as set up by the machine builder. */
  readonly dataRecord: string
  /** Retraction before swivelling (`_FR`): 0 none, 1 Z axis to its maximum, 2 Z then X / Y to their maximum, 4 Z by `retractDistance`. Default 1. */
  readonly retraction?: 0 | 1 | 2 | 4
  /** Retraction distance for `retraction: 4` (`_FR_I`), mm. Default 100. */
  readonly retractDistance?: number
  /** Status word (`_ST`), as the control's swivel screen writes it; the units digit 1 adds to the active swivel. Default 0. */
  readonly status?: number
}

/** What a dialect needs to write a tilted plane. Numbers are formatted by the writer in output units. */
export interface PlaneCall {
  readonly plane: TiltedPlane
  /** Plane origin in output units, formatted (X, Y, Z). */
  readonly origin: { readonly x: string; readonly y: string; readonly z: string }
  /** Rotation of the plane: columns are the frame axes (row-major 3x3). */
  readonly matrix: readonly [number, number, number, number, number, number, number, number, number]
  /** Formats an angle in degrees. */
  readonly angle: (degrees: number) => string
  /** Formats a coordinate in output units. */
  readonly number: (value: number) => string
  readonly swivel?: SwivelSettings
  /** Number of the tool in the spindle. */
  readonly tool: number
  /** Rotary axes that the plane's layout turns, in machine order (empty when unknown). */
  readonly rotaryAxes: ReadonlyArray<"A" | "B" | "C">
}

/** The control's words for a tilted work plane (spec 72 P4-6). */
export interface TiltedPlaneCodes {
  /** Blocks that put the plane into effect; the control turns the rotary axes. Each string is one block. */
  readonly set: (call: PlaneCall) => ReadonlyArray<string>
  /** Blocks that cancel the plane (and send the rotary axes home where the control needs it). */
  readonly reset: (call: PlaneCall) => ReadonlyArray<string>
}

export const defaultPostOptions: PostOptions = {
  decimals: 3,
  useCannedCycles: true,
  arcMode: "ijk",
  header: true,
  tolerance: 0.01
}

export interface Post {
  readonly id: PostId
  emit(program: Program, options?: Partial<PostOptions>): string
}

/** A post of a vendor dialect (`VendorPostId`): the same `emit` as any post. */
export interface VendorPost {
  readonly id: VendorPostId
  emit(program: Program, options?: Partial<PostOptions>): string
}

/** The blocks that switch tool-centre-point control on and off, for a control that has no tool-length-offset form of it. */
export interface TcpCodes {
  readonly on: (tool: number, transformation?: number) => string
  readonly off: (tool: number) => string
  /** Written at the end of the program when the section is still open (default: `off`). */
  readonly end?: (tool: number) => string
}

/** What differs between G-code dialects; the emitter is shared. */
export interface Dialect {
  readonly id: PostId | VendorPostId
  /** Whether the control has canned drilling cycles. */
  readonly canned: boolean
  /** Klartext: a drilling move is the control's own fixed cycle (`CYCL DEF 200` …, called with `M99`), not an ISO code and not an expansion (`klartext-cycles.ts`). */
  readonly klartextCycles?: boolean
  /** Arc formats the control accepts (`linearize` is always possible). */
  readonly arcModes: ReadonlyArray<ArcMode>
  /** Unit of `G4 P` and the `P` word of `G82`. */
  readonly dwell: "seconds" | "milliseconds"
  /**
   * Whether the control has rotary axes the program may drive (a 4/5-axis
   * machine). A program whose moves carry rotary angles is **rejected** by a
   * dialect without them, rather than losing the angles silently.
   */
  readonly rotary: boolean
  /**
   * How the tool centre point is handed to the control, written once before a simultaneous 5-axis section and cancelled
   * after it. A string is a tool-length-offset code (Haas `G234`, Fanuc `G43.4`): `<code> H<n>` on, `G43 H<n>` off, `G49` if
   * the program ends with it on. `TcpCodes` writes the blocks a control has instead (Siemens `TRAORI` / `TRAFOOF`,
   * Heidenhain `M128` / `M129`). Absent on controls that must be given machine coordinates instead.
   */
  readonly tcp?: string | TcpCodes
  /**
   * What the control's tool-centre-point mode forbids (Haas G234): `rotaryZeroAtOn` — the rotary axes must stand at 0 when it is
   * switched on (a program that breaks it is refused); `noRapidRotary` — the tool tip is not kept on a rapid that turns a rotary
   * axis, so such a rapid is written as a feed move (`G1` at `PostOptions.tcpRapidFeed`), which keeps the tip on the same line.
   */
  readonly tcpLimits?: { readonly rotaryZeroAtOn?: boolean; readonly noRapidRotary?: boolean }
  /**
   * Rigid tapping (`G84` with the feed = pitch x speed). Absent on controls without it: a tapping cycle is then refused, since no
   * expansion into plain moves reverses the spindle. `prefix` is the block the control needs before the cycle (Fanuc `M29 S<rpm>`).
   */
  readonly rigidTap?: { readonly prefix?: (rpm: number) => string }
  /**
   * Arcs the control cannot take as one block (default: both allowed). `helical: false` writes an arc that changes Z as line
   * segments within `tolerance`; `fullCircle: false` writes a full circle as two half circles.
   */
  readonly arcLimits?: { readonly helical?: boolean; readonly fullCircle?: boolean }
  /**
   * High-speed contour smoothing (`PostOptions.smoothing`): the blocks that switch it on with a tolerance in program units,
   * and those that switch it off (empty when the control keeps it until the program ends).
   */
  readonly smoothing?: { readonly on: (tolerance: string) => ReadonlyArray<string>; readonly off: ReadonlyArray<string> }
  /** The block that selects the program's work offset (default the offset's own code, `G54`; Okuma `G15 H1`). */
  readonly workOffset?: (offset: WorkOffset) => string
  /** Canned-cycle codes that differ from the ISO ones (Mazak synchronous tapping `G84.2`). */
  readonly cycleCodes?: Partial<Record<CycleMove["cycle"], string>>
  /**
   * The control has no mist coolant word (`M7`): mist is written as flood (`M8`) with a comment saying so. GRBL builds `M7` only
   * with the `ENABLE_M7` compile option.
   */
  readonly noMist?: boolean
  /** Upper-case comments (some controls reject lower case). */
  readonly uppercaseComments: boolean
  /** How a comment line is written: `(text)` (default) or `;text` (Siemens). */
  readonly commentStyle?: "paren" | "semicolon"
  /** The modal code that selects the unit, written first in the set-up (default `G21` / `G20`; Siemens `G71` / `G70`). */
  readonly unitCodes?: { readonly mm: string; readonly inch: string }
  /** Address of a dwell time (default `P`; Siemens `G4 F<seconds>`). */
  readonly dwellWord?: string
  /** Lines before everything else, unnumbered (e.g. `%`, `O1000`). */
  readonly begin: (program: Program) => ReadonlyArray<string>
  /** Modal set-up blocks after the unit line. */
  readonly setup: ReadonlyArray<string>
  /** Blocks of a tool change to tool number `n`; `first` is true for the first tool of the program. */
  readonly toolChange: (n: number, first: boolean) => ReadonlyArray<string>
  /**
   * Subprograms the control runs (`M98 P<n>` … `M99`), written after the end of the main program. Absent on controls
   * without them: the `subprograms` option is then ignored.
   */
  readonly subprograms?: {
    /** Number of the first subprogram: the main program's number plus one. */
    readonly first: (program: Program) => number
    /** Highest program number the control accepts. */
    readonly last: number
    /** Block that calls subprogram `n`. */
    readonly call: (n: number) => string
    /** Line that opens subprogram `n` (`O1001`). */
    readonly begin: (n: number) => string
    /** Block that returns to the caller (`M99`). */
    readonly end: string
  }
  /** The control's tilted-plane words; absent: a program with `workPlanes` is refused. */
  readonly tiltedPlane?: TiltedPlaneCodes
  /** Inverse-time feed mode (`PostOptions.inverseTimeFeed`): the words that switch it on and back to feed per minute. */
  readonly inverseTime?: { readonly on: string; readonly off: string }
  /** Final program-end block (`M30`, `M2`). */
  readonly end: string
  /** Lines after the end block, unnumbered (e.g. `%`). */
  readonly finish: ReadonlyArray<string>
}
