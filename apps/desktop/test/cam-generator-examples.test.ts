/**
 * The examples of the generator panel (spec 05 operation examples, spec 06 translation tables).
 *
 * An example is not a screenshot: it is a setting patch and a piece of geometry that the real generator must be able to
 * machine. This test therefore runs every operation example through `generateToolpath` (the same entry the panel uses),
 * loads every setup example through the store's own patch actions, decodes the result against the real settings and
 * kernel schemas, and checks that the picker can actually show every strategy cell and that every caption is translated
 * in all eleven languages. An example that stops being valid, names a setting the schema dropped, or loses a translation
 * fails here instead of showing a broken program or a raw `cam.example.*` key in the UI.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamKernelRequest } from "@cadcamfun/api"
import {
  OPERATION_EXAMPLES,
  exampleRequest,
  exampleSettings,
  examplesFor as operationExamplesFor,
  type OperationExample
} from "../src/features/cam/lib/examples/operations.ts"
import {
  SETUP_EXAMPLES,
  applyExample,
  examplesFor as setupExamplesFor,
  findExample,
  isApplied,
  type ExampleTarget
} from "../src/features/cam/lib/examples/setups.ts"
import { STRATEGY_CATEGORIES } from "../src/features/cam/components/generator/StrategyPalette.data.ts"
import { withSettingsEffects, type KernelSettings } from "../src/features/cam/store/generatorStore.ts"
import { LOCALE_CODES } from "../src/i18n/registry.ts"

setDefaultTimeout(180_000)

const LOCALES = join(import.meta.dir, "../src/i18n/locales")

/** The `cam.json` table of a language, the file every example caption lives in. */
const camTable = (language: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES, language, "cam.json"), "utf8")) as Record<string, string>

const table = camTable("en")

/** The caption keys of an example must resolve, with a non-empty string, in every shipped language. */
const expectTranslated = (keys: ReadonlyArray<string>): void => {
  for (const language of LOCALE_CODES) {
    const strings = language === "en" ? table : camTable(language)
    for (const key of keys) {
      expect(typeof strings[key], `${language}: ${key}`).toBe("string")
      expect(strings[key]!.trim().length, `${language}: ${key}`).toBeGreaterThan(0)
    }
  }
}

const operationCaptionKeys = (example: OperationExample): ReadonlyArray<string> => [example.title, example.description]

describe("operation examples", () => {
  test("every example runs through the real generator and writes a program", () => {
    for (const example of OPERATION_EXAMPLES) {
      const request = exampleRequest(example)
      const outcome = cam.generator.generateToolpath(request)
      expect(outcome.error, `${example.id}: ${outcome.error ?? ""}`).toBeUndefined()
      expect(outcome.response.gcode.trim().length, `${example.id}: empty program`).toBeGreaterThan(0)
      expect(outcome.response.gcode).not.toContain("; Error:")
      // The request is the example's own settings decoded against the real schema, not a copy the picker made up.
      expect(request.settings.operationType).toBe(exampleSettings(example).operationType)
    }
  })

  test("there is an example for every operation the panel can select", () => {
    const seen = new Set(OPERATION_EXAMPLES.map((example) => {
      const settings = exampleSettings(example)
      return `${settings.machineType}:${settings.operationType}`
    }))
    // `multiaxis` is in the core schema but the generator panel cannot select it: every multi-axis palette cell maps
    // onto `3d_surface` (`paletteToCoreOperation`), so it is the one operation without a dedicated example.
    const operations = [
      ...["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface", "probing"].map((op) => `mill:${op}`),
      ...["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"].map((op) => `lathe:${op}`),
      ...["standard", "vase", "support", "infill", "raft", "brim"].map((op) => `3dprinter:${op}`)
    ]
    for (const operation of operations) expect(seen.has(operation), operation).toBe(true)
    // An example the picker cannot reach is not an example: every one must be listed for its own machine and operation.
    for (const example of OPERATION_EXAMPLES) {
      const settings = exampleSettings(example)
      expect(operationExamplesFor(settings).some((listed) => listed.id === example.id), example.id).toBe(true)
    }
  })

  test("the clicked strategy cell comes first and never crosses machines", () => {
    const slot = OPERATION_EXAMPLES.find((example) => example.settings.operationType === "pocket" && example.cells.includes("slot"))!
    const list = operationExamplesFor(exampleSettings(slot), "slot")
    expect(list[0]?.id).toBe(slot.id)
    expect(list.filter((example) => example.cells.includes("slot"))).toEqual([slot])
    // The rest of the operation's examples follow, so a cell the user clicked does not hide the other ways to cut it.
    expect(list.some((example) => example.id !== slot.id && exampleSettings(example).operationType === "pocket")).toBe(true)
    for (const example of list) expect(exampleSettings(example).machineType).toBe("mill")
  })

  test("every strategy cell of the palette has an example", () => {
    const cells = new Set(OPERATION_EXAMPLES.flatMap((example) => example.cells))
    for (const category of STRATEGY_CATEGORIES) {
      // The multi-axis cells are routed onto `3d_surface`; the 3D examples stand for them (see the operation test above).
      if (category.id === "mill-multi") continue
      for (const strategy of category.strategies) expect(cells.has(strategy.id), `${category.id}/${strategy.id}`).toBe(true)
    }
    // The other direction too: a cell id the palette no longer has would never be listed first for a click.
    const known = new Set(STRATEGY_CATEGORIES.flatMap((category) => category.strategies.map((strategy) => strategy.id)))
    for (const cell of cells) expect(known.has(cell), cell).toBe(true)
  })

  test("ids are unique and every caption is translated in all locales", () => {
    const ids = OPERATION_EXAMPLES.map((example) => example.id)
    expect(new Set(ids).size).toBe(ids.length)
    expectTranslated(OPERATION_EXAMPLES.flatMap(operationCaptionKeys))
  })
})

