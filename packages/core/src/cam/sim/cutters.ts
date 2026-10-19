/**
 * The cutter a tool model cuts with (spec 32 §4.5): the shape the height field removes material
 * with. It is the same shape the tool is drawn with, so what the preview carves is what the tool
 * looks like.
 *
 * A shape the simulation cannot model exactly is cut as the cylinder of its nominal diameter: the
 * conservative choice (more material removed, never less).
 */
import type { MillModel, ToolModel } from "../tool-model.ts"
import type { SimCutter } from "./stock-sim.ts"

/** The cone of a chamfer / V-bit / drill point: the height above the tip at a radial distance. */
const cone = (angle: number): ((r: number) => number) => {
  const slope = Math.tan((Math.max(1, Math.min(179, angle)) * Math.PI) / 360)
  return (r) => r / slope
}

/** The corner of a ball or bull nose: the height above the tip at a radial distance. */
const corner = (radius: number, cornerRadius: number): ((r: number) => number) => {
  const c = Math.max(1e-6, Math.min(radius, cornerRadius))
  const inner = radius - c
  return (r) => (r <= inner ? 0 : c - Math.sqrt(Math.max(0, c * c - (r - inner) * (r - inner))))
}

const flat = (radius: number): SimCutter => ({ radius, flat: true, profile: () => 0 })

/** The cutter of a mill tool model. */
export const simCutterOf = (model: MillModel): SimCutter => {
  const radius = Math.max(0, model.diameter / 2)
  if (radius <= 0) return { radius: 0, flat: true, profile: () => 0 }
  switch (model.shape) {
    case "ball": return { radius, flat: false, profile: corner(radius, radius) }
    case "bull":
    case "cornerRounding": return { radius, flat: false, profile: corner(radius, model.cornerRadius ?? Math.min(radius * 0.25, 2)) }
    case "chamfer": return { radius, flat: false, profile: cone(model.angle ?? 90) }
    case "engraver": return { radius, flat: false, profile: cone(model.angle ?? 60) }
    case "spot": return { radius, flat: false, profile: cone(model.angle ?? 90) }
    case "drill": return { radius, flat: false, profile: cone(model.angle ?? 118) }
    default: return flat(radius)
  }
}

/** The cutter of any tool model: the machines that do not mill (a lathe, a printer) cut nothing here. */
export const simCutterOfModel = (model: ToolModel | undefined): SimCutter | undefined =>
  model === undefined || model.family !== "mill" ? undefined : simCutterOf(model)
