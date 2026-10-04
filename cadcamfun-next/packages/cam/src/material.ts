import { Schema } from "effect"
import { Geometry } from "@cadcamfun/core"

export const MaterialKind = Schema.Literals(["softwood", "hardwood", "mdf", "plastic", "aluminum", "brass", "steel"])
export type MaterialKind = typeof MaterialKind.Type

export const Material = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: MaterialKind,
  /** Recommended cutting speed (Vc) for carbide tools, in m/min. HSS uses ~40% of it. */
  cuttingSpeed: Geometry.Positive,
  /** Chip load per tooth for a 6 mm tool, in mm; scaled linearly with diameter. */
  chipLoad: Geometry.Positive,
  /** Max depth of cut as a fraction of tool diameter. */
  maxDepthRatio: Geometry.Positive,
})
export type Material = typeof Material.Type

export const presets: ReadonlyArray<Material> = [
  { id: "softwood", name: "Softwood (pine)", kind: "softwood", cuttingSpeed: 500, chipLoad: 0.08, maxDepthRatio: 1 },
  { id: "hardwood", name: "Hardwood (oak)", kind: "hardwood", cuttingSpeed: 400, chipLoad: 0.06, maxDepthRatio: 0.75 },
  { id: "mdf", name: "MDF", kind: "mdf", cuttingSpeed: 450, chipLoad: 0.07, maxDepthRatio: 1 },
  { id: "acrylic", name: "Acrylic (PMMA)", kind: "plastic", cuttingSpeed: 300, chipLoad: 0.05, maxDepthRatio: 0.5 },
  { id: "al-6061", name: "Aluminum 6061", kind: "aluminum", cuttingSpeed: 250, chipLoad: 0.03, maxDepthRatio: 0.25 },
  { id: "brass", name: "Brass", kind: "brass", cuttingSpeed: 150, chipLoad: 0.03, maxDepthRatio: 0.25 },
  { id: "steel-1018", name: "Mild steel 1018", kind: "steel", cuttingSpeed: 100, chipLoad: 0.02, maxDepthRatio: 0.1 },
]
