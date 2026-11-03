import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { modelChangeText, programStatusText } from "../src/features/cam/lib/model-change.ts"

const plate = { id: "plate", type: "cube", name: "Plate", x: 0, y: 0, z: 0, width: 30, height: 20, depth: 5 }
const status = (after: ReadonlyArray<Record<string, unknown>>) => cam.kernel.programStatus({ request: { elements: [plate] } }, { elements: after })

test("a stored program is described against its drawing: current, which kind of change, or no comparison", () => {
  expect(programStatusText(status([{ ...plate, name: "Renamed" }]))).toEqual({ tone: "ok", text: "The drawing still matches the model this program was made from." })
  const geometry = programStatusText(status([{ ...plate, width: 31 }]))
  expect(geometry).toMatchObject({ tone: "warn", text: "Model: the shape or placement of 1 element(s) changed." })
  expect(programStatusText(status([plate, { id: "pin", type: "cylinder", radius: 2, height: 5 }]))).toMatchObject({ tone: "warn", text: expect.stringContaining("added, removed or changed") })
  expect(programStatusText(status([{ ...plate, x: 4 }]))).toMatchObject({ tone: "warn", text: expect.stringContaining("moved by X 4, Y 0, Z 0 mm") })
  const unknown = programStatusText(cam.kernel.programStatus({}, { elements: [plate] }))
  expect(unknown).toMatchObject({ tone: "muted", text: expect.stringContaining("no stored model") })
  expect(unknown.detail).toContain("no stored request")
  expect(modelChangeText({ status: "current", displayOnly: [] })).toBeUndefined()
})
