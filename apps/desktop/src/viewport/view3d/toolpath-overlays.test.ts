import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { toolpathOverlayModel } from "./toolpath-overlays.ts"

const program = (moves: cam.Move[]): cam.Program => ({
  name: "Inspection",
  units: "mm",
  workOffset: "G54",
  toolpaths: [{ id: "path", name: "Path", toolId: "tool", spindleRpm: 1000, coolant: "off", moves }]
})

test("extracts filterable points and arc inspection geometry", () => {
  const model = toolpathOverlayModel(program([
    { _tag: "Rapid", to: { x: 10, y: 0, z: 2 } },
    { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 100 },
    { _tag: "Arc", to: { x: 0, y: 10, z: 0 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 },
    { _tag: "Cycle", cycle: "drill", to: { x: 2, y: 3, z: -5 }, feed: 80, peckDepth: 0, dwellSeconds: 0, retractHeight: 1 }
  ]))

  expect(model.points.map((point) => point.kind)).toEqual(["rapid", "cut", "arc", "cycle"])
  expect(model.arcs).toEqual([{ from: { x: 10, y: 0, z: 0 }, to: { x: 0, y: 10, z: 0 }, center: { x: 0, y: 0, z: 0 }, radius: 10 }])
  expect(model.moveCount).toBe(4)
})

test("comments, dwell and orientation do not create inspection points", () => {
  const model = toolpathOverlayModel(program([
    { _tag: "Comment", text: "start" },
    { _tag: "Dwell", seconds: 1 },
    { _tag: "Orient", a: 0, b: 0, c: 0 }
  ]))
  expect(model).toEqual({ points: [], arcs: [], moveCount: 0 })
})
