/**
 * The examples of everything around the operations: workholding, machines, post dialects, materials, tools, origins, set-ups,
 * advanced settings, the assistant, the verification presets and the stock. Pure data and two functions, no UI.
 *
 * An example is a title, a description, a miniature (the scene `SectionExample` draws) and the patch it loads into the generator
 * store through the actions the sections already use (`patchSettings`, `patchKernelSettings`, `setPrinter`). Nothing here is a
 * private shortcut: every value is a field of the real settings or of the kernel request, so an example that stops being valid
 * stops decoding, and `setups.test.ts` runs them through the real schemas and the real kernel so they cannot rot.
 *
 * Machines, cutters, materials and filaments are named by their id in the kernel catalogues and read from there; no number of
 * a catalogue entry is copied into this file.
 */
import { cam } from "@cadcamfun/core"
import type { Key } from "../../../../i18n/index.ts"
import type { SceneProps } from "../../components/generator/SectionExamples.tsx"
import type { KernelSettings, PrinterExtras, ToolpathSettings } from "../../store/generatorStore.ts"

export type SetupArea = "workholding" | "machine" | "post" | "material" | "tool" | "origin" | "setup" | "advanced" | "ai" | "evidence" | "stock"

export type MachineKind = ToolpathSettings["machineType"]

export type OriginKind = "center" | "corner" | "machine" | "face" | "chuck"

/** What the miniature draws: the props of `SectionExample` that are not the caption. */
export type ExampleScene = Omit<SceneProps, "detail" | "chip">

export interface ExamplePatch {
  readonly settings?: Partial<ToolpathSettings>
  /** An `undefined` value takes the key off the kernel settings (the request takes absent keys, never undefined values). */
  readonly kernel?: { readonly [K in keyof KernelSettings]?: KernelSettings[K] | undefined }
  readonly printer?: Partial<PrinterExtras>
  /** The raw piece, mm (the CAM sidebar's workpiece). */
  readonly workpiece?: { readonly x: number; readonly y: number; readonly z: number }
  /** After the patch, take the kernel's cutting data for the material and the tool the settings now hold. */
  readonly cuttingData?: true
}

export interface SetupExample {
  readonly id: string
  readonly area: SetupArea
  /** The machine type the example is for. */
  readonly machine: MachineKind
  readonly title: Key
  readonly description: Key
  /** A short mono token next to the title: a work offset, a size, a post. Not translated. */
  readonly chip?: string
  readonly scene: ExampleScene
  readonly patch: ExamplePatch
}

const keys = (id: string): Pick<SetupExample, "title" | "description"> => ({
  title: `cam.example.setup.${id}.title` as Key,
  description: `cam.example.setup.${id}.description` as Key
})

const make = (id: string, area: SetupArea, machine: MachineKind, scene: ExampleScene, patch: ExamplePatch, chip?: string): SetupExample =>
  ({ id, area, machine, ...keys(id), ...(chip !== undefined ? { chip } : {}), scene, patch })

/** Every key an example needs in the translation tables. */
export const exampleKeys = (example: SetupExample): ReadonlyArray<Key> => [example.title, example.description]

// ---------------------------------------------------------------- catalogue lookups

const machineOf = (id: string): cam.kernel.KernelMachine => {
  const found = cam.kernel.findMachine(id)
  if (found === undefined) throw new Error(`Unknown machine preset '${id}' in the examples`)
  return found
}

const cutterOf = (id: string): cam.kernel.Cutter => {
  const found = cam.kernel.findCutter(cam.kernel.DEFAULT_CUTTERS, id)
  if (found === undefined) throw new Error(`Unknown cutter '${id}' in the examples`)
  return found
}

const filamentOf = (id: string): (typeof cam.print.FILAMENTS)[number] => {
  const found = cam.print.FILAMENTS.find((filament) => filament.id === id)
  if (found === undefined) throw new Error(`Unknown filament '${id}' in the examples`)
  return found
}

/** A kernel machine of the milling catalogue: the preset the kernel plans against and its post, replacing a saved machine. */
const millPreset = (id: string): ExamplePatch["kernel"] => ({ machine: id, machineConfig: undefined })

