/** Post-processor contract (spec 04-core-cam.md §4). */
import type { CycleMove, Program, WorkOffset } from "../ir.ts"

export type PostId = "generic" | "fanuc" | "grbl" | "linuxcnc" | "haas" | "siemens" | "heidenhain" | "okuma" | "mazak"

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

/** The blocks that switch tool-centre-point control on and off, for a control that has no tool-length-offset form of it. */
export interface TcpCodes {
  readonly on: (tool: number) => string
  readonly off: (tool: number) => string
  /** Written at the end of the program when the section is still open (default: `off`). */
  readonly end?: (tool: number) => string
}

/** What differs between G-code dialects; the emitter is shared. */
export interface Dialect {
  readonly id: PostId
  /** Whether the control has canned drilling cycles. */
  readonly canned: boolean
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
  /** Final program-end block (`M30`, `M2`). */
  readonly end: string
  /** Lines after the end block, unnumbered (e.g. `%`). */
  readonly finish: ReadonlyArray<string>
}
