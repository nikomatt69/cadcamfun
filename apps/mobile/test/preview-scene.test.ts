import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  LINE_COLOR,
  MACHINE_GLYPH_MAX_VERTICES,
  MILL_TOOL_VERTICES,
  PREVIEW_MAX_SEGMENTS,
  PREVIEW_MAX_TRIANGLES,
  PREVIEW_MESSAGE,
  PreviewPayloadError,
  finiteMatrix,
  highlightRange,
  prepareActiveLine,
  prepareMeshUpload,
  prepareToolpathLines,
  meshFeatureEdges,
  progressRange,
  toolMarkerLength,
  PREVIEW_MAX_ACTIVE_VERTICES,
  prepareOverlayLines,
  sceneGuides,
  guideColor,
  PREVIEW_MAX_OVERLAY_SEGMENTS,
  rgbFromHex,
} from "../lib/preview-scene"
import { PREVIEW_MAX_SOLID_TRIANGLES, TOOL_GLYPH_COLOR, prepareMachineSolids, toolGlyphLines } from "../lib/machine-bodies"
import { MAX_DISPLAY_REV_PER_SECOND } from "../lib/preview-sim"

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

  test("collision moves draw red and a machine scene drops the generic stock box", () => {
    const segments = [segment("linear", [0, 0, 0], [1, 0, 0]), segment("rapid", [1, 0, 0], [1, 1, 0])]
    const data = prepareToolpathLines(segments, undefined, new Set([1]))
    expect(data).toHaveLength(24)
    expect(Array.from(data.slice(3, 6))).toEqual(float32([...LINE_COLOR.linear]))
    expect(Array.from(data.slice(15, 18))).toEqual(float32([...LINE_COLOR.collision]))
    // The stock box stays in a path with no machine, and its edges are never recoloured.
    const withStock = prepareToolpathLines(segments, { min: [0, 0, 0], max: [1, 1, 1] }, new Set([0, 1]))
    expect(withStock).toHaveLength((2 + 12) * 12)
    expect(Array.from(withStock.slice(3, 6))).toEqual(float32([...LINE_COLOR.collision]))
    expect(Array.from(withStock.slice((2 + 1) * 12 + 3, (2 + 1) * 12 + 6))).toEqual(float32([...LINE_COLOR.stock]))
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
    expect(source).toContain(`static let maxActiveVertices = ${PREVIEW_MAX_ACTIVE_VERTICES}`)
    expect(source).toContain(`static let maxOverlaySegments = ${PREVIEW_MAX_OVERLAY_SEGMENTS.toLocaleString("en").replace(",", "_")}`)
    expect(source).toContain(`static let maxSolidTriangles = ${PREVIEW_MAX_SOLID_TRIANGLES.toLocaleString("en").replace(",", "_")}`)
    expect(source).toContain("static let solidVertexFloats = 10")
    expect(source).toContain(`static let maxSpinRevPerSecond: Float = ${MAX_DISPLAY_REV_PER_SECOND}`)
    for (const message of Object.values(PREVIEW_MESSAGE)) expect(source).toContain(message)
  })
})

describe("CAD outline and scene guides", () => {
  // Unit cube with split (per-face) vertices, as the desktop sends crease-normal meshes.
  const cube = () => {
    const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    const positions: number[] = []
    const indices: number[] = []
    for (const quad of quads) {
      const base = positions.length / 3
      for (const corner of quad) positions.push(...corners[corner]!)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    return { positions, indices }
  }

  test("a split-vertex cube outlines its twelve edges and not its face diagonals", () => {
    const { positions, indices } = cube()
    const edges = meshFeatureEdges(positions, indices)
    expect(edges).toHaveLength(12)
    for (const edge of edges) {
      const length = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1], edge.to[2] - edge.from[2])
      expect(length).toBeCloseTo(1, 9)
    }
  })

  test("a flat open sheet outlines only its boundary; a smooth fold is not outlined", () => {
    expect(meshFeatureEdges([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], [0, 1, 2, 0, 2, 3])).toHaveLength(4)
    // Two triangles meeting at 10 degrees: below the crease angle, so the shared edge is hidden.
    const tilt = Math.tan((10 * Math.PI) / 180)
    expect(meshFeatureEdges([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, tilt], [0, 1, 2, 0, 2, 3])).toHaveLength(4)
    expect(meshFeatureEdges([], [])).toEqual([])
  })

  test("the grid sits under the part with round spacing and the axes start at the origin", () => {
    const guides = sceneGuides({ min: [-10, -5, 2], max: [30, 25, 12] }, [0.5, 0.5, 0.5])
    const axes = guides.slice(-3)
    expect(axes.map((axis) => axis.from)).toEqual([[0, 0, axes[0]!.from[2]], [0, 0, axes[0]!.from[2]], [0, 0, axes[0]!.from[2]]])
    expect(axes[2]!.to[2]).toBeGreaterThan(axes[2]!.from[2])
    for (const line of guides.slice(0, -3)) {
      expect(line.from[2]).toBeLessThan(2)
      expect(Math.abs(line.from[0] / 5 - Math.round(line.from[0] / 5))).toBeLessThan(1e-9)
    }
    expect(sceneGuides({ min: [0, 0, Number.NaN], max: [1, 1, 1] }, [0, 0, 0])).toEqual([])
  })

  test("overlay drops edges past the cap instead of refusing the frame", () => {
    const edge = { from: [0, 0, 0] as const, to: [1, 0, 0] as const }
    const data = prepareOverlayLines([], Array.from({ length: PREVIEW_MAX_OVERLAY_SEGMENTS + 5 }, () => edge))
    expect(data.length).toBe(PREVIEW_MAX_OVERLAY_SEGMENTS * 12)
    expect(prepareOverlayLines([], [{ from: [0, 0, Number.NaN], to: [1, 0, 0] }])).toHaveLength(0)
    expect(guideColor("#000000", "#FFFFFF", 0.5)).toEqual([0.5, 0.5, 0.5])
  })

  test("a wire body keeps its own colour while the mesh outline takes the caller's ink", () => {
    const wire = { from: [0, 0, 0] as const, to: [1, 0, 0] as const, color: [0.78, 0.66, 0.47] as const }
    const feature = { from: [0, 0, 0] as const, to: [0, 1, 0] as const }
    const data = prepareOverlayLines([], [wire, feature], [0.1, 0.12, 0.16])
    expect(Array.from(data.slice(3, 6))).toEqual(float32([0.78, 0.66, 0.47]))
    expect(Array.from(data.slice(15, 18))).toEqual(float32([0.1, 0.12, 0.16]))
  })
})

