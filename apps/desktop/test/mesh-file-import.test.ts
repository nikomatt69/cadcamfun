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
