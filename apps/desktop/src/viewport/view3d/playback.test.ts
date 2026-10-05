import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { buildPlayback, positionAt } from "./playback.ts"

const program = (moves: cam.Move[]): cam.Program => ({ name: "Test", units: "mm", workOffset: "G54", toolpaths: [{ id: "path", name: "path", toolId: "tool", spindleRpm: 1000, coolant: "off", moves }] })

test("playback interpolates feed moves and holds through dwell", () => {
  const path = buildPlayback(program([{ _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 60 }, { _tag: "Dwell", seconds: 2 }, { _tag: "Linear", to: { x: 20, y: 0, z: 0 }, feed: 60 }]))
  expect(path.duration).toBe(22)
  expect(positionAt(path, 5).x).toBe(5)
  expect(positionAt(path, 11).x).toBe(10)
  expect(positionAt(path, 100).x).toBe(20)
  expect(positionAt(path, -1).x).toBe(0)
})

test("full-circle helical arcs tessellate and interpolate Z", () => {
  const path = buildPlayback(program([{ _tag: "Rapid", to: { x: 10, y: 0, z: 0 } }, { _tag: "Arc", to: { x: 10, y: 0, z: -5 }, center: { x: 0, y: 0 }, clockwise: false, feed: 60 }]))
  expect(path.segments.length).toBeGreaterThan(10)
  const first = path.segments[1]
  expect(first).toBeDefined()
  const p = positionAt(path, (first?.start ?? 0) + (path.duration - (first?.start ?? 0)) / 2)
  expect(p.x).toBeCloseTo(-10, 0)
  expect(p.z).toBeCloseTo(-2.5)
  expect(positionAt(path, path.duration)).toEqual({ x: 10, y: 0, z: -5 })
})

test("empty programs remain at origin", () => {
  expect(positionAt(buildPlayback(program([])), 10)).toEqual({ x: 0, y: 0, z: 0 })
})