describe("toolpath simulation upload", () => {
  const move = { kind: "linear" as const, from: [0, 0, 0] as const, to: [10, 0, -1] as const }

  test("the active move can carry a wireframe tool standing on the tool tip", () => {
    expect(prepareActiveLine(move)).toHaveLength(12)
    const withTool = prepareActiveLine(move, 5, [0.1, 0.2, 0.3])
    expect(withTool).toHaveLength(MILL_TOOL_VERTICES * 6)
    const points = Array.from({ length: MILL_TOOL_VERTICES - 2 }, (_, index) => Array.from(withTool.slice((index + 2) * 6, (index + 2) * 6 + 6)))
    // Every tool vertex is on a cylinder of radius 1 around the tip, between the tip and 5 mm above it, in the given colour.
    for (const [x, y, z, ...rgb] of points) {
      expect(Math.hypot(x! - 10, y!)).toBeCloseTo(1, 5)
      expect(z!).toBeGreaterThanOrEqual(-1 - 1e-6)
      expect(z!).toBeLessThanOrEqual(4 + 1e-6)
      expect(rgb).toEqual(float32([0.1, 0.2, 0.3]))
    }
    expect(prepareActiveLine(move, Number.NaN)).toHaveLength(12)
  })

  test("a machine glyph rides in the same buffer as the move", () => {
    const glyph = [
      { from: [10, 0, -1] as const, to: [12, 0, 3] as const, color: TOOL_GLYPH_COLOR.lathe },
      { from: [12, 0, 3] as const, to: [10, 0, -1] as const },
    ]
    const data = prepareActiveLine(move, 0, [0.1, 0.2, 0.3], glyph)
    expect(data).toHaveLength((2 + glyph.length * 2) * 6)
    expect(Array.from(data.slice(12, 18))).toEqual(float32([10, 0, -1, ...TOOL_GLYPH_COLOR.lathe]))
    // A glyph line without its own colour falls back to the tool tint.
    expect(Array.from(data.slice(27, 30))).toEqual(float32([0.1, 0.2, 0.3]))
  })

  test("the active line refuses a glyph past its cap and the largest real glyph fits", () => {
    const line = { from: [0, 0, 0] as const, to: [1, 0, 0] as const }
    const over = Array.from({ length: Math.ceil(PREVIEW_MAX_ACTIVE_VERTICES / 2) + 1 }, () => line)
    expect(() => prepareActiveLine(move, 0, undefined, over)).toThrow(PREVIEW_MESSAGE.pathInvalid)
    const nozzle = toolGlyphLines([0, 0, 0], { family: "nozzle", diameter: 0.4, width: 0, noseRadius: 0, insert: "", internal: false }, 4, TOOL_GLYPH_COLOR.nozzle)
    expect(nozzle.length * 2).toBeLessThanOrEqual(MACHINE_GLYPH_MAX_VERTICES)
    expect(prepareActiveLine(move, 0, undefined, nozzle)).toHaveLength((2 + nozzle.length * 2) * 6)
  })

  test("progress fades only path vertices after the playhead and never the stock box", () => {
    expect(progressRange(0, 10, false)).toEqual({ travelled: 20, path: 20 })
    expect(progressRange(0, 10, true)).toEqual({ travelled: 2, path: 20 })
    expect(progressRange(4, 10, true)).toEqual({ travelled: 10, path: 20 })
    expect(progressRange(99, 10, true)).toEqual({ travelled: 20, path: 20 })
    expect(progressRange(-3, 10, true)).toEqual({ travelled: 2, path: 20 })
    expect(progressRange(3, 0, true)).toEqual({ travelled: 0, path: 0 })
  })

  test("the tool marker scales with the part", () => {
    expect(toolMarkerLength({ min: [0, 0, 0], max: [20, 0, 0] })).toBeCloseTo(3, 9)
  })
})
