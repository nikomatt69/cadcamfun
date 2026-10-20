import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { decodePlaybackBuffer } from "@cadcamfun/buffer"
import { buildPlayback, playbackSegmentAt, positionAt, toolAt } from "./playback.ts"

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
  expect(path.segmentCount).toBeGreaterThan(10)
  const first = playbackSegmentAt(path, 1)
  expect(first).toBeDefined()
  const p = positionAt(path, (first?.start ?? 0) + (path.duration - (first?.start ?? 0)) / 2)
  expect(p.x).toBeCloseTo(-10, 0)
  expect(p.z).toBeCloseTo(-2.5)
  expect(positionAt(path, path.duration)).toEqual({ x: 10, y: 0, z: -5 })
})

test("empty programs remain at origin", () => {
  expect(positionAt(buildPlayback(program([])), 10)).toEqual({ x: 0, y: 0, z: 0 })
})

test("packed playback preserves fractional coordinates and exact segment boundaries", () => {
  const target = { x: 0.123456789123, y: -0.987654321987, z: 0.314159265359 }
  const path = buildPlayback(program([
    { _tag: "Linear", to: target, feed: 73 },
    { _tag: "Dwell", seconds: 0.123456789123 },
  ]))
  const first = playbackSegmentAt(path, 0)!
  expect(first.to).toEqual(target)
  expect(playbackSegmentAt(path, 1)?.duration).toBe(0.123456789123)
  expect(positionAt(path, first.duration / 2)).toEqual({ x: target.x / 2, y: target.y / 2, z: target.z / 2 })
  const transported = decodePlaybackBuffer(path.bytes)
  expect(transported.toolIds).toEqual(path.toolIds)
  expect(transported.views.to[0]).toBe(target.x)
  expect(positionAt(transported, first.duration / 2)).toEqual(positionAt(path, first.duration / 2))
  expect(transported.views.starts.buffer).toBe(path.views.starts.buffer)
})

test("the tool in the spindle follows the toolpaths: each segment knows its toolId", () => {
  const two: cam.Program = {
    name: "Two", units: "mm", workOffset: "G54",
    toolpaths: [
      { id: "a", name: "a", toolId: "flat-10", spindleRpm: 1000, coolant: "off", moves: [{ _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 60 }] },
      { id: "b", name: "b", toolId: "drill-5", spindleRpm: 1000, coolant: "off", moves: [{ _tag: "Linear", to: { x: 10, y: 0, z: -10 }, feed: 60 }] }
    ]
  }
  const path = buildPlayback(two)
  expect(toolAt(path, 5)).toBe("flat-10")
  expect(toolAt(path, 15)).toBe("drill-5")
  expect(toolAt(path, 1000)).toBe("drill-5")
  expect(toolAt(buildPlayback(program([])), 0)).toBeUndefined()
})
