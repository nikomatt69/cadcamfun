/**
 * The generator panel's state rules that the legacy component got from `useEffect`s: the material preset on mount
 * and on every material change, the valid operation after a machine change.
 */
import { beforeEach, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { useGeneratorStore, withSettingsEffects } from "../src/features/cam/store/generatorStore.ts"

const g = cam.generator

describe("generator store", () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  test("starts with the aluminum preset applied, as the legacy mount effect did", () => {
    const { settings } = useGeneratorStore.getState()
    expect(settings.material).toBe("aluminum")
    expect([settings.feedrate, settings.plungerate, settings.rpm]).toEqual([800, 300, 12000])
  })

  test("choosing a material loads its feed / plunge / rpm preset", () => {
    useGeneratorStore.getState().updateSettings("material", "steel")
    const { settings } = useGeneratorStore.getState()
    expect([settings.feedrate, settings.plungerate, settings.rpm]).toEqual([400, 150, 8000])
  })

  test("a material changed through a patch (materials library) or a loaded config loads the preset too", () => {
    useGeneratorStore.getState().patchSettings({ material: "titanium" })
    expect(useGeneratorStore.getState().settings.rpm).toBe(6000)
    useGeneratorStore.getState().replaceSettings({ ...useGeneratorStore.getState().settings, material: "wood" })
    expect(useGeneratorStore.getState().settings.feedrate).toBe(1200)
  })

  test("a patch that keeps the material leaves the feeds the user set", () => {
    useGeneratorStore.getState().patchSettings({ feedrate: 555 })
    expect(useGeneratorStore.getState().settings.feedrate).toBe(555)
  })

  test("materials without a preset keep the current values", () => {
    const before = useGeneratorStore.getState().settings
    const after = withSettingsEffects(before, { ...before, material: "composite" })
    expect(after.rpm).toBe(before.rpm)
  })

  test("changing the machine picks an operation that belongs to it", () => {
    useGeneratorStore.getState().updateSettings("machineType", "lathe")
    expect(useGeneratorStore.getState().settings.operationType).toBe("turning")
    expect(useGeneratorStore.getState().settings.toolType).toBe("turning")
    useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
    expect(useGeneratorStore.getState().settings.operationType).toBe("standard")
    expect(g.operationsFor("3dprinter")).toContain("brim")
  })

  test("a library tool overwrites type, diameter, flutes and rpm and does not re-run the material preset", () => {
    useGeneratorStore.getState().selectLibraryTool({ name: "Flat 8", type: "endmill", diameter: 8, numberOfFlutes: 3, maxRPM: 9000 })
    const { settings } = useGeneratorStore.getState()
    expect([settings.toolDiameter, settings.flutes, settings.rpm]).toEqual([8, 3, 9000])
  })
})
