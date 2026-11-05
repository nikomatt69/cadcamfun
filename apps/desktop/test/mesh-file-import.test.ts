import { expect, test } from "bun:test"
import { meshFileElements } from "../src/features/cad/lib/mesh-file-import.ts"

test("an OBJ file imports as mesh elements the CAD renderer accepts", async () => {
  const file = new File(["o panel\nv 10 20 30\nv 11 20 30\nv 10 21 30\nf 1 2 3\n"], "panel.obj")
  const elements = await meshFileElements(file)
  expect(elements).toHaveLength(1)
  expect(elements[0]).toMatchObject({ type: "mesh", name: "panel" })
  expect((elements[0] as { vertices: unknown[] }).vertices[0]).toEqual({ x: 10, y: 20, z: 30 })
})

test("a binary STL file imports its actual triangles", async () => {
  const buffer = new ArrayBuffer(134), data = new DataView(buffer)
  data.setUint32(80, 1, true)
  const coordinates = [0, 0, 0, 10, 0, 0, 0, 10, 0]
  coordinates.forEach((value, i) => data.setFloat32(96 + i * 4, value, true))
  const elements = await meshFileElements(new File([buffer], "triangle.stl"))
  expect((elements[0] as { faces: unknown }).faces).toEqual([[0, 1, 2]])
})

test("a file without triangles is refused instead of imported as JSON", async () => {
  await expect(meshFileElements(new File(["not a mesh"], "broken.obj"))).rejects.toThrow()
})

test("a CAD mesh above the AI attachment limit imports its full geometry", async () => {
  const count = 30_001
  const buffer = new ArrayBuffer(84 + count * 50), data = new DataView(buffer)
  data.setUint32(80, count, true)
  for (let triangle = 0; triangle < count; triangle++) {
    const start = 84 + triangle * 50 + 12
    const coords = [0, 0, 0, 1, 0, 0, 0, 1, 0]
    coords.forEach((value, i) => data.setFloat32(start + i * 4, value, true))
  }
  const elements = await meshFileElements(new File([buffer], "large.stl"))
  expect((elements[0] as { faces: unknown[] }).faces).toHaveLength(count)
  expect((elements[0] as { vertices: unknown[] }).vertices).toHaveLength(count * 3)
})

test("non-finite coordinates and out-of-range indices are rejected", async () => {
  const buffer = new ArrayBuffer(134), data = new DataView(buffer)
  data.setUint32(80, 1, true)
  data.setFloat32(96, Number.NaN, true)
  await expect(meshFileElements(new File([buffer], "invalid.stl"))).rejects.toThrow(/invalid coordinates/)
  const ply = `ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 9\n`
  await expect(meshFileElements(new File([ply], "invalid.ply"))).rejects.toThrow(/invalid vertex index/)
})

test("the CAD object budget reports a clear error before accepting too many objects", async () => {
  const groups = Array.from({ length: 501 }, (_, i) => `o part${i}\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf ${i * 3 + 1} ${i * 3 + 2} ${i * 3 + 3}`).join("\n")
  await expect(meshFileElements(new File([groups], "many.obj"))).rejects.toThrow(/500 objects/)
})

test("the CAD triangle budget refuses an oversized mesh", async () => {
  const count = 500_001
  const buffer = new ArrayBuffer(84 + count * 50)
  new DataView(buffer).setUint32(80, count, true)
  await expect(meshFileElements(new File([buffer], "oversized.stl"))).rejects.toThrow(/500000 triangles/)
})
