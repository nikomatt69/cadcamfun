/** Decode one CAD file for the drawing importer. A batch can report failures independently. */
import { cad, igesToElements, stepToElements } from "@cadcamfun/core"
import { BufferGeometry, InstancedMesh, Line, Mesh, Points, SkinnedMesh, Texture, Vector3 } from "three"
import { meshFileElements } from "./mesh-file-import.ts"

export interface CadFileContent {
  readonly elements: ReadonlyArray<Record<string, unknown>>
  readonly warnings: ReadonlyArray<string>
}

type CadFile = Pick<File, "name" | "text" | "arrayBuffer">
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** Check external dependencies before the loader can attempt a network or filesystem request. */
const checkGlb = (buffer: ArrayBuffer): void => {
  if (buffer.byteLength < 20) throw new Error("The GLB file is truncated.")
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error("The file is not a valid glTF 2.0 binary (GLB).")
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || length > buffer.byteLength - 20) throw new Error("The GLB JSON chunk is invalid or truncated.")
  let document: unknown
  try { document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)).trim()) } catch { throw new Error("The GLB JSON chunk is invalid.") }
  if (!record(document)) throw new Error("The GLB JSON chunk is invalid.")
  for (const group of [document.buffers, document.images]) {
    if (!Array.isArray(group)) continue
    for (const resource of group) {
      if (record(resource) && typeof resource.uri === "string" && !resource.uri.startsWith("data:")) {
        throw new Error(`The GLB refers to an external resource '${resource.uri}'. Embed its resources before importing.`)
      }
    }
  }
}

/** GLB is a display mesh, not the exact surfaces or feature history of a CAD solid. */
const glbElements = async (file: CadFile): Promise<CadFileContent> => {
  const buffer = await file.arrayBuffer()
  checkGlb(buffer)
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
  const gltf = await new GLTFLoader().parseAsync(buffer, "")
  const root = gltf.scene
  root.updateMatrixWorld(true)
  const elements: Array<Record<string, unknown>> = []
  let ignoredObjects = false
  try {
    root.traverse((object) => {
      if (object instanceof SkinnedMesh || object instanceof InstancedMesh) throw new Error("GLB skinned or instanced meshes are not supported; export them as static meshes first.")
      if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) {
        if (object instanceof Line || object instanceof Points) ignoredObjects = true
        return
      }
      const geometry = object.geometry, position = geometry.getAttribute("position"), index = geometry.getIndex()
      if (Object.values(geometry.morphAttributes).some((attributes) => attributes.length > 0)) throw new Error("GLB morph targets are not supported; export the desired shape as a static mesh first.")
      if (!position || position.itemSize < 3 || position.count === 0) throw new Error("A GLB mesh has no vertex positions.")
      const count = index?.count ?? position.count
      if (count === 0 || count % 3 !== 0) throw new Error("A GLB mesh does not contain triangles.")
      const point = new Vector3()
      const vertices = Array.from({ length: position.count }, (_, i) => {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld)
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("The GLB contains invalid vertex coordinates.")
        return { x: point.x, y: point.y, z: point.z }
      })
      const reflected = object.matrixWorld.determinant() < 0
      const faces = Array.from({ length: count / 3 }, (_, i) => {
        const face = [0, 1, 2].map((j) => index ? index.getX(i * 3 + j) : i * 3 + j)
        if (face.some((n) => !Number.isInteger(n) || n < 0 || n >= vertices.length)) throw new Error("The GLB contains an invalid triangle index.")
        // A reflected world transform changes handedness; preserve the displayed face orientation after baking it.
        if (reflected) [face[1], face[2]] = [face[2]!, face[1]!]
        return face
      })
      elements.push({ type: "mesh", name: object.name || file.name, vertices, faces })
    })
    if (elements.length === 0) throw new Error("The GLB contains no triangle mesh.")
    const source: unknown = gltf.parser.json
    return { elements, warnings: [
      "GLB coordinates were used as millimetres without changing axes; verify scale and orientation. Imported geometry is a mesh.",
      ...(record(source) && Array.isArray(source.materials) && source.materials.length > 0 ? ["GLB materials and textures were not imported; only mesh geometry is retained."] : []),
      ...(gltf.animations.length > 0 ? ["GLB animations were not imported; the static scene is shown."] : []),
      ...(ignoredObjects ? ["GLB points or lines were skipped; only triangle meshes were imported."] : [])
    ] }
  } finally {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
        material.dispose()
      }
    })
  }
}

