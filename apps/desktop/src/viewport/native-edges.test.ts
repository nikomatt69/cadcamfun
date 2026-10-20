import { expect, test } from "bun:test"
import * as THREE from "three"
import { createDisplayEdges } from "./native-edges.ts"
import type { ViewportEdgesInput } from "../../src-tauri/guest-js/viewport-geometry.ts"

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test("browser and small geometry keep the existing Three.js edge output", () => {
  const source = new THREE.BoxGeometry()
  const expected = new THREE.EdgesGeometry(source, 25)
  const actual = createDisplayEdges(source, 25)
  expect([...actual.getAttribute("position").array]).toEqual([...expected.getAttribute("position").array])
  actual.dispose(); expected.dispose(); source.dispose()
})

test("large mesh native completion installs endpoints and invalidates once", async () => {
  const source = new THREE.PlaneGeometry(10, 10, 40, 40)
  const expected = new THREE.EdgesGeometry(source, 25)
  const points = Float32Array.from(expected.getAttribute("position").array)
  let calls = 0, submitted: ViewportEdgesInput | undefined
  const result = createDisplayEdges(source, 25, () => { calls++ }, async (input) => { submitted = input; return points })
  expect((result.getAttribute("position")?.count ?? 0)).toBe(0)
  expect(result.getAttribute("position")).toBeUndefined()
  // Fit-to-scene may compute an empty box before the asynchronous result arrives.
  result.computeBoundingBox()
  await settle()
  expect(submitted?.positions === source.getAttribute("position").array).toBe(true)
  expect(submitted?.thresholdAngle).toBe(25)
  expect(result.getAttribute("position").array).toBe(points)
  expect(result.boundingBox?.isEmpty()).toBe(false)
  expect(calls).toBe(1)
  result.dispose(); expected.dispose(); source.dispose()
})

test("native errors take the same Three.js fallback", async () => {
  const source = new THREE.PlaneGeometry(10, 10, 40, 40)
  const expected = new THREE.EdgesGeometry(source, 1)
  let calls = 0
  const result = createDisplayEdges(source, 1, () => { calls++ }, async () => { throw new Error("viewport_busy") })
  await settle()
  expect([...result.getAttribute("position").array]).toEqual([...expected.getAttribute("position").array])
  expect(calls).toBe(1)
  result.dispose(); expected.dispose(); source.dispose()
})

test("disposing either source or target drops late success and fallback", async () => {
  for (const disposeSource of [false, true]) for (const fail of [false, true]) {
    const source = new THREE.PlaneGeometry(10, 10, 40, 40)
    let resolve!: (points: Float32Array) => void, reject!: (reason: Error) => void
    let signal: AbortSignal | undefined, calls = 0
    const result = createDisplayEdges(source, 25, () => { calls++ }, (input) => {
      signal = input.signal
      return new Promise<Float32Array>((yes, no) => { resolve = yes; reject = no })
    })
    if (disposeSource) source.dispose(); else result.dispose()
    expect(signal?.aborted).toBe(true)
    if (fail) reject(new Error("late timeout")); else resolve(new Float32Array([0, 0, 0, 1, 0, 0]))
    await settle()
    expect((result.getAttribute("position")?.count ?? 0)).toBe(0)
    expect(calls).toBe(0)
    result.dispose(); source.dispose()
  }
})

test("replaced or updated source attributes invalidate both late success and fallback", async () => {
  for (const replace of [false, true]) for (const fail of [false, true]) {
    const source = new THREE.PlaneGeometry(10, 10, 40, 40)
    let resolve!: (points: Float32Array) => void, reject!: (reason: Error) => void
    let calls = 0
    const result = createDisplayEdges(source, 25, () => { calls++ }, () =>
      new Promise<Float32Array>((yes, no) => { resolve = yes; reject = no }))
    const positions = source.getAttribute("position")
    if (replace) source.setAttribute("position", positions.clone())
    else positions.needsUpdate = true
    if (fail) reject(new Error("old request")); else resolve(new Float32Array([0, 0, 0, 1, 0, 0]))
    await settle()
    expect((result.getAttribute("position")?.count ?? 0)).toBe(0)
    expect(calls).toBe(0)
    result.dispose(); source.dispose()
  }
})

test("an assembly admits one IPC preparation before packing and keeps busy meshes on Three.js", async () => {
  const source = new THREE.PlaneGeometry(10, 10, 40, 40)
  let resolve!: (points: Float32Array) => void, calls = 0
  const prepare = () => { calls++; return new Promise<Float32Array>((yes) => { resolve = yes }) }
  const first = createDisplayEdges(source, 25, () => {}, prepare)
  const second = createDisplayEdges(source, 25, () => {}, prepare)
  expect(calls).toBe(1)
  expect(second).toBeInstanceOf(THREE.EdgesGeometry)
  first.dispose()
  resolve(new Float32Array())
  await settle()
  const third = createDisplayEdges(source, 25, () => {}, async () => new Float32Array())
  expect(third).not.toBeInstanceOf(THREE.EdgesGeometry)
  await settle()
  second.dispose(); third.dispose(); source.dispose()
})