/** The first lines the post of a machine writes for the standard sample program: what its dialect looks like, computed. */
export const postSampleLines = (post: string, count = 6): ReadonlyArray<string> => {
  const writer = cam.getPost(post as never)
  if (writer === undefined) return []
  const code = (line: string): string => line.replace(/^\d+\s+/, "").trim()
  return writer.emit(cam.samplePostProgram(), {}).split("\n")
    .filter((line) => line.trim() !== "" && !/^[(;]/.test(code(line)))
    .slice(0, count)
    .map((line) => (line.length > 30 ? `${line.slice(0, 29)}…` : line))
}

/** The typical cutting data of a grade for a Ø6 carbide end mill, as the material examples print it (rpm, feed, speed). */
export const typicalCuttingData = (grade: string): { readonly rpm: number; readonly feed: number; readonly vc: number } | undefined => {
  const settings = cam.generator.decodeSettings({ toolType: "endmill", toolDiameter: 6, flutes: 3, operationType: "pocket" })
  const recommendation = cam.kernel.recommendForSettings(settings, { grade })
  return recommendation === undefined ? undefined : { rpm: recommendation.data.rpm, feed: recommendation.data.feed, vc: Math.round(recommendation.data.vc) }
}

// ---------------------------------------------------------------- workholding

const held = { workholdingConfigured: true } as const

const WORKHOLDING: ReadonlyArray<SetupExample> = [
  make("vise-x", "workholding", "mill", { kind: "workholding", family: "mill", holding: "vise", jawAxis: "x", parallels: 10 },
    { settings: { machineType: "mill", workholding: "vise", viseJawAxis: "x", clampDepth: 8, viseJawHeight: 40, parallelsHeight: 10, ...held } }, "X"),
  make("vise-y", "workholding", "mill", { kind: "workholding", family: "mill", holding: "vise", jawAxis: "y", parallels: 10 },
    { settings: { machineType: "mill", workholding: "vise", viseJawAxis: "y", clampDepth: 8, viseJawHeight: 40, parallelsHeight: 10, ...held } }, "Y"),
  make("clamps", "workholding", "mill", { kind: "workholding", family: "mill", holding: "clamps" },
    { settings: { machineType: "mill", workholding: "clamps", clampDepth: 0, ...held } }),
  make("plate", "workholding", "mill", { kind: "workholding", family: "mill", holding: "plate" },
    { settings: { machineType: "mill", workholding: "plate", ...held } }),
  make("vacuum", "workholding", "mill", { kind: "workholding", family: "mill", holding: "vacuum" },
    {
      settings: { machineType: "mill", workholding: "none", material: "wood", ...held },
      kernel: { ...millPreset("cnc-router"), material: "mdf" }
    }, machineOf("cnc-router").post),
  make("trunnion", "workholding", "mill", { kind: "workholding", family: "mill", holding: "rotary" },
    {
      settings: { machineType: "mill", workholding: "plate", ...held },
      kernel: { ...millPreset("trunnion-5ax"), breadth: { tilted: true } }
    }, "3+2"),
  make("chuck-3", "workholding", "lathe", { kind: "workholding", family: "lathe", chuck: "3-jaw", gripLength: 20 },
    { settings: { machineType: "lathe", chuckType: "3-jaw", gripLength: 20, stockDiameter: 40, stockLength: 100, stockBore: 0, tailstock: false, ...held } }, "3-jaw"),
  make("chuck-4", "workholding", "lathe", { kind: "workholding", family: "lathe", chuck: "4-jaw", gripLength: 25 },
    { settings: { machineType: "lathe", chuckType: "4-jaw", gripLength: 25, stockDiameter: 60, stockLength: 80, stockBore: 0, tailstock: false, ...held } }, "4-jaw"),
  make("collet", "workholding", "lathe", { kind: "workholding", family: "lathe", chuck: "collet", gripLength: 30 },
    { settings: { machineType: "lathe", chuckType: "collet", gripLength: 30, stockDiameter: 12, stockLength: 60, stockBore: 0, tailstock: false, ...held } }, "Ø12"),
  make("centres", "workholding", "lathe", { kind: "workholding", family: "lathe", chuck: "3-jaw", gripLength: 20, tailstock: true },
    { settings: { machineType: "lathe", chuckType: "3-jaw", gripLength: 20, stockDiameter: 30, stockLength: 180, stockBore: 0, tailstock: true, ...held } }, "Ø30 × 180"),
  make("corexy", "workholding", "3dprinter", { kind: "workholding", family: "3dprinter", kinematics: "corexy" },
    { settings: { machineType: "3dprinter", printerKinematics: "corexy", buildHeight: machineOf("printer-corexy-300").printer!.buildHeight, ...held } }, "CoreXY"),
  make("delta", "workholding", "3dprinter", { kind: "workholding", family: "3dprinter", kinematics: "delta" },
    { settings: { machineType: "3dprinter", printerKinematics: "delta", buildHeight: machineOf("printer-delta-240").printer!.buildHeight, bedOrigin: "center", ...held } }, "Delta")
]

// ---------------------------------------------------------------- machines

const printerPatch = (id: string): ExamplePatch => {
  const printer = machineOf(id).printer!
  return {
    settings: {
      machineType: "3dprinter", bedWidth: printer.bed.width, bedDepth: printer.bed.depth, buildHeight: printer.buildHeight,
      printerKinematics: printer.kinematics, nozzleDiameter: printer.nozzle.diameter, bedOrigin: printer.bed.origin
    }
  }
}

const MACHINES: ReadonlyArray<SetupExample> = [
  make("vmc", "machine", "mill", { kind: "machine", family: "mill", variant: "vmc" },
    { settings: { machineType: "mill" }, kernel: { ...millPreset("vmc-standard"), tcp: undefined } }, "Fanuc"),
  make("five-axis", "machine", "mill", { kind: "machine", family: "mill", variant: "fiveaxis" },
    { settings: { machineType: "mill" }, kernel: millPreset("trunnion-5ax") }, "A/C"),
  make("router", "machine", "mill", { kind: "machine", family: "mill", variant: "router" },
    { settings: { machineType: "mill", material: "wood" }, kernel: { ...millPreset("cnc-router"), material: "mdf" } }, "GRBL"),
  make("lathe", "machine", "lathe", { kind: "machine", family: "lathe" },
    { settings: { machineType: "lathe", latheTurret: "rear" } }, "X/Z"),
  make("printer", "machine", "3dprinter", { kind: "machine", family: "3dprinter" }, printerPatch("printer-prusa-mk4"), "Marlin")
]

// ---------------------------------------------------------------- post dialects

const postExample = (id: string, machine: string): SetupExample => {
  const preset = machineOf(machine)
  return make(id, "post", "mill", { kind: "post", family: "mill", postLines: [...postSampleLines(preset.post)] },
    { settings: { machineType: "mill" }, kernel: { ...millPreset(machine), postDefinition: undefined } }, preset.post)
}

const POSTS: ReadonlyArray<SetupExample> = [
  postExample("post-fanuc", "vmc-standard"),
  postExample("post-siemens", "siemens-840d-vmc"),
  postExample("post-heidenhain", "kern-micro-hd-hsk25"),
  make("post-linuxcnc", "post", "mill", { kind: "post", family: "mill", postLines: [...postSampleLines("linuxcnc")] },
    { settings: { machineType: "mill" }, kernel: { postDefinition: cam.BUILTIN_DEFINITIONS.linuxcnc } }, "JSON")
]

// ---------------------------------------------------------------- materials

const materialExample = (id: string, gradeId: string, family: ToolpathSettings["material"], scene: string): SetupExample => {
  const material = cam.kernel.findMaterial(gradeId)
  if (material === undefined) throw new Error(`Unknown material '${gradeId}' in the examples`)
  return make(id, "material", "mill", { kind: "material", family: "mill", material: scene },
    { settings: { machineType: "mill", material: family }, kernel: { material: gradeId }, cuttingData: true }, `ISO ${material.iso}`)
}

const filamentExample = (id: string, filament: string): SetupExample => {
  const grade = filamentOf(filament)
  return make(id, "material", "3dprinter", { kind: "material", family: "3dprinter", material: "plastic" },
    {
      settings: { machineType: "3dprinter", printTemperature: grade.nozzleTemperature, bedTemperature: grade.bedTemperature },
      printer: { filament: grade.id as PrinterExtras["filament"], fanSpeed: grade.fan }
    }, `${grade.nozzleTemperature} / ${grade.bedTemperature}`)
}

const MATERIALS: ReadonlyArray<SetupExample> = [
  materialExample("mat-aluminium", "al-6061-t6", "aluminum", "aluminum"),
  materialExample("mat-steel", "steel-c45", "steel", "steel"),
  materialExample("mat-stainless", "stainless-304", "steel", "stainless steel"),
  materialExample("mat-titanium", "titanium-ti6al4v", "titanium", "titanium"),
  materialExample("mat-brass", "brass-cuzn39pb3", "brass", "brass"),
  materialExample("mat-hardwood", "wood-hard", "wood", "wood"),
  materialExample("mat-acetal", "pom-c", "plastic", "plastic"),
  materialExample("mat-carbon", "cfrp", "composite", "composite"),
  filamentExample("fil-pla", "pla"),
  filamentExample("fil-petg", "petg")
]

// ---------------------------------------------------------------- tools

const toolCard = (cutter: cam.kernel.Cutter): ExampleScene => ({ kind: "tool", family: "mill", cutter })

/** A mill tool of the generator: its settings fields, drawn as the kernel's assembly of that kind. */
const millTool = (id: string, toolType: ToolpathSettings["toolType"], diameter: number, flutes: number, rpm: number, extra: Partial<ToolpathSettings> = {}): SetupExample => {
  const settings = cam.generator.decodeSettings({ toolType, toolDiameter: diameter, flutes })
  return make(id, "tool", "mill", toolCard(cam.kernel.settingsCutter(settings)),
    { settings: { machineType: "mill", toolType, toolDiameter: diameter, flutes, rpm, ...extra } }, `Ø${diameter}`)
}

/** A cutter crib: the kernel plans with only these tools. Taken from the default crib by id. */
const crib = (id: string, ids: ReadonlyArray<string>, lead: string, chip: string): SetupExample =>
  make(id, "tool", "mill", toolCard(cutterOf(lead)), { settings: { machineType: "mill" }, kernel: { tools: ids.map(cutterOf) } }, chip)

/** Cutters that plan the plates the crib examples are tested with: facing, roughing, finishing, a spotted and tapped hole, a bore. */
export const PLATE_CRIB: ReadonlyArray<string> = [
  "facemill-50", "flat-16-n", "flat-8-n", "flat-4-n", "ball-6", "spot-6", "drill-6.8", "tap-m8", "reamer-8", "chamfer-12", "threadmill-p1.5"
]

export const MOULD_CRIB: ReadonlyArray<string> = ["flat-16", "flat-8", "bull-10-r1", "ball-10", "ball-6", "ball-3", "ball-1", "chamfer-12"]

const TOOLS: ReadonlyArray<SetupExample> = [
  millTool("tool-rough", "endmill", 12, 3, 10000),
  millTool("tool-finish", "endmill", 6, 4, 12000),
  millTool("tool-ball", "ballnose", 6, 2, 12000),
  millTool("tool-drill", "drill", 8.5, 2, 4000),
  millTool("tool-chamfer", "chamfer", 12, 4, 8000),
  millTool("tool-thread", "threadmill", 6.4, 3, 8000, { threadPitch: 1.5 }),
  crib("tool-crib-plate", PLATE_CRIB, "facemill-50", "11"),
  crib("tool-crib-mould", MOULD_CRIB, "ball-6", "8"),
  make("tool-turning", "tool", "lathe", { kind: "tool", family: "lathe", turning: "external" },
    { settings: { machineType: "lathe", toolType: "turning", rpm: 1500, noseRadius: 0.4 } }, "R0.4"),
  make("tool-parting", "tool", "lathe", { kind: "tool", family: "lathe", operation: "parting" },
    { settings: { machineType: "lathe", toolType: "parting", rpm: 800 } }, "3 mm"),
  make("tool-nozzle", "tool", "3dprinter", { kind: "tool", family: "3dprinter", nozzle: 0.4 },
    { settings: { machineType: "3dprinter", toolType: "standard", nozzleDiameter: 0.4 } }, "Ø0.4"),
]

// ---------------------------------------------------------------- origins and work offsets

const stockOrigin = (type: ToolpathSettings["originType"]): "stock-center" | "stock-corner" =>
  type === "workpiece-corner" || type === "workpiece-corner2" ? "stock-corner" : "stock-center"

const originExample = (id: string, type: ToolpathSettings["originType"], offset: ToolpathSettings["workOffset"], scene: OriginKind): SetupExample =>
  make(id, "origin", "mill", { kind: "origin", family: "mill", originKind: scene, offset },
    { settings: { machineType: "mill", originType: type, workOffset: offset }, kernel: { origin: stockOrigin(type) } }, offset)

const ORIGINS: ReadonlyArray<SetupExample> = [
  originExample("origin-center", "workpiece-center", "G54", "center"),
  originExample("origin-corner", "workpiece-corner", "G54", "corner"),
  originExample("origin-machine", "machine-zero", "G54", "machine"),
  originExample("origin-second-vise", "workpiece-center", "G55", "center"),
  make("origin-lathe-face", "origin", "lathe", { kind: "origin", family: "lathe", originKind: "face" },
    { settings: { machineType: "lathe", latheZero: "face" } }, "Z0"),
  make("origin-lathe-chuck", "origin", "lathe", { kind: "origin", family: "lathe", originKind: "chuck" },
    { settings: { machineType: "lathe", latheZero: "chuck" } }, "Z0"),
  make("origin-plate-centre", "origin", "3dprinter", { kind: "origin", family: "3dprinter", originKind: "center" },
    { settings: { machineType: "3dprinter", bedOrigin: "center", centerOnBed: true } }, "XY0")
]

// ---------------------------------------------------------------- set-ups (manual orientations, one offset per side)

const SETUP_OFFSETS: Readonly<Record<cam.kernel.SetupOrientation, ToolpathSettings["workOffset"]>> = {
  "+Z": "G54", "-Z": "G55", "+X": "G56", "-X": "G57", "+Y": "G58", "-Y": "G59"
}

const setupExample = (id: string, orientation: cam.kernel.SetupOrientation): SetupExample =>
  make(id, "setup", "mill", { kind: "kernel-setup", family: "mill", orientation },
    {
      settings: { machineType: "mill", workOffset: SETUP_OFFSETS[orientation], workholdingConfigured: false },
      kernel: { setupOrientation: orientation, operations: undefined }
    }, `${orientation} · ${SETUP_OFFSETS[orientation]}`)

const SETUPS: ReadonlyArray<SetupExample> = [
  setupExample("setup-top", "+Z"),
  setupExample("setup-flip", "-Z"),
  setupExample("setup-side-x", "+X"),
  setupExample("setup-side-nx", "-X"),
  setupExample("setup-side-y", "+Y"),
  setupExample("setup-side-ny", "-Y")
]

// ---------------------------------------------------------------- advanced, assistant, verification, stock

const ADVANCED: ReadonlyArray<SetupExample> = [
  make("adv-fast", "advanced", "mill", { kind: "advanced", family: "mill", tolerance: 0.005, arcFitting: true, finishing: true },
    {
      settings: { machineType: "mill", tolerance: 0.005, optimizePath: true, useArcFitting: true, useAdaptiveFeeds: true, useHighSpeedMode: true },
      kernel: { smoothing: 0.02 }
    }, "0.005"),
  make("adv-rest", "advanced", "mill", { kind: "advanced", family: "mill", rest: true, tolerance: 0.01 },
    { settings: { machineType: "mill", operationType: "3d_surface", surfaceStrategy: "roughing", useRestMachining: true, restToolDiameter: 10, toolDiameter: 4, flutes: 3 } }, "Ø10"),
  make("adv-tabs", "advanced", "mill", { kind: "advanced", family: "mill", tabs: 4 },
    { settings: { machineType: "mill" }, kernel: { tabs: { count: 4, width: 4, height: 1.5 } } }, "4"),
  make("adv-comp", "advanced", "mill", { kind: "advanced", family: "mill", finishing: true, tolerance: 0.01 },
    { settings: { machineType: "mill", useToolCompensation: true, finishingPass: true, finishingAllowance: 0.2, applyToolCompensation: true } }, "G41")
]

const AI: ReadonlyArray<SetupExample> = [
  make("ai-speed", "ai", "mill", { kind: "ai", family: "mill", ai: true, aiDifficulty: "simple", operation: "speed" },
    { settings: { useAI: true, aiDifficulty: "simple", aiOptimize: "speed" } }, "speed"),
  make("ai-quality", "ai", "mill", { kind: "ai", family: "mill", ai: true, aiDifficulty: "complex", operation: "quality" },
    { settings: { useAI: true, aiDifficulty: "complex", aiOptimize: "quality" } }, "quality"),
  make("ai-off", "ai", "mill", { kind: "ai", family: "mill", ai: false, operation: "manual" },
    { settings: { useAI: false } })
]

const EVIDENCE: ReadonlyArray<SetupExample> = [
  make("verify-draft", "evidence", "mill", { kind: "evidence", family: "mill", checks: [{ id: "generated", status: "passed" }, { id: "safe-height", status: "passed" }, { id: "no-gouge", status: "not-run" }] },
    { settings: { tolerance: 0.05 }, kernel: { resolution: 0.5 } }, "0.05"),
  make("verify-production", "evidence", "mill", { kind: "evidence", family: "mill", checks: [{ id: "generated", status: "passed" }, { id: "safe-height", status: "passed" }, { id: "no-gouge", status: "passed" }, { id: "nc", status: "passed" }] },
    { settings: { tolerance: 0.01 }, kernel: { resolution: 0.25 } }, "0.01"),
  make("verify-precision", "evidence", "mill", { kind: "evidence", family: "mill", checks: [{ id: "generated", status: "passed" }, { id: "safe-height", status: "passed" }, { id: "no-gouge", status: "passed" }, { id: "nc", status: "passed" }], hash: "sha256" },
    { settings: { tolerance: 0.005 }, kernel: { resolution: 0.1 } }, "0.005")
]

const STOCK: ReadonlyArray<SetupExample> = [
  make("stock-plate", "stock", "mill", { kind: "stock", family: "mill", stock: { x: 100, y: 100, z: 20 } }, { workpiece: { x: 100, y: 100, z: 20 } }, "100 × 100 × 20"),
  make("stock-block", "stock", "mill", { kind: "stock", family: "mill", stock: { x: 50, y: 50, z: 100 } }, { workpiece: { x: 50, y: 50, z: 100 } }, "50 × 50 × 100")
]

/** Every example, grouped by the area it is offered in. */
export const SETUP_EXAMPLES: ReadonlyArray<SetupExample> = [
  ...WORKHOLDING, ...MACHINES, ...POSTS, ...MATERIALS, ...TOOLS, ...ORIGINS, ...SETUPS, ...ADVANCED, ...AI, ...EVIDENCE, ...STOCK
]

/**
 * The examples an area offers. Machine and post examples are offered whatever the machine is (applying one switches the machine);
 * the others belong to a machine type and appear for it.
 */
export const examplesFor = (area: SetupArea, machine: MachineKind): ReadonlyArray<SetupExample> =>
  SETUP_EXAMPLES.filter((example) => example.area === area && (area === "machine" || area === "post" || example.machine === machine))

export const findExample = (id: string): SetupExample | undefined => SETUP_EXAMPLES.find((example) => example.id === id)

// ---------------------------------------------------------------- applying

/** The generator store as the examples see it: the actions the sections already call. */
export interface ExampleTarget {
  readonly settings: () => ToolpathSettings
  readonly kernelSettings: () => KernelSettings
  readonly printer: () => PrinterExtras
  readonly patchSettings: (patch: Partial<ToolpathSettings>) => void
  readonly patchKernelSettings: (patch: Partial<KernelSettings>) => void
  readonly setPrinter: (patch: Partial<PrinterExtras>) => void
  readonly setWorkpiece?: ((workpiece: { readonly x: number; readonly y: number; readonly z: number }) => void) | undefined
}

/** Loads an example into the generator through the store's own actions. */
export const applyExample = (example: SetupExample, target: ExampleTarget): void => {
  const { patch } = example
  if (patch.settings !== undefined) target.patchSettings(patch.settings)
  if (patch.kernel !== undefined) target.patchKernelSettings(patch.kernel as Partial<KernelSettings>)
  if (patch.printer !== undefined) target.setPrinter(patch.printer)
  if (patch.workpiece !== undefined) target.setWorkpiece?.(patch.workpiece)
  if (patch.cuttingData === true) {
    const recommendation = cam.kernel.recommendForSettings(target.settings(), { grade: target.kernelSettings().material })
    if (recommendation !== undefined) target.patchSettings(recommendation.patch)
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Whether the generator already holds what the example would load (an undefined kernel value means the key is absent). */
export const isApplied = (example: SetupExample, target: Pick<ExampleTarget, "settings" | "kernelSettings" | "printer">, workpiece?: { readonly x: number; readonly y: number; readonly z: number }): boolean => {
  const { patch } = example
  const settings = target.settings() as Record<string, unknown>
  const kernel = target.kernelSettings() as Record<string, unknown>
  const printer = target.printer() as Record<string, unknown>
  // The cutting data is a consequence of the material and the tool, not a field the example owns: it does not count.
  const own = Object.entries(patch.settings ?? {}).filter(([key]) => key !== "workholdingConfigured" && !(patch.cuttingData === true && ["rpm", "feedrate", "plungerate"].includes(key)))
  return own.every(([key, value]) => same(settings[key], value)) &&
    Object.entries(patch.kernel ?? {}).every(([key, value]) => {
      // No set-up orientation means the top (+Z): the kernel's own default.
      const held = key === "setupOrientation" ? kernel[key] ?? "+Z" : kernel[key]
      return value === undefined ? held === undefined : same(held, value)
    }) &&
    Object.entries(patch.printer ?? {}).every(([key, value]) => same(printer[key], value)) &&
    (patch.workpiece === undefined || (workpiece !== undefined && same(workpiece, patch.workpiece)))
}
