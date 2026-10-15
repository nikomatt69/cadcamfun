import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  LINE_COLOR,
  PREVIEW_MAX_SEGMENTS,
  PREVIEW_MAX_TRIANGLES,
  PREVIEW_MESSAGE,
  PreviewPayloadError,
  finiteMatrix,
  highlightRange,
  prepareActiveLine,
  prepareMeshUpload,
  prepareToolpathLines,
  rgbFromHex,
} from "../lib/preview-scene"

const triangle = {
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
}

const float32 = (values: readonly number[]): number[] => Array.from(Float32Array.from(values))

const segment = (kind: "rapid" | "linear" | "circular", from: readonly [number, number, number], to: readonly [number, number, number]) => ({
  kind,
  from,
  to,
})

describe("preview upload", () => {
  test("a triangle is copied and an empty mesh clears", () => {
    const upload = prepareMeshUpload(triangle)
    expect(Array.from(upload.indices)).toEqual([0, 1, 2])
    expect(upload.positions).toBeInstanceOf(Float32Array)
    const empty = prepareMeshUpload({ positions: [], normals: [], indices: [] })
    expect(empty.indices.length).toBe(0)
    expect(empty.positions.length).toBe(0)
  })

  test("a mesh that would fault Metal is refused", () => {
    expect(() => prepareMeshUpload({ ...triangle, indices: [0, 1, 3] })).toThrow(PreviewPayloadError)
    expect(() => prepareMeshUpload({ ...triangle, indices: [0, 1, 1.5] })).toThrow(PREVIEW_MESSAGE.meshInvalid)
    expect(() => prepareMeshUpload({ ...triangle, positions: [0, 0, Number.NaN, 2, 0, 0, 0, 2, 0] })).toThrow(PREVIEW_MESSAGE.meshInvalid)
    expect(() => prepareMeshUpload({ ...triangle, normals: [0, 0, 1] })).toThrow(PREVIEW_MESSAGE.meshInvalid)
    expect(() => prepareMeshUpload({ ...triangle, indices: [0, 1] })).toThrow(PREVIEW_MESSAGE.meshInvalid)
  })

  test("a mesh past the phone cap is refused whole", () => {
    const indices = Array.from({ length: (PREVIEW_MAX_TRIANGLES + 1) * 3 }, () => 0)
    expect(() => prepareMeshUpload({ ...triangle, indices })).toThrow(PREVIEW_MESSAGE.meshTooLarge)
  })

  test("a highlight cannot run past the index buffer", () => {
    expect(highlightRange(10, 8, 4)).toEqual({ start: 8, count: 2 })
    expect(highlightRange(10, -1, 2)).toEqual({ start: 0, count: 0 })
    expect(highlightRange(10, 0, 0)).toEqual({ start: 0, count: 0 })
    expect(highlightRange(0, 0, 1)).toEqual({ start: 0, count: 0 })
  })

  test("the playhead is a separate upload from the path", () => {
    const segments = [segment("linear", [0, 0, 0], [1, 0, 0]), segment("rapid", [1, 0, 0], [1, 1, 0])]
    const lines = prepareToolpathLines(segments, { min: [0, 0, 0], max: [1, 1, 1] })
    expect(lines.length).toBe((2 + 12) * 12)
    expect(Array.from(lines.slice(3, 6))).toEqual(float32([...LINE_COLOR.linear]))
    expect(Array.from(lines.slice(9, 12))).toEqual(float32([...LINE_COLOR.linear]))
    const active = prepareActiveLine(segments[1])
    expect(active).toHaveLength(12)
    expect(Array.from(active.slice(3, 6))).toEqual(float32([...LINE_COLOR.active]))
    expect(prepareActiveLine(undefined)).toHaveLength(0)
    expect(prepareToolpathLines([], undefined)).toHaveLength(0)
  })

  test("a toolpath that is too large or not finite is refused", () => {
    const move = segment("linear", [0, 0, 0], [1, 0, 0])
    expect(() => prepareToolpathLines(Array.from({ length: PREVIEW_MAX_SEGMENTS + 1 }, () => move), undefined)).toThrow(PREVIEW_MESSAGE.pathTooLarge)
    expect(() => prepareToolpathLines([segment("linear", [0, 0, Number.NaN], [1, 0, 0])], undefined)).toThrow(PREVIEW_MESSAGE.pathInvalid)
    expect(() => prepareActiveLine(segment("rapid", [Number.POSITIVE_INFINITY, 0, 0], [1, 0, 0]))).toThrow(PREVIEW_MESSAGE.pathInvalid)
  })

  test("the camera matrix and the clear colour are finite", () => {
    expect(finiteMatrix(Array.from({ length: 16 }, () => 0))).toBe(true)
    expect(finiteMatrix([Number.NaN])).toBe(false)
    expect(rgbFromHex("#336699")).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255])
    expect(rgbFromHex("background")).toEqual([0.08, 0.09, 0.1])
  })

  test("the Metal module repeats the same caps and the same refusal messages", () => {
    const source = readFileSync(fileURLToPath(new URL("../modules/preview/ios/PreviewUpload.swift", import.meta.url)), "utf8")
    expect(source).toContain("static let maxTriangles = 80_000")
    expect(source).toContain("static let maxSegments = 20_000")
    expect(source).toContain("static let maxStockEdges = 12")
    for (const message of Object.values(PREVIEW_MESSAGE)) expect(source).toContain(message)
  })
})
