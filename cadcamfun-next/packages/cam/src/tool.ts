import { Schema } from "effect"
import { Geometry } from "@cadcamfun/core"

export const ToolKind = Schema.Literals(["flat-endmill", "ball-endmill", "v-bit", "drill", "chamfer"])
export type ToolKind = typeof ToolKind.Type

export const ToolMaterial = Schema.Literals(["hss", "carbide"])
export type ToolMaterial = typeof ToolMaterial.Type

export const Tool = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: ToolKind,
  /** Cutting diameter, in mm. */
  diameter: Geometry.Positive,
  flutes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** Maximum usable cutting depth, in mm. */
  fluteLength: Geometry.Positive,
  material: ToolMaterial,
  /** Included angle for v-bits / chamfer mills, in degrees. */
  angle: Schema.optional(Geometry.Positive),
  /** Tool-table slot used for tool changes. */
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  maxRpm: Schema.optional(Geometry.Positive),
  coolant: Schema.optional(Schema.Literals(["none", "flood", "mist"])),
  shankDiameter: Schema.optional(Geometry.Positive),
  totalLength: Schema.optional(Geometry.Positive),
  notes: Schema.optional(Schema.String),
})
export type Tool = typeof Tool.Type

export const presets: ReadonlyArray<Tool> = [
  {
    id: "em-3",
    name: "3 mm flat end mill",
    kind: "flat-endmill",
    diameter: 3,
    flutes: 2,
    fluteLength: 12,
    material: "carbide",
    number: 1,
  },
  {
    id: "em-6",
    name: "6 mm flat end mill",
    kind: "flat-endmill",
    diameter: 6,
    flutes: 3,
    fluteLength: 20,
    material: "carbide",
    number: 2,
  },
  {
    id: "bm-6",
    name: "6 mm ball end mill",
    kind: "ball-endmill",
    diameter: 6,
    flutes: 2,
    fluteLength: 20,
    material: "carbide",
    number: 3,
  },
  {
    id: "vb-60",
    name: "60° v-bit",
    kind: "v-bit",
    diameter: 12,
    flutes: 2,
    fluteLength: 10,
    material: "carbide",
    angle: 60,
    number: 4,
  },
  {
    id: "dr-5",
    name: "5 mm drill",
    kind: "drill",
    diameter: 5,
    flutes: 2,
    fluteLength: 40,
    material: "hss",
    number: 5,
  },
]
