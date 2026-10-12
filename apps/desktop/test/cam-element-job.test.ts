/**
 * Per-element generation rules of the CAM explorer (legacy `CAMElementExplorer.handleGenerateToolpath`):
 * what the assigned tool / material / parameters do to the job, and that the request machines exactly that element.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import {
  assignmentProblem,
  operationForElement,
  requestForElement,
  settingsForElement,
  type ElementAssignment
} from "../src/features/cam/lib/elementJob.ts"
import { effectiveSettings } from "../src/features/cam/lib/elementGenerate.ts"

const base = cam.generator.DEFAULT_SETTINGS
const plate = { id: "r1", type: "rectangle", name: "Plate", x: 0, y: 0, width: 40, height: 20 }
const stock = { width: 100, height: 100, depth: 10, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const assignment = (patch: Partial<ElementAssignment> = {}): ElementAssignment => ({
  toolId: "endmill-3mm",
  materialId: "aluminum",
  params: { depth: 4, stepover: 30, feedrate: 1000, plungerate: 300 },
  ...patch
})

describe("assignmentProblem", () => {
  test("both picks are required, as the legacy alert said", () => {
    expect(assignmentProblem("", "aluminum")).toBe("Please assign both tool and material first")
    expect(assignmentProblem("endmill-3mm", "")).toBe("Please assign both tool and material first")
    expect(assignmentProblem("nope", "aluminum")).toBe("Invalid tool or material")
    expect(assignmentProblem("endmill-3mm", "aluminum")).toBeUndefined()
  })
})

describe("operationForElement", () => {
  test("rectangle / circle pocket, point drills, everything else contours", () => {
    expect(operationForElement("rectangle")).toBe("pocket")
    expect(operationForElement("circle")).toBe("pocket")
    expect(operationForElement("point")).toBe("drill")
    expect(operationForElement("polygon")).toBe("contour")
    expect(operationForElement("cube")).toBe("contour")
  })
})

describe("settingsForElement", () => {
  test("the tool sets type and diameter; feed and plunge are scaled by the material factor", () => {
    const settings = settingsForElement(base, plate, assignment())
    expect(settings.toolType).toBe("endmill")
    expect(settings.toolDiameter).toBe(3)
    expect(settings.material).toBe("aluminum")
    expect(settings.feedrate).toBe(500)
    expect(settings.plungerate).toBe(150)
    expect(settings.depth).toBe(4)
    expect(settings.stepover).toBe(30)
    expect(settings.operationType).toBe("pocket")
    expect(settings.rpm).toBe(12000)
    expect(settings.coolant).toBe(false)
  })

  test("v-bit maps to the generator's vbit, acrylic to plastic, wood keeps its factor", () => {
    const settings = settingsForElement(base, { id: "x", type: "polygon" }, assignment({ toolId: "v-bit-60deg", materialId: "acrylic" }))
    expect(settings.toolType).toBe("vbit")
    expect(settings.material).toBe("plastic")
    expect(settings.feedrate).toBe(700)
    expect(settingsForElement(base, plate, assignment({ materialId: "wood-maple" })).feedrate).toBe(800)
  })

  test("what the panel set elsewhere (origin, machine options) is kept, the stepdown never exceeds the depth", () => {
    const panel = { ...base, originType: "custom" as const, originX: 5, stepdown: 10 }
    const settings = settingsForElement(panel, plate, assignment({ params: { depth: 2, stepover: 40, feedrate: 1000, plungerate: 300 } }))
    expect(settings.originType).toBe("custom")
    expect(settings.originX).toBe(5)
    expect(settings.stepdown).toBe(2)
  })

  test("throws the legacy message for an incomplete assignment", () => {
    expect(() => settingsForElement(base, plate, assignment({ materialId: "" }))).toThrow("Please assign both tool and material first")
  })
})

describe("effectiveSettings", () => {
  test("without an assignment the settings pass through untouched", () => {
    expect(effectiveSettings({ element: plate, settings: base })).toBe(base)
    expect(effectiveSettings({ element: plate, settings: base, assignment: assignment() }).toolDiameter).toBe(3)
  })
})

describe("requestForElement", () => {
  const request = requestForElement({ element: plate, settings: settingsForElement(base, plate, assignment()), stock })

  test("machines exactly the one element, with the stock", () => {
    expect(request.geometry.geometryType).toBe("selected")
    expect(request.geometry.selectedElements).toEqual([plate])
    expect(request.geometry.stock).toEqual(stock)
  })

  test("the core turns it into a program that cuts with the assigned tool", () => {
    const { response, error } = cam.generator.generateToolpath(request)
    expect(error).toBeUndefined()
    expect(response.gcode).toContain("G1")
    expect(response.gcode).toContain("F500")
    expect(response.stats.cutLength).toBeGreaterThan(0)
  })

  test("a different assignment changes the program (depth and feed follow the element's picks)", () => {
    const shallow = cam.generator.generateToolpath(requestForElement({
      element: plate,
      settings: settingsForElement(base, plate, assignment({ materialId: "wood-oak", params: { depth: 1, stepover: 30, feedrate: 1000, plungerate: 300 } })),
      stock
    })).response
    expect(shallow.gcode).toContain("F1000")
    expect(shallow.gcode).not.toBe(cam.generator.generateToolpath(request).response.gcode)
  })
})
