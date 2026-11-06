import { BufferGeometry, Line, Mesh, Object3D, Points, Vector3 } from "three"

// CAD imports are not model-context attachments: they need a larger, independently bounded geometry budget.
const MAX_TRIANGLES = 500_000
const MAX_OBJECTS = 500
const MAX_VERTICES = MAX_TRIANGLES * 3

/** Decode STL, OBJ or PLY geometry into CAD mesh elements; coordinates remain in the source file's units. */
export const meshFileElements = async (
  file: Pick<File, "name" | "arrayBuffer" | "text">
): Promise<ReadonlyArray<Record<string, unknown>>> => {
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

  const elements: Array<Record<string, unknown>> = []
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<import("three").Material>()
  let triangles = 0, verticesTotal = 0
  try {
    root.updateMatrixWorld(true)
    root.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return
      const geometry = object.geometry
      const position = geometry.getAttribute("position")
      const index = geometry.getIndex()
      if (!position || position.count === 0) return
      if (position.itemSize < 3 || !Number.isSafeInteger(position.count)) throw new Error("The mesh contains invalid vertex data.")
      const count = index?.count ?? position.count
      if (!Number.isSafeInteger(count) || count === 0 || count % 3 !== 0) throw new Error("The file does not contain triangle geometry.")
      triangles += count / 3
      verticesTotal += position.count
      if (triangles > MAX_TRIANGLES) throw new Error(`Mesh exceeds the CAD import limit of ${MAX_TRIANGLES} triangles.`)
      if (verticesTotal > MAX_VERTICES) throw new Error(`Mesh exceeds the CAD import limit of ${MAX_VERTICES} vertices.`)
      if (elements.length >= MAX_OBJECTS) throw new Error(`Mesh exceeds the CAD import limit of ${MAX_OBJECTS} objects.`)
      const vertices: Array<{ x: number; y: number; z: number }> = []
      const point = new Vector3()
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld)
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("The mesh contains invalid coordinates.")
        vertices.push({ x: point.x, y: point.y, z: point.z })
      }
      const faces: number[][] = []
      for (let i = 0; i < count; i += 3) {
        const face = [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2]
        if (face.some((n) => !Number.isSafeInteger(n) || n < 0 || n >= position.count)) throw new Error("The mesh contains an invalid vertex index.")
        faces.push(face)
      }
      elements.push({ type: "mesh", name: object.name || file.name, vertices, faces })
    })
    if (elements.length === 0) throw new Error("No triangle mesh was found in the file.")
    return elements
  } finally {
    root.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof Line) && !(object instanceof Points)) return
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  }
}
