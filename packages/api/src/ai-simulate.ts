/**
 * `cad.simulate`: finite-element studies (spec 48) on the exact solids of the open drawing or a history sent inline. One
 * action covers run, mesh convergence, a material sweep and the material library, because improving a study is a loop over
 * the same input: run it, read the findings, change the part or the setup, run it again.
 */
import { Schema } from "effect"

const optional = Schema.optionalKey
const nonEmpty = Schema.String.check(Schema.isMinLength(1))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const axis = Schema.Literals(["x", "y", "z"])
const vec3 = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite])
const record = Schema.Record(Schema.String, Schema.Unknown)

/** Where a support or load acts: boundary nodes picked geometrically, in the drawing's coordinates (mm). */
export const SimRegion = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({ kind: Schema.Literal("plane"), axis, value: Schema.Finite, tolerance: optional(positive) }),
  Schema.Struct({ kind: Schema.Literal("box"), min: vec3, max: vec3 }),
  Schema.Struct({ kind: Schema.Literal("sphere"), center: vec3, radius: positive }),
  Schema.Struct({ kind: Schema.Literal("cylinder"), axis, center: Schema.Tuple([Schema.Finite, Schema.Finite]), radius: positive, tolerance: optional(positive) })
])

const SimSupport = Schema.Struct({
  name: optional(nonEmpty), region: SimRegion,
  dofs: optional(Schema.Array(axis).check(Schema.isMinLength(1), Schema.isMaxLength(3))), value: optional(Schema.Finite)
})

const SimLoad = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("force"), name: optional(nonEmpty), region: SimRegion, force: vec3 }),
  Schema.Struct({ kind: Schema.Literal("pressure"), name: optional(nonEmpty), region: SimRegion, pressure: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("torque"), name: optional(nonEmpty), region: SimRegion, axis: vec3, center: vec3, torque: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("gravity"), acceleration: optional(vec3) })
])

const SimThermal = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("temperature"), name: optional(nonEmpty), region: SimRegion, value: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("convection"), name: optional(nonEmpty), region: SimRegion, coefficient: positive, ambient: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("flux"), name: optional(nonEmpty), region: SimRegion, flux: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("heat"), power: Schema.Finite })
])

export const SIM_ANALYSES = ["static", "thermal", "thermal_stress", "transient_thermal", "modal", "buckling"] as const
export const SIM_METRICS = ["maxVonMises", "maxDisplacement", "minSafetyFactor", "maxTemperature", "maxPrincipal", "frequency", "bucklingFactor"] as const

export const CadSimulateInput = Schema.Struct({
  op: Schema.Literals(["run", "converge", "materials", "library"]),
  analysis: optional(Schema.Literals(SIM_ANALYSES)),
  /** One element of the open drawing (needs an exact solid). Or `history` inline. */
  id: optional(nonEmpty),
  history: optional(record),
  /** Which body of a history with several. */
  body: optional(nonEmpty),
  /** Library id (op library lists them). Default steel-s235. */
  material: optional(nonEmpty),
  overrides: optional(Schema.Struct({
    youngGPa: optional(positive), poisson: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0.05, maximum: 0.49 }))), density: optional(positive),
    yieldMPa: optional(positive), ultimateMPa: optional(positive), conductivity: optional(positive), specificHeat: optional(positive), expansion: optional(Schema.Finite)
  })),
  /** Element size, mm (cells of the voxel-tetrahedron grid; quadratic elements). */
  size: optional(positive),
  maxElements: optional(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 80_000 }))),
  supports: optional(Schema.Array(SimSupport).check(Schema.isMaxLength(20))),
  loads: optional(Schema.Array(SimLoad).check(Schema.isMaxLength(20))),
  thermal: optional(Schema.Array(SimThermal).check(Schema.isMaxLength(20))),
  referenceTemperature: optional(Schema.Finite),
  uniformTemperature: optional(Schema.Finite),
  initialTemperature: optional(Schema.Finite),
  transient: optional(Schema.Struct({ duration: positive, steps: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2000 })), stressSteps: optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 }))) })),
  modes: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 }))),
  criterion: optional(Schema.Literals(["von_mises", "tresca", "max_principal", "mohr_coulomb"])),
  freeExpansion: optional(Schema.Boolean),
  /** converge: the number to watch (default per analysis), meshes 2-5, size ratio, accepted change. */
  metric: optional(Schema.Literals(SIM_METRICS)),
  levels: optional(Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 5 }))),
  factor: optional(Schema.Finite.check(Schema.isBetween({ minimum: 1.2, maximum: 3 }))),
  tolerance: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0.001, maximum: 0.5 }))),
  /** materials: candidate library ids (omit for the whole library) and the safety factor to reach. */
  candidates: optional(Schema.Array(nonEmpty).check(Schema.isMaxLength(30))),
  targetSafety: optional(positive),
  /** Read the fields at these points (nearest node). */
  probes: optional(Schema.Array(vec3).check(Schema.isMaxLength(12)))
}).annotate({ description: "Finite-element study on an exact solid: static stress, steady/transient thermal, thermal stress, modal, buckling. op run | converge | materials | library." })
export type CadSimulateInput = typeof CadSimulateInput.Type
