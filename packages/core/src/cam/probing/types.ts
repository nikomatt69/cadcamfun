/**
 * The records of probing (spec 73 §5.6-5.10): the cycles a probe runs, what is done with their results, and what a simulated run
 * returns. Millimetres and radians, work coordinates of the cycle's offset (Z up, the tool axis); the wire carries degrees and the
 * schemas in `kernel/schema.ts` convert.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { Expr } from "../macro.ts"
import type { Move } from "../ir.ts"
import type { OffsetAxis, OffsetEntry, UpdatePolicy, WorkOffsetRef } from "../work-offset.ts"
import type { WorkFrame } from "../setup.ts"
import type { ProbeDevice, ToolSetter } from "./device.ts"

// ---------------------------------------------------------------- cycles

/** The artefact a stylus is calibrated on. */
export type CalibrationArtefact =
  | { readonly kind: "ring"; readonly centre: Vec2; readonly diameter: number; readonly depth: number; readonly top?: number }
  | { readonly kind: "sphere"; readonly centre: Vec3; readonly diameter: number }
  | { readonly kind: "height"; readonly at: Vec2; readonly z: number }

/**
 * One probing cycle. `depth` is how far below `top` (default 0) a side touch meets the wall: the ball's equator is there and the
 * tip a ball radius lower. Angles are radians in the XY plane from +X.
 */
export type ProbeCycle =
  | { readonly kind: "z-surface"; readonly at: Vec2; readonly expectedZ: number }
  /** A side face: `at` is the nominal point on it (z = the touch height), `normal` its outward unit normal in XY; the probe touches against the normal. */
  | { readonly kind: "edge"; readonly at: Vec3; readonly normal: Vec2 }
  /**
   * The corner of two faces, one facing X and one facing Y. `xSense` / `ySense` are the directions the touches move (+1 = +X / +Y).
   * `inside` is a pocket's corner, else a block's. Each face is touched `inset` from the corner (default 5 + the stylus radius), twice
   * per face when `touchesPerEdge` is 2 (the second `inset` further on), which also measures the rotation.
   */
  | { readonly kind: "corner"; readonly corner: Vec2; readonly inside: boolean; readonly xSense: 1 | -1; readonly ySense: 1 | -1; readonly depth: number; readonly top?: number; readonly inset?: number; readonly touchesPerEdge?: 1 | 2 }
  /** A slot (`pocket`, touched from inside) or a rib (`web`, from outside) of nominal `width` across `angle`. */
  | { readonly kind: "web" | "pocket"; readonly centre: Vec2; readonly width: number; readonly angle: number; readonly depth: number; readonly top?: number }
  | { readonly kind: "rectangle"; readonly inside: boolean; readonly centre: Vec2; readonly size: Vec2; readonly depth: number; readonly top?: number }
  /** A bore (from inside) or a boss (from outside): four touches with re-centring, or one touch per angle of `angles` (3 or more). */
  | { readonly kind: "bore" | "boss"; readonly centre: Vec2; readonly diameter: number; readonly depth: number; readonly angles?: ReadonlyArray<number>; readonly top?: number }
  /** The angle of a straight face: two touches `pitch` apart from `start` along `along`, against the face's outward `normal`. */
  | { readonly kind: "edge-angle"; readonly start: Vec2; readonly along: Vec2; readonly pitch: number; readonly normal: Vec2; readonly depth: number; readonly top?: number }
  /** A face touched down at three or more points: height, tilt and flatness. */
  | { readonly kind: "plane"; readonly points: ReadonlyArray<Vec2>; readonly expectedZ: number }
  /** A sphere (a calibration ball): four touches at the equator and one on top. */
  | { readonly kind: "sphere"; readonly centre: Vec3; readonly diameter: number; readonly touches?: 5 | 9 }
  | { readonly kind: "tool-length" | "tool-radius" | "broken-tool"; readonly tool: number; readonly nominalLength?: number; readonly nominalRadius?: number }
  | { readonly kind: "stylus-calibrate"; readonly artefact: CalibrationArtefact; readonly directions?: 4 | 8 | 16 }
  /** A rotary axis' pivot and direction from a sphere measured at several `angles` of the axis (`rotary-cal.ts`). */
  | { readonly kind: "rotary-axis"; readonly axis: "A" | "B" | "C"; readonly sphere: { readonly centre: Vec3; readonly diameter: number }; readonly angles: ReadonlyArray<number> }

