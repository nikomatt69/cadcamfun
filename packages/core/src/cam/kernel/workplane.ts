/**
 * A setup in a tilted work plane (spec 69 C1, 3+2): the part is machined by an ordinary three-axis strategy in the plane's own
 * coordinates, and the post writes the control's plane word (Fanuc `G68.2` + `G53.1`, Siemens `CYCLE800`, Heidenhain `PLANE SPATIAL`)
 * so the machine turns its rotary axes to the plane and cuts there. The kernel does the geometry:
 *
 *   frame     `normal` is the tool axis in CAD world coordinates (the plane's z); `xHint` picks the plane's x (default CAD +X, or +Y when the
 *             normal is along X). The plane's axes are right-handed and orthonormal.
 *   datum     the work offset sits at the plane origin (the stock top centre or corner in the plane), so the plane word carries no shift:
 *             touch off G54 there. The program says so.
 *   replay    the interpreter replays the plane word into the machine frame; the kernel maps the motions back into the plane for the
 *             stock replay, and keeps the machine-frame motions for the travel check.
 *   refused   the planner (a tilted plane needs explicit operations), and what is not decided in a tilted frame: the table and fixture
 *             clearance, which stay `unsupported` / `unresolved` rather than guessed.
 */
import { cross3, dot3, length3, type Vec3 } from "../../cad/vec.ts"
import type { Transform } from "../../cad/brep/math.ts"
import { setupTransform } from "../setup.ts"
import type { WorkFrame } from "../setup.ts"
import type { ManufacturingJob, Workplane } from "./contracts.ts"

const unit = (v: Vec3): Vec3 => { const l = length3(v); return { x: v.x / l, y: v.y / l, z: v.z / l } }

/** The plane's frame in CAD world axes, or the reason it cannot be built. */
export const workplaneFrame = (wp: Workplane): { readonly frame: WorkFrame } | { readonly error: string } => {
  const n = wp.normal
  if (![n.x, n.y, n.z].every(Number.isFinite) || length3(n) < 1e-9) return { error: "The work plane needs a finite, non-zero normal" }
  const z = unit(n)
  let hint = wp.xHint ?? (Math.abs(z.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })
  if (![hint.x, hint.y, hint.z].every(Number.isFinite)) return { error: "The work plane's x hint must be finite" }
  const along = dot3(hint, z)
  hint = { x: hint.x - along * z.x, y: hint.y - along * z.y, z: hint.z - along * z.z }
  if (length3(hint) < 1e-9) return { error: "The work plane's x hint is parallel to its normal" }
  const x = unit(hint)
  const y = cross3(z, x)
  return { frame: { origin: { x: 0, y: 0, z: 0 }, xAxis: x, yAxis: y, zAxis: z } }
}

/** CAD world to plane coordinates: the rows are the plane's axes. */
export const workplaneTransform = (frame: WorkFrame): Transform => ({
  m: [frame.xAxis.x, frame.xAxis.y, frame.xAxis.z, frame.yAxis.x, frame.yAxis.y, frame.yAxis.z, frame.zAxis.x, frame.zAxis.y, frame.zAxis.z],
  t: { x: 0, y: 0, z: 0 }
})

/** The transform a job's setup applies to the CAD world: its tilted plane, else its signed-permutation orientation. */
export const jobTransform = (job: Pick<ManufacturingJob, "workplane" | "setupOrientation">): Transform => {
  if (job.workplane !== undefined) {
    const f = workplaneFrame(job.workplane)
    if ("frame" in f) return workplaneTransform(f.frame)
  }
  return setupTransform(job.setupOrientation ?? "+Z")
}
