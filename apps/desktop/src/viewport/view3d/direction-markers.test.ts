import { expect, test } from "bun:test"
import { MAX_DIRECTION_MARKERS, defaultDirectionSpacing, directionMarkers, markersUpTo } from "./direction-markers.ts"

/** One polyline as segment pairs. */
const polyline = (points: ReadonlyArray<readonly [number, number, number]>): Float32Array =>
  Float32Array.from(points.slice(1).flatMap((to, i) => [...points[i]!, ...to]))

test("arrows sit every spacing along a straight run, the first half a spacing in, pointing the way the path goes", () => {
  const markers = directionMarkers(polyline([[0, 0, 0], [10, 0, 0]]), 4)
  expect([...markers.positions]).toEqual([2, 0, 0, 6, 0, 0])
  expect([...markers.directions]).toEqual([1, 0, 0, 1, 0, 0])
  expect([...markers.segments]).toEqual([0, 0])
})

test("the distance carries across the small segments of an arc, so the arrows stay evenly spaced", () => {
  const points: Array<[number, number, number]> = []
  for (let i = 0; i <= 90; i++) points.push([10 * Math.cos((i / 90) * Math.PI / 2), 10 * Math.sin((i / 90) * Math.PI / 2), 0])
  const markers = directionMarkers(polyline(points), 3)
  expect(markers.positions.length / 3).toBe(5)
  const gaps: number[] = []
  for (let i = 1; i < 5; i++) gaps.push(Math.hypot(markers.positions[i * 3]! - markers.positions[i * 3 - 3]!, markers.positions[i * 3 + 1]! - markers.positions[i * 3 - 2]!))
  for (const gap of gaps) expect(gap).toBeGreaterThan(2.9 * 0.97)
  // Counter-clockwise: the arrow near the start points up (+y), the one near the end points left (-x).
  expect(markers.directions[1]!).toBeGreaterThan(0.9)
  expect(markers.directions[4 * 3]!).toBeLessThan(-0.5)
})

test("a gap between runs restarts the count, so a short run still shows its direction", () => {
  const markers = directionMarkers(Float32Array.from([0, 0, 0, 10, 0, 0, 50, 0, 0, 51, 0, 0]), 8)
  expect([...markers.segments]).toEqual([0, 1])
  expect(markers.positions[3]).toBeCloseTo(50.5, 6)
})

test("zero-length segments, a zero spacing and empty input give no arrows", () => {
  expect(directionMarkers(Float32Array.from([1, 1, 1, 1, 1, 1]), 2).positions.length).toBe(0)
  expect(directionMarkers(polyline([[0, 0, 0], [10, 0, 0]]), 0).positions.length).toBe(0)
  expect(directionMarkers(new Float32Array(0), 2).positions.length).toBe(0)
})

test("the arrow count is capped by widening the spacing, never by cutting the path off", () => {
  const markers = directionMarkers(polyline([[0, 0, 0], [100000, 0, 0]]), 1)
  expect(markers.positions.length / 3).toBeLessThanOrEqual(MAX_DIRECTION_MARKERS)
  expect(markers.spacing).toBeGreaterThan(1)
  expect(markers.positions[markers.positions.length - 3]!).toBeGreaterThan(99000)
})

test("what has run counts the arrows by segment", () => {
  const markers = directionMarkers(polyline([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]), 5)
  expect(markersUpTo(markers, 0)).toBe(0)
  expect(markersUpTo(markers, 1)).toBe(2)
  expect(markersUpTo(markers, 3)).toBe(markers.segments.length)
  expect(markersUpTo(markers, 99)).toBe(markers.segments.length)
})

test("the default spacing scales with the path and stays between one and fifty millimetres", () => {
  expect(defaultDirectionSpacing(3)).toBe(1)
  expect(defaultDirectionSpacing(300)).toBe(10)
  expect(defaultDirectionSpacing(1e6)).toBe(50)
})
