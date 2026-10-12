import { expect, test } from "bun:test"
import { meshAttachment } from "../src/features/ai/lib/mesh-attachment.ts"
import { normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
test("real OBJ loader preserves vertex coordinates and valid triangles for the existing CAD renderer", async () => {
  const file = new File(["o panel\nv 10 20 30\nv 11 20 30\nv 10 21 30\nf 1 2 3\n"], "panel.obj")
  const result = JSON.parse(await meshAttachment(file))
  expect(result.elements).toHaveLength(1)
  expect(result.elements[0].vertices[0]).toEqual({ x: 10, y: 20, z: 30 })
  expect(normalizeElement(result.elements[0]).ok).toBe(true)
})
test("real binary STL loader decodes actual uploaded triangles", async () => {
  const buffer = new ArrayBuffer(134), data = new DataView(buffer)
  data.setUint32(80, 1, true)
  const coordinates = [0, 0, 0, 10, 0, 0, 0, 10, 0]
  coordinates.forEach((value, i) => data.setFloat32(96 + i * 4, value, true))
  const result = JSON.parse(await meshAttachment(new File([buffer], "triangle.stl")))
  expect(result.elements[0].faces).toEqual([[0, 1, 2]])
  expect(result.elements[0].vertices[1].x).toBe(10)
})