/** The store the SetupExamples section writes into, with the same effects the real `patchSettings` runs. */
const exampleTarget = (): { readonly api: ExampleTarget; readonly workpiece: () => { x: number; y: number; z: number } | undefined } => {
  let settings = cam.generator.DEFAULT_SETTINGS
  let kernel: KernelSettings = { material: "6061", machine: cam.kernel.DEFAULT_MACHINE.id, origin: "stock-center" }
  let printer = cam.generator.DEFAULT_PRINTER_EXTRAS
  let workpiece: { x: number; y: number; z: number } | undefined
  const api: ExampleTarget = {
    settings: () => settings,
    kernelSettings: () => kernel,
    printer: () => printer,
    patchSettings: (patch) => { settings = withSettingsEffects(settings, { ...settings, ...patch }) },
    patchKernelSettings: (patch) => { kernel = { ...kernel, ...patch } },
    setPrinter: (patch) => { printer = { ...printer, ...patch } },
    setWorkpiece: (value) => { workpiece = value }
  }
  return { api, workpiece: () => workpiece }
}

/** A minimal valid manufacturing job with the example's kernel fields; the schema checks every value they hold. */
const kernelRequest = (id: string, kernel: KernelSettings): unknown => ({
  schemaVersion: 1,
  id,
  name: id,
  material: "6061",
  elements: [{ id: "part", type: "rectangle", x: 0, y: 0, width: 100, height: 100 }],
  ...Object.fromEntries(Object.entries(kernel).filter(([, value]) => value !== undefined))
})

describe("setup examples", () => {
  test("every example loads through the store's actions and decodes against the real schemas", () => {
    for (const example of SETUP_EXAMPLES) {
      const target = exampleTarget()
      applyExample(example, target.api)
      expect(isApplied(example, target.api, target.workpiece()), `${example.id}: not applied`).toBe(true)
      // The settings, printer and kernel values must be what the panel and the sidecar accept, not lookalikes.
      expect(() => cam.generator.decodeSettings(target.api.settings())).not.toThrow()
      expect(() => cam.generator.decodeGenerateRequest({ settings: target.api.settings(), printer: target.api.printer() })).not.toThrow()
      expect(() => Schema.decodeUnknownSync(CamKernelRequest)(kernelRequest(example.id, target.api.kernelSettings())), example.id).not.toThrow()
    }
  })

  test("the in-use badge follows the store, not the card", () => {
    const target = exampleTarget()
    const example = findExample("vise-x")!
    expect(isApplied(example, target.api)).toBe(false)
    applyExample(example, target.api)
    expect(isApplied(example, target.api)).toBe(true)
  })

  test("every area offers examples, and the machine-bound ones follow the machine", () => {
    const areas = [...new Set(SETUP_EXAMPLES.map((example) => example.area))]
    expect(areas.length).toBeGreaterThan(0)
    for (const area of areas) {
      // Every area has something to show on the default machine.
      expect(setupExamplesFor(area, "mill").length, area).toBeGreaterThan(0)
      // Machines and posts are offered whatever the current machine is (applying one switches the machine).
      if (area === "machine" || area === "post") {
        const all = SETUP_EXAMPLES.filter((example) => example.area === area)
        for (const machine of ["mill", "lathe", "3dprinter"] as const) expect(setupExamplesFor(area, machine).length, `${area}/${machine}`).toBe(all.length)
        continue
      }
      for (const machine of ["mill", "lathe", "3dprinter"] as const) {
        for (const example of setupExamplesFor(area, machine)) expect(example.machine, `${area}/${machine}/${example.id}`).toBe(machine)
      }
    }
  })

  test("ids are unique and every caption is translated in all locales", () => {
    const ids = SETUP_EXAMPLES.map((example) => example.id)
    expect(new Set(ids).size).toBe(ids.length)
    expectTranslated(SETUP_EXAMPLES.flatMap((example) => [example.title, example.description]))
  })
})
