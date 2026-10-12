import { BufferGeometry, Mesh, Object3D, Vector3 } from "three"

const MAX_TRIANGLES = 30_000
/** Decode actual uploaded geometry with the renderer's own parsers, preserving object transforms. */
export const meshAttachment = async (file: Pick<File, "name" | "arrayBuffer" | "text">) => {
  const extension = file.name.split(".").at(-1)?.toLowerCase()
  let root: Object3D
  if (extension === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js")
    root = new Mesh(new STLLoader().parse(await file.arrayBuffer()))
  } else if (extension === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js")
    root = new OBJLoader().parse(await file.text())
  } else if (extension === "ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js")
    root = new Mesh(new PLYLoader().parse(await file.arrayBuffer()))
  } else throw new Error("Unsupported mesh format.")
  root.updateMatrixWorld(true)
  const elements: Array<Record<string, unknown>> = []
  let triangles = 0
  try {
    root.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return
      const geometry = object.geometry
      const position = geometry.getAttribute("position")
      const index = geometry.getIndex()
      if (!position || position.count === 0) return
      const count = index?.count ?? position.count
      if (count % 3 !== 0 || count === 0) throw new Error("The file does not contain triangle geometry.")
      triangles += count / 3
      if (triangles > MAX_TRIANGLES || position.count > MAX_TRIANGLES * 3) throw new Error(`Mesh exceeds ${MAX_TRIANGLES} triangles. Simplify the source model before attaching it.`)
      const vertices: Array<{ x: number; y: number; z: number }> = []
      const point = new Vector3()
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld)
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("The mesh contains invalid coordinates.")
        vertices.push({ x: point.x, y: point.y, z: point.z })
      }
      const faces: number[][] = []
      for (let i = 0; i < count; i += 3) faces.push([index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2])
      elements.push({ type: "mesh", name: object.name || file.name, vertices, faces })
    })
    if (elements.length === 0) throw new Error("No triangle mesh was found in the file.")
    if (elements.length > 40) throw new Error("The mesh contains more than 40 objects. Split the source assembly before attaching it.")
    return JSON.stringify({ format: "cadcamfun-mesh", source: { name: file.name, format: extension, units: "source units; specify scale to mm when importing" }, elements })
  } finally {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
  }
}
