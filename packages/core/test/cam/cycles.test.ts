import { describe, expect, test } from "bun:test"
import golden from "./fixtures/cycles-golden.json"
import { availableCycles, cycleTemplates, defaultCycleValues, findCycle, generateCycleCode } from "../../src/cam/cycles/index.ts"

/**
 * `fixtures/cycles-golden.json` is the output of the legacy `MachineCycles.tsx` templates evaluated outside the
 * repo, for each template and controller, with the parameter defaults and with a varied value set.
 */
type Golden = Record<string, {
  readonly name: string
  readonly parameters: ReadonlyArray<{ readonly name: string; readonly label: string; readonly type: string; readonly defaultValue: unknown; readonly min?: number; readonly max?: number; readonly step?: number; readonly unit?: string; readonly description?: string; readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }> }>
  readonly controllerTypes: ReadonlyArray<string>
  readonly variedValues: Record<string, unknown>
  readonly fanuc: { readonly defaults: string; readonly varied: string }
  readonly heidenhain: { readonly defaults: string; readonly varied: string }
}>
const legacy = golden as unknown as Golden

describe("machine cycle templates (legacy MachineCycles)", () => {
  test("the same 17 templates, in the legacy order", () => {
    expect(cycleTemplates.map((cycle) => cycle.id)).toEqual(Object.keys(legacy))
    expect(cycleTemplates).toHaveLength(17)
  })

  for (const cycle of cycleTemplates) {
    const expected = legacy[cycle.id]!
    describe(cycle.id, () => {
      test("name, controllers and parameter definitions match", () => {
        expect(cycle.name).toBe(expected.name)
        expect<string[]>([...cycle.controllerTypes]).toEqual([...expected.controllerTypes])
        expect(JSON.parse(JSON.stringify(cycle.parameters))).toEqual(JSON.parse(JSON.stringify(expected.parameters)))
      })
      for (const controller of ["fanuc", "heidenhain"] as const) {
        test(`${controller}: G-code with the defaults is identical`, () => {
          expect(generateCycleCode(cycle, defaultCycleValues(cycle), controller)).toBe(expected[controller].defaults)
        })
        test(`${controller}: G-code with edited values is identical`, () => {
          expect(generateCycleCode(cycle, expected.variedValues, controller)).toBe(expected[controller].varied)
        })
      }
    })
  }

  test("availableCycles filters by controller and findCycle resolves ids", () => {
    expect(availableCycles("fanuc")).toHaveLength(17)
    expect(availableCycles("heidenhain")).toHaveLength(17)
    expect(findCycle("simple-drilling")?.name).toBe("Simple Drilling")
    expect(findCycle("nope")).toBeUndefined()
  })

  test("simple drilling emits the legacy block", () => {
    const cycle = findCycle("simple-drilling")!
    expect(generateCycleCode(cycle, defaultCycleValues(cycle), "fanuc")).toBe(
      "(SIMPLE DRILLING CYCLE)\n(DIAMETER: 8mm, DEPTH: 20mm)\nG90 G54\nG00 X0 Y0\nG43 Z5 H1\nS1000 M3\nG00 X0 Y0\nG99 G81 R5 Z-20 F100 P0\nX10 Y10\nX20 Y10\nX30 Y10\nG80\nG00 Z5\nM5"
    )
  })
})
