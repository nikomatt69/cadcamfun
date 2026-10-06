import { meshOf, type Solid } from "@cadcamfun/core"

self.onmessage = (event: MessageEvent<{ id: number; solid: Solid }>) => {
  try {
    const mesh = meshOf(event.data.solid, .1)
    self.postMessage({ id: event.data.id, positions: mesh.positions, indices: mesh.indices }, { transfer: [mesh.positions.buffer, mesh.indices.buffer] })
  } catch (cause) {
    self.postMessage({ id: event.data.id, error: String(cause) })
  }
}
