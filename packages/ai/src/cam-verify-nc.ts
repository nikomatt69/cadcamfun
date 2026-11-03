/**
 * `cam-verify-nc`: NC the kernel did not write, replayed against the part, the stock and the tools in the spindle (spec 72 step 0.6).
 * The tri-dexel replay costs seconds on a large stock, so the HTTP route and the assistant run it through the kernel job queue
 * (scoped worker, deadline, cancellation). The input is plain data: meshes arrive as number arrays and become typed arrays here, and
 * a part given as CAD elements is meshed here, in the worker, not on the sidecar's event loop.
 */
import { cam } from "@cadcamfun/core"
import type { CamVerifyNcRequest } from "@cadcamfun/api"

type Mesh = CamVerifyNcRequest["part"][number]

/** The HTTP request, or the same with the part as CAD elements and a work zero to subtract (the assistant's form). */
export type CamVerifyNcInput = Omit<CamVerifyNcRequest, "part"> & {
  readonly part?: CamVerifyNcRequest["part"]
  readonly elements?: ReadonlyArray<Record<string, unknown>>
  /** Work zero in the part's coordinates; subtracted from every part vertex so the part, the stock and the program share one frame. */
  readonly origin?: { readonly x: number; readonly y: number; readonly z: number }
}

/** Whether a mesh references only vertices it has; the replay would read `undefined` coordinates otherwise. */
export const meshProblem = (mesh: Mesh, index: number): string | undefined => {
  if (mesh.positions.length % 3 !== 0) return `part[${index}]: positions must hold x y z triples`
  if (mesh.indices.length % 3 !== 0) return `part[${index}]: indices must hold triangle triples`
  const vertices = mesh.positions.length / 3
  for (const i of mesh.indices) if (i >= vertices) return `part[${index}]: index ${i} is past the ${vertices} vertices`
  return undefined
}

export type CamVerifyNcOutput = (cam.kernel.VerifyNcResult & { readonly warnings: ReadonlyArray<string> }) | { readonly error: string }

export const camVerifyNc = (input: CamVerifyNcInput): CamVerifyNcOutput => {
  const { part, elements, origin, tools, ...rest } = input
  if (!(input.stock.max.x > input.stock.min.x && input.stock.max.y > input.stock.min.y && input.stock.max.z > input.stock.min.z)) {
    return { error: "stock: max must be larger than min on every axis" }
  }
  const warnings: string[] = []
  let meshes: cam.kernel.VerifyNcRequest["part"]
  const shift = origin ?? { x: 0, y: 0, z: 0 }
  const moved = (positions: Float64Array): Float64Array => {
    for (let i = 0; i < positions.length; i += 3) { positions[i]! -= shift.x; positions[i + 1]! -= shift.y; positions[i + 2]! -= shift.z }
    return positions
  }
  if (elements !== undefined) {
    const resolved = cam.model.partMeshes(elements as never)
    if (resolved === undefined) return { error: "The part has no solid the kernel can mesh (send closed solids, or meshes)." }
    if (resolved.skipped.length > 0) warnings.push(`not part of the replay: ${resolved.skipped.join(", ")}`)
    warnings.push(...resolved.warnings)
    meshes = resolved.meshes.map((m) => ({ positions: moved(Float64Array.from(m.positions)), indices: m.indices }))
  } else if (part !== undefined) {
    for (let i = 0; i < part.length; i++) {
      const problem = meshProblem(part[i]!, i)
      if (problem !== undefined) return { error: problem }
    }
    meshes = part.map((m) => ({ positions: moved(Float64Array.from(m.positions)), indices: Uint32Array.from(m.indices) }))
  } else {
    return { error: "Send the part as meshes or as CAD elements." }
  }
  const result = cam.kernel.verifyNc({
    ...rest,
    part: meshes,
    tools: tools.map((t) => ({ number: t.number, cutter: t.cutter as unknown as cam.kernel.Cutter }))
  })
  return { ...result, warnings }
}