export type ProbeCycleKind = ProbeCycle["kind"]
export const PROBE_CYCLE_KINDS: ReadonlyArray<ProbeCycleKind> = [
  "z-surface", "edge", "corner", "web", "pocket", "rectangle", "bore", "boss", "edge-angle", "plane", "sphere",
  "tool-length", "tool-radius", "broken-tool", "stylus-calibrate", "rotary-axis"
]

/** What planning a cycle needs besides the cycle. */
export interface ProbeContext {
  readonly probe: ProbeDevice
  /** Height between features, work Z. */
  readonly safeZ: number
  /** Stand-off from a surface before a touch, mm. */
  readonly clearance: number
  /** Search past the expected surface, mm. */
  readonly search: number
  /** Prefix of the variables the cycle writes (letters, digits, `_`). */
  readonly prefix: string
  /** The tilted plane the cycle runs in (5-axis probing); absent: the work offset itself. */
  readonly frame?: WorkFrame
  /** The frame the control reports a contact in under `frame` (default the program's, the plane's own). */
  readonly skipFrame?: "program" | "work"
  readonly setter?: ToolSetter
  /** Machine position of the active work zero: the tool setter is placed in machine coordinates, the cycles run in the work offset's. */
  readonly workOrigin?: Vec3
  /** Read the stylus radius from these variables at run time instead of baking it in (`calibrationSource: "variables"`). */
  readonly calibrationVars?: { readonly radius: Expr; readonly zTrigger?: Expr }
}

export interface ProbeContact {
  readonly name: string
  /** Where the tip is expected to stop, work coordinates. */
  readonly expected: Vec3
  /** Unit direction of the touch. */
  readonly direction: Vec3
}

/**
 * A planned cycle: the moves (protected positioning, touches, retracts, the Assigns that compute the results), the touches it makes,
 * the result variables and their nominal values. `units` says which results are angles (degrees in the IR, like every angle a control
 * computes) and which are lengths.
 */
export interface ProbeRoutine {
  readonly cycle: ProbeCycle
  readonly moves: ReadonlyArray<Move>
  readonly contacts: ReadonlyArray<ProbeContact>
  /** Result name -> the variable (expression) holding it after the moves ran. */
  readonly results: Readonly<Record<string, Expr>>
  /** Result name -> its value on a part exactly as drawn. */
  readonly nominal: Readonly<Record<string, number>>
  readonly units: Readonly<Record<string, "mm" | "deg">>
  readonly notes: ReadonlyArray<string>
}

export type ProbeRoutineResult = ProbeRoutine | { readonly refused: string }

// ---------------------------------------------------------------- actions

/** A measured characteristic checked against its limits (deviation from `nominal` within `lower`..`upper`). */
export interface Characteristic {
  readonly name: string
  readonly kind: "size" | "position" | "true-position" | "flatness" | "angle"
  /** The result it reads (`true-position`: `x` and `y` results are combined, see `trueOf`). */
  readonly result: string
  /** Second result (the `y` of a true position). */
  readonly result2?: string
  /** Nominal value: mm, radians for an angle (a true position's nominal is its `x`; `nominal2` its `y`). */
  readonly nominal: number
  readonly nominal2?: number
  /** Allowed deviation below / above nominal (lower is usually negative). A true position's `upper` is the diameter of its zone. */
  readonly lower: number
  readonly upper: number
}