/** Only CAD element identities are replaced; ids in a parametric history belong to that history. */
const copyDrawingElements = (input: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(input) || input.length === 0 || input.some((e) => !record(e) || typeof e.type !== "string" || !e.type)) {
    throw new Error("The drawing does not contain valid CAD elements.")
  }
  const roots = structuredClone(input) as Record<string, unknown>[]
  const nodes: Record<string, unknown>[] = []
  const visit = (node: Record<string, unknown>): void => {
    nodes.push(node)
    const data = record(node.data) ? node.data : undefined
    const geometry = data && record(data.geometry) ? data.geometry : undefined
    // Match the child storage variants accepted by the CAD renderer.
    for (const children of [node.elements, data?.elements, geometry?.elements]) {
      if (!Array.isArray(children)) continue
      for (const child of children) {
        if (!record(child) || typeof child.type !== "string" || !child.type) throw new Error("The drawing contains an invalid child element.")
        visit(child)
      }
    }
  }
  roots.forEach(visit)
  const ids = new Map<string, string>()
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id) continue
    if (ids.has(node.id)) throw new Error(`The drawing has a duplicate element ID '${node.id}'.`)
    ids.set(node.id, crypto.randomUUID())
  }
  const references = /^(?:elementId|elementIds|parentElementId|sourceElementId|targetElementId|sourceIds|originalElements|operands)$/i
  const geometryData = new Set(["history", "vertices", "faces", "positions", "indices", "brep"])
  const remap = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(remap); return }
    if (!record(value)) return
    for (const [key, item] of Object.entries(value)) {
      if (references.test(key)) {
        // A dangling Boolean operand must never bind accidentally to a pre-existing drawing element with the same id.
        if (key === "operands" && Array.isArray(item)) {
          const missing = item.find((id) => typeof id !== "string" || !ids.has(id))
          if (missing !== undefined) throw new Error(`A Boolean operand '${String(missing)}' is not in the imported drawing.`)
        }
        if (typeof item === "string") value[key] = ids.get(item) ?? item
        else if (Array.isArray(item)) value[key] = item.map((id) => typeof id === "string" ? ids.get(id) ?? id : id)
      } else if (!geometryData.has(key)) remap(item)
    }
  }
  roots.forEach(remap)
  for (const node of nodes) {
    node.id = typeof node.id === "string" ? ids.get(node.id) ?? crypto.randomUUID() : crypto.randomUUID()
  }
  // A file's layers may not exist in the current drawing. The store assigns the active layer.
  for (const root of roots) delete root.layerId
  return roots
}

/** Unsupported or malformed files throw; the caller can continue importing the rest of a folder. */
export const readCadFile = async (file: CadFile): Promise<CadFileContent> => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (extension === "stl" || extension === "obj" || extension === "ply") {
    return { elements: await meshFileElements(file), warnings: ["Mesh coordinates were used as millimetres; verify the scale because this format may not specify units."] }
  }
  if (extension === "glb") return glbElements(file)
  if (extension === "dxf" || extension === "svg") {
    const { vectorFileElements } = await import("./vector-file-import.ts")
    return vectorFileElements(file)
  }
  if (extension === "3mf") {
    const meshes = cad.exchange.read3mfMeshes(new Uint8Array(await file.arrayBuffer()))
    if (meshes.length === 0) throw new Error("The 3MF file contains no mesh.")
    const elements = meshes.map(({ name, mesh }) => {
      if (mesh.positions.length === 0 || mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) throw new Error(`The 3MF object '${name}' has no triangle mesh.`)
      const vertices = Array.from({ length: mesh.positions.length / 3 }, (_, i) => ({ x: mesh.positions[i * 3]!, y: mesh.positions[i * 3 + 1]!, z: mesh.positions[i * 3 + 2]! }))
      const faces = Array.from({ length: mesh.indices.length / 3 }, (_, i) => [mesh.indices[i * 3]!, mesh.indices[i * 3 + 1]!, mesh.indices[i * 3 + 2]!])
      return { type: "mesh", name, vertices, faces }
    })
    return { elements, warnings: [] }
  }
  if (extension === "step" || extension === "stp" || extension === "iges" || extension === "igs") {
    const result = extension === "step" || extension === "stp" ? stepToElements(await file.text()) : igesToElements(await file.text())
    const warnings = [...result.warnings, ...result.report.filter((part) => !part.valid).map((part) => `${part.name}: ${part.issues.join("; ")}`)]
    if (result.elements.length === 0) throw new Error(["The file contains no readable solid.", ...warnings].join("\n"))
    return { elements: result.elements.map((element) => ({ ...element })), warnings }
  }
  if (extension === "json" || extension === "cad" || extension === "cadcam") {
    let input: unknown
    try { input = JSON.parse(await file.text()) } catch { throw new Error("The drawing is not valid JSON.") }
    if (!record(input)) throw new Error("The file is not a CAD drawing.")
    return { elements: copyDrawingElements(input.elements), warnings: [] }
  }
  if (extension === "sldprt" || extension === "sldasm" || extension === "slddrw") {
    throw new Error("SolidWorks native files are not supported. Export STEP or use the supplied STL files; STL files do not preserve assembly placements.")
  }
  throw new Error(`Unsupported file format${extension ? ` '.${extension}'` : ""}.`)
}
