/**
 * The manufacturing job of an explicit CAD snapshot (spec 29 §11 application Seam): the CAD elements, the stock as the
 * editor stores it (centred in X/Y, its thickness standing on the part's bottom), the material / machine presets, quality,
 * and the caller's operations and cutter library. One function, so the sidecar's run and the desktop's plan build the same
 * job from the same snapshot.
 */
import { meshBounds } from "../model/element-mesh.ts"
import { partMeshes } from "../model/model.ts"
import type { SetupOrientation } from "../setup.ts"
import type { WorkOffset } from "../ir.ts"
import { KERNEL_SCHEMA_VERSION, type CamResult, type ManufacturingJob, type OperationSpec, type PrintRequirement, type WorkOrigin } from "./contracts.ts"
import type { Cutter } from "./cutters.ts"
import { findMachine, MACHINE_CATALOGUE } from "./machines.ts"
import { kernelMachineOfConfig, machineRefusal, type MachineConfigRow } from "./machine-config.ts"

export interface KernelSnapshot {
  readonly schemaVersion: typeof KERNEL_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  readonly material: string
  readonly machine?: string
  /** A machine configuration the user saved: it wins over the preset id, because it is the machine they configured. */
  readonly machineConfig?: MachineConfigRow
  readonly setupOrientation?: SetupOrientation
  readonly origin?: WorkOrigin
  readonly workOffset?: WorkOffset
  readonly finishAllowance?: number
  readonly scallop?: number
  readonly tolerance?: number
  readonly resolution?: number
  readonly deburr?: number
  /** Write toolpaths that repeat translated as `M98` subprograms (Fanuc and Haas posts). */
  readonly subprograms?: boolean
  /** A post definition that writes the NC in place of the machine's built-in post (spec 54 C1). Inline, so a stored program re-runs with the post it was made with. */
  readonly postDefinition?: unknown
  /** How a printer job is sliced (read only when the machine is a printer). */
  readonly print?: PrintRequirement
  readonly elements: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** The editor's stock: centre X/Y and size; its bottom is the part's lowest point. */
  readonly stock?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly depth: number }
  readonly operations?: ReadonlyArray<OperationSpec>
  readonly tools?: ReadonlyArray<Cutter>
}

export const jobOfSnapshot = (s: KernelSnapshot): CamResult<ManufacturingJob> => {
  const preset = s.machine !== undefined ? findMachine(s.machine) : undefined
  if (s.machine !== undefined && preset === undefined) {
    return { status: "failed", issues: [{ tag: "InvalidInput", severity: "error", stage: "prepare", message: `Unknown machine preset '${s.machine}'. Known: ${MACHINE_CATALOGUE.map((m) => m.id).join(", ")}` }] }
  }
  // A saved machine configuration is the machine the user configured: it wins over the preset id.
  const configured = s.machineConfig !== undefined ? kernelMachineOfConfig(s.machineConfig) : undefined
  if (s.machineConfig !== undefined && configured === undefined) {
    return { status: "failed", issues: [{ tag: "InvalidInput", severity: "error", stage: "prepare", message: `The machine configuration '${s.machineConfig.name}' is not a machine the kernel can run: ${machineRefusal(s.machineConfig) ?? "it needs a kind it machines (mill, lathe or filament printer)"}.` }] }
  }
  const machine = configured ?? preset
  let stock: ManufacturingJob["stock"]
  if (s.stock !== undefined) {
    const meshes = partMeshes(s.elements as never, { tolerance: s.tolerance ?? 0.01 })
    const bottom = meshes !== undefined && meshes.meshes.length > 0 ? Math.min(...meshes.meshes.map((m) => meshBounds(m).min[2]!)) : 0
    stock = { min: { x: s.stock.x - s.stock.width / 2, y: s.stock.y - s.stock.height / 2, z: bottom }, max: { x: s.stock.x + s.stock.width / 2, y: s.stock.y + s.stock.height / 2, z: bottom + s.stock.depth } }
  }
  const quality = {
    ...(s.finishAllowance !== undefined ? { finishAllowance: s.finishAllowance } : {}), ...(s.scallop !== undefined ? { scallop: s.scallop } : {}),
    ...(s.tolerance !== undefined ? { tolerance: s.tolerance } : {}), ...(s.resolution !== undefined ? { resolution: s.resolution } : {}),
    ...(s.deburr !== undefined ? { deburr: s.deburr } : {})
  }
  return {
    status: "ok",
    value: {
      schemaVersion: s.schemaVersion, id: s.id, name: s.name, material: s.material,
      part: { kind: "elements", elements: s.elements }, ...(machine !== undefined ? { machine } : {}), ...(stock !== undefined ? { stock } : {}),
      ...(s.setupOrientation !== undefined ? { setupOrientation: s.setupOrientation } : {}),
      ...(s.origin !== undefined ? { origin: s.origin } : {}), ...(s.workOffset !== undefined ? { workOffset: s.workOffset } : {}),
      ...(s.operations !== undefined ? { operations: s.operations } : {}), ...(s.tools !== undefined ? { tools: s.tools } : {}),
      ...(s.subprograms === true || s.postDefinition !== undefined
        ? { post: { ...(s.subprograms === true ? { options: { subprograms: true } } : {}), ...(s.postDefinition !== undefined ? { definition: s.postDefinition } : {}) } }
        : {}),
      ...(s.print !== undefined ? { print: s.print } : {}),
      quality
    }
  }
}