export type ProbeAction =
  /** Move the work offset so the measured results read their nominal: `axes` maps an offset axis to the result it follows. */
  | { readonly kind: "set-offset"; readonly ref: WorkOffsetRef; readonly axes: Partial<Record<OffsetAxis, string>>; readonly policy: UpdatePolicy }
  /** Correct a measured rotation: with the control's rotation (`g68`), the offset's rotation (`offset-r`) or a rotary table (`table-c`). */
  | { readonly kind: "rotation"; readonly result: string; readonly via: "g68" | "offset-r" | "table-c"; readonly ref?: WorkOffsetRef; readonly policy: UpdatePolicy }
  /** Write a measured tool length / radius into the tool table. */
  | { readonly kind: "tool-offset"; readonly tool: number; readonly quantity: "length" | "radius"; readonly result: string; readonly part: "geometry" | "wear" }
  | { readonly kind: "inspect"; readonly characteristics: ReadonlyArray<Characteristic>; readonly onFail: "alarm" | "stop" | "flag" | "continue"; readonly flag?: string }
  /** Feed a measured size back into a cutting tool's wear: `gain` x deviation, ignored inside `deadband`, alarm beyond `limit`. */
  | { readonly kind: "wear-comp"; readonly tool: number; readonly quantity: "length" | "radius"; readonly result: string; readonly nominal: number; readonly gain: number; readonly deadband: number; readonly limit: number; readonly sense: 1 | -1 }
  | { readonly kind: "report"; readonly results: ReadonlyArray<string> }

export type ProbeActionKind = ProbeAction["kind"]

export interface InspectionVerdict {
  readonly name: string
  readonly kind: Characteristic["kind"]
  readonly measured: number
  readonly nominal: number
  readonly deviation: number
  readonly lower: number
  readonly upper: number
  readonly pass: boolean
}

// ---------------------------------------------------------------- simulated run

export interface ProbeSimContact {
  readonly name?: string
  /** Tip at contact, in the frame the control reports (`KernelProbing.skipFrame`). */
  readonly tip: Vec3
  readonly moveIndex: number
  /** 1-based NC line of the touch block, when the run replayed NC text. */
  readonly line?: number
}

export interface ProbeSimUpdate {
  readonly ref: WorkOffsetRef
  readonly axis: OffsetAxis
  /** mm, radians for A / B / C / R. */
  readonly before: number
  readonly after: number
}

export interface ProbeSimToolUpdate {
  readonly tool: number
  readonly quantity: "length" | "radius"
  readonly part: "geometry" | "wear"
  readonly before: number
  readonly after: number
}

export interface ProbeSimOutcome {
  readonly contacts: ReadonlyArray<ProbeSimContact>
  /** Every variable the program wrote, by `varKey`. */
  readonly variables: Readonly<Record<string, number>>
  /** The routine's results in core units (mm, radians). */
  readonly results: Readonly<Record<string, number>>
  /** The offsets after the run, by `offsetKey`. */
  readonly offsets: Readonly<Record<string, OffsetEntry>>
  readonly updates: ReadonlyArray<ProbeSimUpdate>
  readonly tools: ReadonlyArray<ProbeSimToolUpdate>
  readonly inspections: ReadonlyArray<InspectionVerdict>
  readonly alarms: ReadonlyArray<{ readonly code: number; readonly text: string; readonly moveIndex: number; readonly line?: number }>
  readonly reports: ReadonlyArray<{ readonly label: string; readonly values: Readonly<Record<string, number>> }>
  /** The program stopped before its end (an alarm, a stop, a missed touch). */
  readonly stopped?: string
  /** The tip's path, work coordinates of the offset active at each point. */
  readonly path: ReadonlyArray<Vec3>
}

// ---------------------------------------------------------------- the kernel operation

/** A probe operation of a manufacturing job (`OperationSpec` with `strategy: "probe"`); `tool` is the probe device id. */
export interface ProbeOperationFields {
  readonly cycle: ProbeCycle
  readonly actions?: ReadonlyArray<ProbeAction>
  readonly search?: number
  readonly clearance?: number
  readonly doubleTouch?: boolean
  readonly resultPrefix?: string
  /** Write the control's own cycle (Heidenhain 4xx, Siemens CYCLE97x, Renishaw G65) instead of the inline touches. */
  readonly native?: boolean
}

export interface ProbeOperationSummary {
  readonly cycle: ProbeCycleKind
  readonly touches: number
  readonly device: string
  readonly nominal: Readonly<Record<string, number>>
  /** Result name -> the control variable it is in. */
  readonly variables: Readonly<Record<string, string>>
  readonly offsetTargets: ReadonlyArray<string>
  readonly native?: string
}
