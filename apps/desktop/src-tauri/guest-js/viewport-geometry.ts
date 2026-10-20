/** Guest half of the raw Tauri viewport command. No Three objects or GPU resources are owned here. */
import { invoke } from "@tauri-apps/api/core"

const MAX_INPUT_BYTES = 16 * 1024 * 1024
const MAX_TRIANGLES = 250_000

export interface ViewportEdgesInput {
  readonly positions: Float32Array
  readonly indices?: Uint16Array | Uint32Array
  readonly thresholdAngle?: number
  readonly signal?: AbortSignal
}

/** Copies numeric display data once; the authoritative geometry is never transferred or detached. */
export const encodeEdgesRequest = (input: ViewportEdgesInput): Uint8Array => {
  const vertices = input.positions.length / 3
  const corners = input.indices?.length ?? vertices
  const angle = input.thresholdAngle ?? 1
  const length = 24 + input.positions.byteLength + (input.indices?.length ?? 0) * 4
  if (!Number.isInteger(vertices) || corners % 3 !== 0 || corners / 3 > MAX_TRIANGLES || vertices > MAX_TRIANGLES * 3 || length > MAX_INPUT_BYTES) {
    throw new RangeError("Geometry exceeds the native viewport limits or has incomplete triangles")
  }
  if (!Number.isFinite(angle) || angle < 0 || angle > 180) throw new RangeError("Invalid edge threshold")
  const bytes = new Uint8Array(length)
  bytes.set([67, 71, 69, 49]) // CGE1
  const header = new DataView(bytes.buffer)
  header.setUint32(4, vertices, true)
  header.setUint32(8, input.indices?.length ?? 0, true)
  header.setFloat64(12, angle, true)
  // Tauri's supported desktop targets are little-endian. Preserve f32 bytes and subarray offsets.
  bytes.set(new Uint8Array(input.positions.buffer, input.positions.byteOffset, input.positions.byteLength), 24)
  const offset = 24 + input.positions.byteLength
  if (input.indices instanceof Uint32Array) {
    bytes.set(new Uint8Array(input.indices.buffer, input.indices.byteOffset, input.indices.byteLength), offset)
  } else if (input.indices) {
    for (let i = 0; i < input.indices.length; i++) header.setUint32(offset + i * 4, input.indices[i]!, true)
  }
  return bytes
}

/** Validate the native envelope before constructing a view over its returned endpoints. */
export const decodeEdgesResponse = (bytes: ArrayBuffer): Float32Array => {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 8) throw new TypeError("Invalid native edge response")
  const header = new DataView(bytes)
  const count = header.getUint32(4, true)
  if (header.getUint32(0, true) !== 0x314c4543 || count % 2 !== 0 || count > MAX_TRIANGLES * 6 || bytes.byteLength !== 8 + count * 12) {
    throw new TypeError("Unsupported or truncated native edge response")
  }
  return new Float32Array(bytes, 8, count * 3)
}

/** Callers keep the existing Three/Worker fallback and discard stale results before allocating GPU resources. */
export const prepareViewportEdges = async (input: ViewportEdgesInput): Promise<Float32Array> => {
  input.signal?.throwIfAborted()
  const request = encodeEdgesRequest(input)
  const response = await invoke<ArrayBuffer>("prepare_viewport_edges", request)
  // Cancellation does not pretend to stop a spawn_blocking task. Its Rust permit remains
  // owned by the computation until completion/deadline, and this side drops its stale bytes.
  input.signal?.throwIfAborted()
  return decodeEdgesResponse(response)
}
