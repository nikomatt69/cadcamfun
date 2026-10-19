/**
 * The live stock of a rotary program (spec 32 P6, tier S2): the core's voxel stock (`cam.sim.createVoxelSim`) as a mesh of
 * its faces that touch air, in the part frame (it turns with the table in the machine view). The height field of
 * `stock-simulation.ts` keeps the 3-axis programs; this one takes the programs whose tool tilts.
 */
import * as THREE from "three"
import { cam, type Vec3 } from "@cadcamfun/core"
import { previewToolFor, type ToolSources } from "./tool-models.ts"

export interface VoxelStock {
  readonly mesh: THREE.Mesh
  readonly sim: cam.sim.VoxelSim
  /** Brings the stock to the playhead and redraws it when it changed (at most every `minMs` while it keeps changing). */
  readonly update: (seconds: number, now?: number) => boolean
  readonly dispose: () => void
}

export const createVoxelStock = (input: { readonly program: cam.Program; readonly timeline: cam.viewer.Timeline; readonly rotary?: cam.viewer.RotarySetup; readonly stock: { readonly min: Vec3; readonly max: Vec3 }; readonly tools: ToolSources; readonly opacity?: number; readonly minMs?: number }): VoxelStock => {
  const sim = cam.sim.createVoxelSim({
    timeline: input.timeline, stock: input.stock, budget: 400_000,
    ...(input.rotary !== undefined ? { rotary: input.rotary } : {}),
    toolOf: (path) => previewToolFor(input.program.toolpaths[path]?.toolId ?? "", input.tools)
  })
  const geometry = new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc8a878, metalness: 0.35, roughness: 0.6, transparent: (input.opacity ?? 1) < 1, opacity: input.opacity ?? 1 }))
  mesh.name = "live-stock:voxels"
  const draw = () => {
    const { positions, normals } = sim.surface()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
    geometry.computeBoundingSphere()
  }
  draw()
  let pending = false, last = 0
  const minMs = input.minMs ?? 120
  return {
    mesh, sim,
    update: (seconds, now = typeof performance !== "undefined" ? performance.now() : Date.now()) => {
      if (sim.advanceTo(seconds)) pending = true
      if (!pending || now - last < minMs) return false
      draw(); pending = false; last = now
      return true
    },
    dispose: () => { geometry.dispose(); (mesh.material as THREE.Material).dispose() }
  }
}

