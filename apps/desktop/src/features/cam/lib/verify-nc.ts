import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact, CamKernelRequest, CamVerifyNcRequest } from "@cadcamfun/api"

/**
 * The request that replays the NC in the editor against the part the program was made from (spec 72 step 0.6): the part's meshes and the
 * stock in the program's work frame, and the tools the kernel put in the spindle. The text is the editor's, so a hand edit is checked, not the
 * kernel's original. Only a +Z setup is supported here (the oriented frame of another setup is the kernel's); anything else is a reason, not a guess.
 */
export const ncVerifyRequest = (artifact: CamKernelArtifact, request: CamKernelRequest, nc: string): CamVerifyNcRequest | string => {
  if ((artifact.setupOrientation ?? "+Z") !== "+Z") return `The check supports +Z setups; this program is made for ${artifact.setupOrientation}.`
  const meshes = cam.model.partMeshes(request.elements as never)
  if (meshes === undefined) return "The part has no solid that can be meshed."
  const o = artifact.origin
  const shift = (positions: ArrayLike<number>): number[] => Array.from(positions, (v, i) => v - [o.x, o.y, o.z][i % 3]!)
  const b = artifact.stockBounds
  const extent = Math.max(b.max.x - b.min.x, b.max.y - b.min.y)
  return {
    nc,
    part: meshes.meshes.map((m) => ({ positions: shift(m.positions), indices: Array.from(m.indices) })),
    stock: { min: { x: b.min.x - o.x, y: b.min.y - o.y, z: b.min.z - o.z }, max: { x: b.max.x - o.x, y: b.max.y - o.y, z: b.max.z - o.z } },
    tools: artifact.tools.map((t) => ({ number: t.number, cutter: t as never })),
    tolerance: request.tolerance ?? 0.01,
    // A cell that keeps the replay to a few seconds on a large stock; the kernel states the error it reached.
    cell: Math.max(0.1, Math.min(0.5, extent / 300))
  }
}
