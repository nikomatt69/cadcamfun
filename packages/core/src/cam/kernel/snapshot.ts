/**
 * The manufacturing job of an explicit CAD snapshot (spec 29 §11 application Seam): the CAD elements, the stock as the
 * editor stores it (centred in X/Y, its thickness standing on the part's bottom), the material / machine presets, quality,
 * and the caller's operations and cutter library. One function, so the sidecar's run and the desktop's plan build the same
 * job from the same snapshot.
 */
import { meshBounds } from "../model/element-mesh.ts"
import { partMeshes } from "../model/model.ts"
import type { WorkOffset } from "../ir.ts"
import { KERNEL_SCHEMA_VERSION, type CamResult, type ManufacturingJob, type OperationSpec, type WorkOrigin } from "./contracts.ts"
import type { Cutter } from "./cutters.ts"
import { findMachine, MACHINES } from "./machines.ts"

export interface KernelSnapshot {
  readonly schemaVersion: typeof KERNEL_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  readonly material: string
  readonly machine?: string
  readonly origin?: WorkOrigin
  readonly workOffset?: WorkOffset
  readonly finishAllowance?: number
  readonly scallop?: number
  readonly tolerance?: number
  readonly resolution?: number
  readonly deburr?: number
  readonly elements: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** The editor's stock: centre X/Y and size; its bottom is the part's lowest point. */
  readonly stock?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly depth: number }
  readonly operations?: ReadonlyArray<OperationSpec>
  readonly tools?: ReadonlyArray<Cutter>
}

export const jobOfSnapshot = (s: KernelSnapshot): CamResult<ManufacturingJob> => {
  const machine = s.machine !== undefined ? findMachine(s.machine) : undefined
  if (s.machine !== undefined && machine === undefined) {
    return { status: "failed", issues: [{ tag: "InvalidInput", severity: "error", stage: "prepare", message: `Unknown machine preset '${s.machine}'. Known: ${MACHINES.map((m) => m.id).join(", ")}` }] }
  }
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
      ...(s.origin !== undefined ? { origin: s.origin } : {}), ...(s.workOffset !== undefined ? { workOffset: s.workOffset } : {}),
      ...(s.operations !== undefined ? { operations: s.operations } : {}), ...(s.tools !== undefined ? { tools: s.tools } : {}),
      quality
    }
  }
}
