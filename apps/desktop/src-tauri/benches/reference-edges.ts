/** Installed Three.js reference corpus; invoked by viewport-edges.py, never shipped. */
import * as THREE from "../../node_modules/three/build/three.module.js"
import { join } from "node:path"

const directory = Bun.argv[2]
if (!directory) throw new Error("Expected a temporary output directory")
const geometries = [
  new THREE.BoxGeometry(2, 3, 4),
  new THREE.PlaneGeometry(10, 8, 4, 3),
  new THREE.SphereGeometry(3, 24, 16),
  new THREE.CylinderGeometry(1, 2, 4, 32),
  new THREE.TorusGeometry(3, .5, 16, 32),
  new THREE.BoxGeometry().scale(-1, 1, 1).translate(-.00005, .00005, 0),
  new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0, // boundary
    0, 1, 0, 1, 0, 0, 0, 0, 0, // reversed duplicate
    0, 0, 0, 0, 0, 0, 1, 1, 1, // degenerate
    0, 0, 0, 1, 0, 0, 0, 0, 1, // non-manifold
    0, 0, 0, 1, 0, 0, 2, 0, 0, // collinear
  ], 3)),
  new THREE.BoxGeometry().toNonIndexed(),
  new THREE.PlaneGeometry(100, 100, 80, 80),
]
// Seeded triangle soup exercises repeated/reversed edges and hash collisions.
let seed = 42
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000 }
const points = Float32Array.from({ length: 2700 }, () => Math.round((random() - .5) * 100) / 10)
const soup = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(points, 3))
geometries.push(soup)
const manifest = []
for (const [g, geometry] of geometries.entries()) {
  for (const angle of [0, 1, 25, 90, 180]) {
    const id = `${g}-${angle}`
    const positions = geometry.getAttribute("position").array
    const indices = geometry.getIndex()?.array
    const input = new Uint8Array(24 + positions.length * 4 + (indices?.length ?? 0) * 4)
    input.set(new TextEncoder().encode("CGE1"))
    const view = new DataView(input.buffer)
    view.setUint32(4, positions.length / 3, true)
    view.setUint32(8, indices?.length ?? 0, true)
    view.setFloat64(12, angle, true)
    for (let i = 0; i < positions.length; i++) view.setFloat32(24 + i * 4, positions[i]!, true)
    for (let i = 0; i < (indices?.length ?? 0); i++) view.setUint32(24 + positions.length * 4 + i * 4, indices![i]!, true)
    const times = []
    let expected = new Uint8Array()
    for (let i = 0; i < 4; i++) {
      const start = performance.now()
      const edges = new THREE.EdgesGeometry(geometry, angle)
      const elapsed = performance.now() - start
      if (i > 0) times.push(elapsed)
      const attribute = edges.getAttribute("position").array
      expected = new Uint8Array(8 + attribute.length * 4)
      expected.set(new TextEncoder().encode("CEL1"))
      const header = new DataView(expected.buffer)
      header.setUint32(4, attribute.length / 3, true)
      for (let n = 0; n < attribute.length; n++) header.setFloat32(8 + n * 4, attribute[n]!, true)
      edges.dispose()
    }
    times.sort((a, b) => a - b)
    await Bun.write(join(directory, `${id}.cge`), input)
    await Bun.write(join(directory, `${id}.cel`), expected)
    manifest.push({ id, vertices: positions.length / 3, triangles: (indices?.length ?? positions.length / 3) / 3, threshold: angle, three_ms_p50: times[1] })
  }
}
await Bun.write(join(directory, "manifest.json"), JSON.stringify(manifest))
