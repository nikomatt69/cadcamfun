import { describe, expect, test } from "bun:test"
import { cad, sceneToIges, sceneToStep } from "@cadcamfun/core"
import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { readCadFile } from "../src/features/cad/lib/cad-file-import.ts"

const drawing = (content: unknown) => new File([JSON.stringify(content)], "drawing.cadcam")
const binaryGlb = (external = false, mirrored = false): ArrayBuffer => {
  const document = {
    asset: { version: "2.0" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ translation: [10, 0, 0], children: [1] }, { translation: [0, 2, 0], scale: [mirrored ? -2 : 2, 2, 2], mesh: 0 }],
    meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 42, ...(external ? { uri: "external.bin" } : {}) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }]
  }
  const json = new TextEncoder().encode(JSON.stringify(document)), jsonSize = (json.length + 3) & ~3
  const buffer = new ArrayBuffer(12 + 8 + jsonSize + 8 + 44), bytes = new Uint8Array(buffer), view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + jsonSize); bytes.set(json, 20)
  const bin = 20 + jsonSize
  view.setUint32(bin, 44, true); view.setUint32(bin + 4, 0x004e4942, true)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((n, i) => view.setFloat32(bin + 8 + i * 4, n, true))
  ;[0, 1, 2].forEach((n, i) => view.setUint16(bin + 44 + i * 2, n, true))
  return buffer
}

