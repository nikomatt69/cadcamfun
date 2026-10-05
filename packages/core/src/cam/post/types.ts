/** Post-processor contract (spec 04-core-cam.md §4). */
import type { Program } from "../ir.ts"

export type PostId = "generic" | "fanuc" | "grbl" | "linuxcnc" | "haas"

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
  /** Chord tolerance (mm) used when arcs are linearized. */
  readonly tolerance: number
  /** Injected into the header when given; absent by default so output is deterministic. */
  readonly stamp?: string
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

/** What differs between G-code dialects; the emitter is shared. */
export interface Dialect {
  readonly id: PostId
  /** Whether the control has canned drilling cycles. */
  readonly canned: boolean
  /** Arc formats the control accepts (`linearize` is always possible). */
  readonly arcModes: ReadonlyArray<ArcMode>
  /** Unit of `G4 P` and the `P` word of `G82`. */
  readonly dwell: "seconds" | "milliseconds"
  /** Upper-case comments (some controls reject lower case). */
  readonly uppercaseComments: boolean
  /** Lines before everything else, unnumbered (e.g. `%`, `O1000`). */
  readonly begin: (program: Program) => ReadonlyArray<string>
  /** Modal set-up blocks after the unit line. */
  readonly setup: ReadonlyArray<string>
  /** Blocks of a tool change to tool number `n`; `first` is true for the first tool of the program. */
  readonly toolChange: (n: number, first: boolean) => ReadonlyArray<string>
  /** Final program-end block (`M30`, `M2`). */
  readonly end: string
  /** Lines after the end block, unnumbered (e.g. `%`). */
  readonly finish: ReadonlyArray<string>
}
