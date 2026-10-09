/**
 * Strategy palette tests — Fusion/Hypermill-style categorization, mapping to core ops.
 *
 * The data model (categories, palette ids, mapping table) is the contract the rest of
 * the generator UI depends on: it must surface at least one cell per Fusion-class strategy
 * family (2.5D, 3D, multi-axis, drilling, lathe, printing) and every palette id must map
 * to a real `cam.generator` `operationType` so the sidecar can run it.
 */
import { describe, expect, test } from "bun:test"
import {
  STRATEGY_CATEGORIES,
  paletteToCoreOperation
} from "../src/cam/components/generator/StrategyPalette.data.ts"

describe("machining strategy palette", () => {
  test("categories are split by machine family and cover the Fusion-class families", () => {
    const families = new Set(STRATEGY_CATEGORIES.map((category) => category.family))
    expect(families.has("mill")).toBe(true)
    expect(families.has("lathe")).toBe(true)
    expect(families.has("3dprinter")).toBe(true)
    const millCategories = STRATEGY_CATEGORIES.filter((c) => c.family === "mill").map((c) => c.id)
    expect(millCategories).toContain("mill-2.5d")
    expect(millCategories).toContain("mill-3d")
    expect(millCategories).toContain("mill-drilling")
    expect(millCategories).toContain("mill-multi")
    expect(millCategories).toContain("mill-probing")
  })

  test("every mill cell maps to a known core operation", () => {
    const supported = new Set([
      "contour",
      "pocket",
      "face",
      "engrave",
      "drill",
      "threading",
      "3d_surface",
      "probing"
    ])
    for (const category of STRATEGY_CATEGORIES.filter((c) => c.family === "mill")) {
      for (const strategy of category.strategies) {
        const target = paletteToCoreOperation("mill", strategy.id)
        expect(target.length).toBeGreaterThan(0)
        // Every mill palette id maps to one of the supported core operations.
        expect(supported.has(target)).toBe(true)
      }
    }
  })

  test("every lathe cell maps to a known lathe core operation", () => {
    const latheOps = new Set([
      "facing",
      "turning",
      "boring",
      "threading",
      "grooving",
      "parting",
      "knurling"
    ])
    for (const category of STRATEGY_CATEGORIES.filter((c) => c.family === "lathe")) {
      expect(category.strategies.length).toBeGreaterThanOrEqual(5)
      for (const strategy of category.strategies) {
        expect(latheOps.has(paletteToCoreOperation("lathe", strategy.id))).toBe(true)
      }
    }
  })

  test("every printer cell maps to a known 3dprinter core operation", () => {
    for (const category of STRATEGY_CATEGORIES.filter((c) => c.family === "3dprinter")) {
      for (const strategy of category.strategies) {
        const target = paletteToCoreOperation("3dprinter", strategy.id)
        expect(target.length).toBeGreaterThan(0)
      }
    }
  })

  test("multi-axis cells are surfaced (Hypermill-style taxonomy)", () => {
    const multiCategory = STRATEGY_CATEGORIES.find((c) => c.id === "mill-multi")
    expect(multiCategory).toBeDefined()
    const multiIds = multiCategory!.strategies.map((s) => s.id)
    expect(multiIds).toContain("index_3_2")
    expect(multiIds).toContain("axis_4")
    expect(multiIds).toContain("axis_5_swarf")
    expect(multiIds).toContain("axis_5_sim")
  })

  test("drilling cycles include peck, chip-break, reaming, boring, tapping", () => {
    const drillCategory = STRATEGY_CATEGORIES.find((c) => c.id === "mill-drilling")
    expect(drillCategory).toBeDefined()
    const drillIds = drillCategory!.strategies.map((s) => s.id)
    expect(drillIds).toContain("drill")
    expect(drillIds).toContain("drill_deep")
    expect(drillIds).toContain("drill_peck")
    expect(drillIds).toContain("drill_chip_break")
    expect(drillIds).toContain("drill_reaming")
    expect(drillIds).toContain("drill_boring")
    expect(drillIds).toContain("drill_back_bore")
    expect(drillIds).toContain("drill_tapping")
  })

  test("3D surface family covers parallel, waterline, scallop, flowline, adaptive, rest, pencil", () => {
    const c3d = STRATEGY_CATEGORIES.find((c) => c.id === "mill-3d")
    expect(c3d).toBeDefined()
    const ids = c3d!.strategies.map((s) => s.id)
    for (const expected of [
      "3d_surface",
      "3d_surface_parallel",
      "3d_surface_waterline",
      "3d_surface_pencil",
      "3d_surface_scallop",
      "3d_surface_flowline",
      "3d_surface_adaptive",
      "3d_surface_rest"
    ]) {
      expect(ids).toContain(expected)
    }
  })
})
