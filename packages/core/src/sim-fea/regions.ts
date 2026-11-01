import type { TetMesh } from "./mesh.ts"
import { AXES, type Region } from "./study.ts"

const axisIndex = (a: "x" | "y" | "z"): number => AXES.indexOf(a)

/** Mask over all nodes (1 = inside the region). `all` selects every node. */
export const regionNodes = (mesh: TetMesh, region: Region): Uint8Array => {
  const mask = new Uint8Array(mesh.nodeCount)
  const n = mesh.nodes
  const ext = Math.max(mesh.bounds.max[0] - mesh.bounds.min[0], mesh.bounds.max[1] - mesh.bounds.min[1], mesh.bounds.max[2] - mesh.bounds.min[2])
  const fine = Math.max(1e-6 * ext, 1e-9)
  for (let i = 0; i < mesh.nodeCount; i++) {
    const x = n[i * 3]!, y = n[i * 3 + 1]!, z = n[i * 3 + 2]!
    let hit = false
    switch (region.kind) {
      case "all": hit = true; break
      case "plane": hit = Math.abs(n[i * 3 + axisIndex(region.axis)]! - region.value) <= (region.tolerance ?? fine); break
      case "box": hit = x >= region.min[0] - fine && x <= region.max[0] + fine && y >= region.min[1] - fine && y <= region.max[1] + fine && z >= region.min[2] - fine && z <= region.max[2] + fine; break
      case "sphere": hit = Math.hypot(x - region.center[0], y - region.center[1], z - region.center[2]) <= region.radius; break
      case "cylinder": {
        // `center` lists the two other coordinates in x, y, z order (axis x: y, z; axis y: x, z; axis z: x, y)
        const a = axisIndex(region.axis), p = a === 0 ? 1 : 0, q = a === 2 ? 1 : 2
        hit = Math.abs(Math.hypot(n[i * 3 + p]! - region.center[0], n[i * 3 + q]! - region.center[1]) - region.radius) <= (region.tolerance ?? Math.max(...mesh.cell))
        break
      }
    }
    if (hit) mask[i] = 1
  }
  return mask
}

/** Boundary faces whose six nodes all lie in the region. */
export const regionFaces = (mesh: TetMesh, region: Region): number[] => {
  const mask = region.kind === "all" ? undefined : regionNodes(mesh, region)
  const faces: number[] = []
  for (let f = 0; f < mesh.faceCount; f++) {
    if (mask === undefined) { faces.push(f); continue }
    let all = true
    for (let q = 0; q < 6 && all; q++) if (mask[mesh.faces[f * 6 + q]!] === 0) all = false
    if (all) faces.push(f)
  }
  return faces
}
