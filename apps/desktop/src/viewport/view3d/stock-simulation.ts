/**
 * The live stock in the viewport (spec 32 §4.5): the material as the program removes it.
 *
 * The simulation is the core's (`cam.sim`): this module only decides what it is built from (the
 * program's tools, the stock of the set-up) and keeps the mesh's buffers, so a frame updates the
 * geometry in place instead of rebuilding it.
 */
import { cam } from "@cadcamfun/core"
import * as THREE from "three"

/** The stock the simulation starts from, in program coordinates. */
export interface StockBox {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

export interface StockSimulationInput {
  readonly program: cam.Program
  readonly timeline: cam.viewer.Timeline
  readonly machine?: cam.viewer.MachineSetup
  /** The tool models by `toolId` (the preview's own models). */
  readonly toolModels?: ReadonlyMap<string, cam.ToolModel>
  /** The cutters by `toolId` (the kernel's or the resources'). */
  readonly tools?: ReadonlyMap<string, cam.kernel.Cutter>
  readonly defaultToolModel?: cam.ToolModel
  readonly defaultTool?: cam.kernel.Cutter
  readonly stock: StockBox
  /** The cell size of the height field, mm. */
  readonly cell?: number
}

/** The cutter of every toolpath of the program, by its `toolId`. */
export const cuttersOf = (input: StockSimulationInput): ReadonlyMap<string, cam.sim.SimCutter> => {
  const out = new Map<string, cam.sim.SimCutter>()
  for (const path of input.program.toolpaths) {
    const kernel = input.tools?.get(path.toolId)
    // Resolve the model before its cutting profile, so an explicit probe never falls through to
    // a default end mill. This is the same precedence as the tool drawn by the viewport.
    const model = input.toolModels?.get(path.toolId)
      ?? (kernel !== undefined ? cam.toolModelFromCutter(kernel) : undefined)
      ?? input.defaultToolModel
      ?? (input.defaultTool !== undefined ? cam.toolModelFromCutter(input.defaultTool) : undefined)
    const cutter = cam.sim.simCutterOfModel(model)
    if (cutter !== undefined) out.set(path.toolId, cutter)
  }
  return out
}

/** The simulation of a program, or `undefined` when it cannot be built (no stock, no cutter). */
export const createStockSimulation = (input: StockSimulationInput): cam.sim.StockSimulation | undefined => {
  // S1 assumes a fixed vertical cutter. Rotary stock needs S2 and a lathe/printer has its own
  // stock representation; displaying a vertical sweep here would invent material removal.
  if (input.machine !== undefined && (input.machine.kind !== "mill" || input.machine.rotary !== undefined)) return undefined
  if (cam.viewer.rotaryOfProgram(input.program) !== undefined) return undefined
  const cutters = cuttersOf(input)
  if (cutters.size === 0) return undefined
  return new cam.sim.StockSimulation({
    program: input.program,
    timeline: input.timeline,
    cutters,
    bounds: input.stock,
    ...(input.cell !== undefined ? { cell: input.cell } : {})
  })
}

/** The live stock readout; absent when this program has no S1 simulation. */
export interface StockInfo {
  readonly removed: number
  readonly remaining: number
  readonly cell: number
  readonly missingTools: ReadonlyArray<string>
}

/** The mesh of the remaining stock, ready to be drawn. */
export interface LiveStock {
  readonly mesh: THREE.Mesh
  readonly simulation: cam.sim.StockSimulation
  /** Redraws the geometry when the stock changed; returns whether it did. */
  readonly update: () => boolean
}

/** Builds the mesh of a simulation and keeps its buffers for the updates. */
export const createLiveStock = (simulation: cam.sim.StockSimulation, options: { readonly color?: number; readonly opacity?: number } = {}): LiveStock => {
  const shape = simulation.mesh()
  const geometry = new THREE.BufferGeometry()
  const positions = new THREE.BufferAttribute(shape.positions, 3)
  const normals = new THREE.BufferAttribute(shape.normals, 3)
  positions.setUsage(THREE.DynamicDrawUsage)
  normals.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute("position", positions)
  geometry.setAttribute("normal", normals)
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1))
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xc8a878,
    metalness: 0.25,
    roughness: 0.65,
    side: THREE.DoubleSide,
    ...(options.opacity !== undefined && options.opacity < 1 ? { transparent: true, opacity: options.opacity } : {})
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = "stock:live"
  let version = simulation.version
  return {
    mesh,
    simulation,
    update: () => {
      if (simulation.version === version) return false
      version = simulation.version
      simulation.sim.writeMesh(shape.positions, shape.normals)
      positions.needsUpdate = true
      normals.needsUpdate = true
      geometry.computeBoundingSphere()
      return true
    }
  }
}
