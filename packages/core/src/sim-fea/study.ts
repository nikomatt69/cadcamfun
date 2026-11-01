/**
 * Study definition (spec 48 §2 step 1): what to solve, on which geometry, with which supports and loads. Units are the
 * handbook ones a designer types (mm, N, MPa, °C, W/m²K); the solver converts. Regions select boundary nodes geometrically
 * until persistent face references (spec 41) feed them.
 */
import type { FailureCriterion, MaterialSpec } from "./materials.ts"

export type Vec3 = readonly [number, number, number]
export type Axis = "x" | "y" | "z"
export const AXES: ReadonlyArray<Axis> = ["x", "y", "z"]

export type Region =
  | { readonly kind: "all" }
  /** Nodes on the plane `axis = value`. */
  | { readonly kind: "plane"; readonly axis: Axis; readonly value: number; readonly tolerance?: number }
  | { readonly kind: "box"; readonly min: Vec3; readonly max: Vec3 }
  | { readonly kind: "sphere"; readonly center: Vec3; readonly radius: number }
  /** The wall of a hole or boss: radial distance `radius ± tolerance` from the line parallel to `axis` through `center` (the two other coordinates in x, y, z order). */
  | { readonly kind: "cylinder"; readonly axis: Axis; readonly center: readonly [number, number]; readonly radius: number; readonly tolerance?: number }

export interface Support {
  readonly name?: string
  readonly region: Region
  /** Constrained directions; default all three (fixed). One axis on a plane is a frictionless / symmetry support. */
  readonly dofs?: ReadonlyArray<Axis>
  /** Prescribed displacement along each constrained direction, mm (default 0). */
  readonly value?: number
}

export type Load =
  /** Total force in N spread over the region's boundary. */
  | { readonly kind: "force"; readonly name?: string; readonly region: Region; readonly force: Vec3 }
  /** Pressure in MPa pushing into the part. */
  | { readonly kind: "pressure"; readonly name?: string; readonly region: Region; readonly pressure: number }
  /** Torque in N·mm about the axis direction through `center`, as a tangential traction on the region. */
  | { readonly kind: "torque"; readonly name?: string; readonly region: Region; readonly axis: Vec3; readonly center: Vec3; readonly torque: number }
  /** Body acceleration in mm/s² (default 9810 along -z). */
  | { readonly kind: "gravity"; readonly acceleration?: Vec3 }

export type ThermalLoad =
  | { readonly kind: "temperature"; readonly name?: string; readonly region: Region; readonly value: number }
  /** `coefficient` in W/(m²·K), `ambient` in °C. */
  | { readonly kind: "convection"; readonly name?: string; readonly region: Region; readonly coefficient: number; readonly ambient: number }
  /** Heat flux into the part, W/m². */
  | { readonly kind: "flux"; readonly name?: string; readonly region: Region; readonly flux: number }
  /** Total volumetric heat generation, W, uniform over the part. */
  | { readonly kind: "heat"; readonly power: number }

export type Analysis = "static" | "thermal" | "thermal_stress" | "transient_thermal" | "modal" | "buckling"

export type Geometry =
  | { readonly kind: "box"; readonly min: Vec3; readonly max: Vec3 }
  | { readonly kind: "solid"; readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }

export interface Study {
  readonly analysis: Analysis
  readonly geometry: Geometry
  readonly material: MaterialSpec
  readonly mesh: { readonly size: number; readonly maxElements?: number }
  readonly supports?: ReadonlyArray<Support>
  readonly loads?: ReadonlyArray<Load>
  readonly thermal?: ReadonlyArray<ThermalLoad>
  /** Stress-free temperature, °C (default 20). */
  readonly referenceTemperature?: number
  /** Thermal stress without a thermal solve: the whole part at this temperature, °C. */
  readonly uniformTemperature?: number
  /** Transient start temperature, °C (default: the reference temperature). */
  readonly initialTemperature?: number
  readonly transient?: { readonly duration: number; readonly steps: number; /** How many instants get a stress solve (thermal-stress history); default 4. */ readonly stressSteps?: number }
  readonly modes?: number
  readonly criterion?: FailureCriterion
  /** Without supports a structural study is held by three minimal (isostatic) constraints so the part expands freely. Default true. */
  readonly freeExpansion?: boolean
}

export type Refusal = {
  readonly ok: false
  readonly code:
    | "invalid_study" | "region_empty" | "unknown_material" | "under_constrained" | "no_convergence" | "too_large"
    | "mesh_failed" | "no_thermal_input" | "no_heat_path" | "cancelled" | "no_prestress" | "no_buckling"
  readonly message: string
  readonly details?: Record<string, unknown>
}

export const refuse = (code: Refusal["code"], message: string, details?: Record<string, unknown>): Refusal => ({ ok: false, code, message, ...(details !== undefined ? { details } : {}) })