describe("CAD file import", () => {
  test("drawing copies receive unique IDs, preserve element references and use the current layer", async () => {
    const file = drawing({ elements: [
      { id: "one", type: "cube", layerId: "foreign", elementId: "two", operands: ["two"], history: { id: "one" } },
      { id: "two", type: "group", layerId: "foreign", elements: [{ id: "child", type: "cube", sourceElementId: "one" }] }
    ] })
    const first = await readCadFile(file), second = await readCadFile(file)
    expect(first.elements).toHaveLength(2)
    expect(first.elements[0]!.id).not.toBe("one")
    expect(first.elements[0]!.id).not.toBe(second.elements[0]!.id)
    expect(first.elements[0]!.elementId).toBe(first.elements[1]!.id)
    expect(first.elements[0]!.operands).toEqual([first.elements[1]!.id])
    expect(first.elements[0]!.layerId).toBeUndefined()
    expect(first.elements[0]!.history).toEqual({ id: "one" })
    const child = (first.elements[1]!.elements as Record<string, unknown>[])[0]!
    expect(child.id).not.toBe("child")
    expect(child.sourceElementId).toBe(first.elements[0]!.id)
  })

  test("invalid JSON, invalid geometry, duplicate IDs and unsupported native CAD files are explicit failures", async () => {
    await expect(readCadFile(new File(["{"], "bad.json"))).rejects.toThrow(/valid JSON/)
    await expect(readCadFile(drawing({ elements: [{}] }))).rejects.toThrow(/valid CAD elements/)
    await expect(readCadFile(drawing({ elements: [{ id: "same", type: "cube" }, { id: "same", type: "cube" }] }))).rejects.toThrow(/duplicate/)
    await expect(readCadFile(drawing({ elements: [{ id: "cut", type: "boolean-subtract", operands: ["external", "unknown"] }] }))).rejects.toThrow(/operand 'external'.*not in/)
    await expect(readCadFile(new File([""], "part.SLDPRT"))).rejects.toThrow(/SolidWorks native files are not supported/)
    await expect(readCadFile(new File([""], "assembly.SLDASM"))).rejects.toThrow(/assembly placements/)
  })

  test("a duplicated drawing keeps Boolean operands attached to their imported bodies", async () => {
    const imported = await readCadFile(drawing({ elements: [
      { id: "plate", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
      { id: "hole", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
      { id: "cut", type: "boolean-subtract", operands: ["plate", "hole"], name: "drilled plate" }
    ] }))
    const exported = sceneToStep(imported.elements)
    expect(exported.parts.map((part) => [part.name, part.exact, part.valid])).toEqual([["drilled plate", true, true]])
    expect(exported.skipped).toEqual([])
  })

  test("OBJ and 3MF decode their triangles, with 3MF units and build transforms applied", async () => {
    const obj = await readCadFile(new File(["o part\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "part.OBJ"))
    expect(obj.elements[0]).toMatchObject({ type: "mesh", name: "part", faces: [[0, 1, 2]] })
    const bytes = cad.exchange.write3mf([{ name: "plate", mesh: { positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 2, 0]), indices: Uint32Array.from([0, 1, 2]) }, transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30] }], { unit: "inch" })
    const result = await readCadFile(new File([new Uint8Array(bytes).buffer], "parts.3mf"))
    expect(result.elements[0]).toMatchObject({ type: "mesh", name: "plate", faces: [[0, 1, 2]] })
    const vertices = result.elements[0]!.vertices as Array<{ x: number; y: number; z: number }>
    for (const [i, p] of [{ x: 10, y: 20, z: 30 }, { x: 11, y: 20, z: 30 }, { x: 10, y: 22, z: 30 }].entries()) {
      expect(vertices[i]!.x).toBeCloseTo(p.x, 6); expect(vertices[i]!.y).toBeCloseTo(p.y, 6); expect(vertices[i]!.z).toBeCloseTo(p.z, 6)
    }
  })

  test("binary STL and ASCII PLY decode actual triangle coordinates", async () => {
    const binary = new ArrayBuffer(134), view = new DataView(binary)
    view.setUint32(80, 1, true)
    ;[0, 0, 0, 5, 0, 0, 0, 6, 0].forEach((value, i) => view.setFloat32(96 + i * 4, value, true))
    const stl = await readCadFile(new File([binary], "triangle.STL"))
    const ply = await readCadFile(new File(["ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n5 0 0\n0 6 0\n3 0 1 2\n"], "triangle.ply"))
    for (const file of [stl, ply]) {
      expect(file.elements[0]).toMatchObject({ type: "mesh", faces: [[0, 1, 2]], vertices: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 0, y: 6, z: 0 }] })
    }
  })

  test("DXF drawings are routed to the vector importer", async () => {
    const text = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nprofile\n10\n0\n20\n0\n11\n8\n21\n3\n0\nENDSEC\n0\nEOF\n"
    const result = await readCadFile(new File([text], "profile.dxf"))
    expect(result.elements[0]).toMatchObject({ type: "line", x1: 0, y1: 0, x2: 8, y2: 3, sourceLayer: "profile" })
    expect(result.warnings.some((warning) => warning.includes("active CAD layer"))).toBe(true)
  })

  test("GLB meshes bake the scene's nested world transforms into their vertices", async () => {
    const result = await readCadFile(new File([binaryGlb()], "model.glb"))
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0]).toMatchObject({ type: "mesh", name: "triangle", faces: [[0, 1, 2]], vertices: [{ x: 10, y: 2, z: 0 }, { x: 12, y: 2, z: 0 }, { x: 10, y: 4, z: 0 }] })
    expect(result.warnings).toEqual([expect.stringContaining("verify the scale")])
  })

  test("GLB refuses missing external resources before the loader attempts to fetch them", async () => {
    await expect(readCadFile(new File([binaryGlb(true)], "external.glb"))).rejects.toThrow(/external resource 'external\.bin'/)
    await expect(readCadFile(new File(["broken"], "broken.glb"))).rejects.toThrow(/truncated/)
  })

  test("a mirrored GLB preserves face winding after its reflection is baked", async () => {
    const result = await readCadFile(new File([binaryGlb(false, true)], "mirrored.glb"))
    expect(result.elements[0]).toMatchObject({ faces: [[0, 2, 1]], vertices: [{ x: 10, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }, { x: 10, y: 4, z: 0 }] })
  })

  test("a GLB exported from a CAD scene can be imported at the same world position", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "FileReader")
    class TestFileReader {
      result: ArrayBuffer | null = null
      onloadend: (() => void) | null = null
      readAsArrayBuffer(blob: Blob): void { void blob.arrayBuffer().then((bytes) => { this.result = bytes; this.onloadend?.() }) }
    }
    Object.defineProperty(globalThis, "FileReader", { value: TestFileReader, configurable: true, writable: true })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    const material = new THREE.MeshBasicMaterial(), scene = new THREE.Scene()
    const parent = new THREE.Group(), mesh = new THREE.Mesh(geometry, material)
    mesh.name = "part"; parent.position.set(10, 20, 30); mesh.position.set(1, 2, 3); scene.add(parent); parent.add(mesh)
    try {
      const exported = await new GLTFExporter().parseAsync(scene, { binary: true })
      if (!(exported instanceof ArrayBuffer)) throw new Error("Expected a binary GLB")
      const imported = await readCadFile(new File([exported], "part.glb"))
      expect(imported.elements[0]).toMatchObject({ name: "part", type: "mesh", vertices: [{ x: 11, y: 22, z: 33 }, { x: 12, y: 22, z: 33 }, { x: 11, y: 23, z: 33 }] })
    } finally {
      geometry.dispose(); material.dispose()
      if (original) Object.defineProperty(globalThis, "FileReader", original)
      else Reflect.deleteProperty(globalThis, "FileReader")
    }
  })

  test("STEP and IGES retain exact bodies through the shared readers", async () => {
    const source = [{ id: "box", name: "box", type: "cube", width: 10, height: 12, depth: 4, x: 0, y: 0, z: 0 }]
    const step = sceneToStep(source).step!, iges = sceneToIges(source).iges!
    for (const [name, contents] of [["part.stp", step], ["part.igs", iges]] as const) {
      const imported = await readCadFile(new File([contents], name))
      expect(imported.elements).toHaveLength(1)
      expect(imported.elements[0]).toMatchObject({ type: "brep", name: "box" })
      expect(imported.warnings).toEqual([])
    }
  })
})
