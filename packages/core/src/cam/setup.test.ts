import { expect, test } from "bun:test"
import { validateSetup, validateWorkFrame, workToWorld, worldToWork, type ManufacturingSetup, type WorkFrame } from "./setup.ts"

const frame: WorkFrame = {
  origin: { x: 20, y: -30, z: 40 },
  xAxis: { x: 0, y: 1, z: 0 }, yAxis: { x: -1, y: 0, z: 0 }, zAxis: { x: 0, y: 0, z: 1 }
}
const setup: ManufacturingSetup = {
  id: "setup-1", revision: 0, frame,
  stock: { minX: 0, maxX: 100, minY: 0, maxY: 80, minZ: -20, maxZ: 0 },
  fixtures: [], tools: [{ toolId: "1", cuttingDiameter: 6, cuttingLength: 20, stickout: 30, holderDiameter: 40, holderLength: 60 }]
}

test("rigid work coordinates rotate and translate without unit changes", () => {
  expect(workToWorld(frame, { x: 1, y: 2, z: 3 })).toEqual({ x: 18, y: -29, z: 43 })
  for (let i = -100; i <= 100; i++) {
    const point = { x: i * 0.123, y: i * -0.37, z: i * 9.1 }
    const roundtrip = worldToWork(frame, workToWorld(frame, point))
    expect(roundtrip.x).toBeCloseTo(point.x, 10)
    expect(roundtrip.y).toBeCloseTo(point.y, 10)
    expect(roundtrip.z).toBeCloseTo(point.z, 10)
  }
})

test("left-handed, scaled, skewed and non-finite frames fail closed", () => {
  for (const bad of [
    { ...frame, zAxis: { x: 0, y: 0, z: -1 } },
    { ...frame, xAxis: { x: 0, y: 2, z: 0 } },
    { ...frame, xAxis: frame.yAxis },
    { ...frame, origin: { x: NaN, y: 0, z: 0 } }
  ]) {
    expect(validateWorkFrame(bad).length).toBeGreaterThan(0)
    expect(() => workToWorld(bad, { x: 0, y: 0, z: 0 })).toThrow(RangeError)
  }
  expect(() => worldToWork(frame, { x: Infinity, y: 0, z: 0 })).toThrow(RangeError)
})

test("setup validates revision, stock, fixture IDs and tool assemblies", () => {
  expect(validateSetup(setup)).toEqual([])
  expect(validateSetup({ ...setup, revision: -1 })).toHaveLength(1)
  expect(validateSetup({ ...setup, stock: { ...setup.stock, minX: 101 } })).toHaveLength(1)
  expect(validateSetup({ ...setup, tools: [...setup.tools, ...setup.tools] })).toHaveLength(1)
  expect(validateSetup({ ...setup, tools: [{ ...setup.tools[0]!, stickout: 10 }] })).toHaveLength(1)
  expect(validateSetup({ ...setup, fixtures: [{ id: "vise", bounds: setup.stock }, { id: "vise", bounds: setup.stock }] })).toHaveLength(1)
})
