import { expect, test } from "bun:test"
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import {
  LINE_SEGMENT_BUDGET, LineBudget, createDisplayEdgeLines, createLines, isThickLine, lineVertexCount, polylineToSegments, setLineDrawRange, syncLineResolution
} from "./lines.ts"

const square = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0])

test("budget grants what fits, refuses the rest, and gives a share back once", () => {
  const budget = new LineBudget(10)
  const a = budget.acquire(6)!
  expect(budget.used).toBe(6)
  expect(budget.acquire(5)).toBeUndefined()
  const b = budget.acquire(4)!
  expect(budget.remaining).toBe(0)
  a(); a()
  expect(budget.used).toBe(4)
  b()
  expect(budget.used).toBe(0)
  expect(budget.acquire(-1)).toBeUndefined()
})

test("polyline points become segment endpoints, open or closed", () => {
  const open = polylineToSegments([0, 0, 0, 1, 0, 0, 1, 1, 0])
  expect([...open]).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0])
  const closed = polylineToSegments([0, 0, 0, 1, 0, 0, 1, 1, 0], true)
  expect(closed.length).toBe(18)
  expect([...closed.slice(12)]).toEqual([1, 1, 0, 0, 0, 0])
  expect(polylineToSegments([1, 2, 3]).length).toBe(0)
})

test("standard quality draws thick lines that share the endpoint buffer, with a colour per vertex", () => {
  const budget = new LineBudget(100)
  const colors = new Float32Array(square.length).fill(0.5)
  const line = createLines(square, { colors, width: 3 }, { quality: "standard", budget })
  expect(isThickLine(line)).toBe(true)
  expect(budget.used).toBe(4)
  const thick = line as ReturnType<typeof createLines> & { geometry: { attributes: Record<string, { count: number; data: { array: Float32Array } }>; instanceCount: number } }
  expect(thick.geometry.attributes.instanceStart!.count).toBe(4)
  expect(thick.geometry.attributes.instanceStart!.data.array).toBe(square)
  expect(thick.geometry.attributes.instanceColorStart!.count).toBe(4)
  const material = line.material as LineMaterial
  expect(material.vertexColors).toBe(true)
  expect(material.linewidth).toBe(3)
  expect(lineVertexCount(line)).toBe(8)
  line.geometry.dispose()
  expect(budget.used).toBe(0)
})

test("low quality, an exhausted budget and an oversized line fall back to the 1 px line, colours and dashes kept", () => {
  const colors = new Float32Array(square.length).fill(1)
  const low = createLines(square, { colors }, { quality: "low", budget: new LineBudget(1000) })
  expect(isThickLine(low)).toBe(false)
  expect(low.geometry.getAttribute("color").count).toBe(8)
  expect((low.material as THREE.LineBasicMaterial).vertexColors).toBe(true)
  const full = createLines(square, {}, { quality: "high", budget: new LineBudget(3) })
  expect(isThickLine(full)).toBe(false)
  const huge = new Float32Array(6 * (LINE_SEGMENT_BUDGET.standard.perObject + 1))
  expect(isThickLine(createLines(huge, {}, { quality: "standard", budget: new LineBudget(10_000_000) }))).toBe(false)
  const dashed = createLines(square, { dash: { dash: 2, gap: 1 } }, { quality: "low" })
  expect(dashed.material).toBeInstanceOf(THREE.LineDashedMaterial)
  expect(dashed.geometry.getAttribute("lineDistance").count).toBe(8)
})

test("dashed thick lines carry the dash pattern and cumulative distances", () => {
  const line = createLines(square, { dash: { dash: 2, gap: 1 } }, { quality: "standard", budget: new LineBudget(100) })
  const material = line.material as LineMaterial
  expect(material.dashed).toBe(true)
  expect(material.dashSize).toBe(2)
  expect(material.gapSize).toBe(1)
  const end = line.geometry.attributes.instanceDistanceEnd!
  expect(end.getX(3)).toBeCloseTo(4, 6)
})

test("resolution follows the viewport for every thick line under a root, and skips the rest", () => {
  const root = new THREE.Group()
  const budget = new LineBudget(100)
  const thick = createLines(square, {}, { quality: "standard", budget })
  root.add(thick, createLines(square, {}, { quality: "low" }))
  syncLineResolution(root, 800, 600)
  expect((thick.material as LineMaterial).resolution.toArray()).toEqual([800, 600])
  syncLineResolution(root, 0, 0)
  expect((thick.material as LineMaterial).resolution.toArray()).toEqual([1, 1])
})

test("draw range grows a thick and a plain line by vertices and reports changes", () => {
  const thick = createLines(square, {}, { quality: "standard", budget: new LineBudget(100) })
  const plain = createLines(square, {}, { quality: "low" })
  for (const line of [thick, plain]) {
    expect(setLineDrawRange(line, 4)).toBe(true)
    expect(setLineDrawRange(line, 4)).toBe(false)
    expect(setLineDrawRange(line, Infinity)).toBe(true)
    expect(setLineDrawRange(line, Infinity)).toBe(false)
  }
  setLineDrawRange(thick, 4)
  expect((thick as unknown as { geometry: { instanceCount: number } }).geometry.instanceCount).toBe(2)
  setLineDrawRange(thick, 99)
  expect((thick as unknown as { geometry: { instanceCount: number } }).geometry.instanceCount).toBe(4)
})

test("lines are not pickable unless asked", () => {
  const hidden = createLines(square, {}, { quality: "low" })
  const picked = createLines(square, {}, { quality: "low", pickable: true })
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0.5, 0, 1), new THREE.Vector3(0, 0, -1))
  raycaster.params.Line = { threshold: 0.1 }
  const hits: THREE.Intersection[] = []
  hidden.raycast(raycaster, hits)
  expect(hits.length).toBe(0)
  picked.raycast(raycaster, hits)
  expect(hits.length).toBeGreaterThan(0)
})

test("display edges become one thick line in a group, in the small and in the deferred native case", async () => {
  const budget = new LineBudget(1000)
  const box = new THREE.BoxGeometry(1, 1, 1)
  const group = createDisplayEdgeLines(box, 25, undefined, {}, { quality: "standard", budget })
  expect(group.children.length).toBe(1)
  expect(lineVertexCount(group.children[0]!)).toBe(24)

  // Deferred: a big mesh whose edges arrive later (native prepare); the group fills itself in and calls back once.
  const plane = new THREE.PlaneGeometry(10, 10, 40, 40)
  const expected = new THREE.EdgesGeometry(plane, 25)
  const points = Float32Array.from(expected.getAttribute("position").array)
  let calls = 0
  const deferred = createDisplayEdgeLines(plane, 25, () => { calls++ }, {}, { quality: "standard", budget }, async () => points)
  expect(deferred.children.length).toBe(0)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  expect(deferred.children.length).toBe(1)
  expect(lineVertexCount(deferred.children[0]!)).toBe(points.length / 3)
  expect(calls).toBe(1)
})
