/**
 * The CAM kernel for a filament printer (spec 29 + spec 33 §9): a manufacturing job whose machine is a printer is sliced, not
 * cut. The part (CAD elements or meshes) is set on the plate, cut into layers and printed with walls, skin, bridges, infill,
 * supports and adhesion (`../print`); the program is the printer's G-code in the machine's dialect, and the artifact carries
 * the same kind of evidence a milled one does: claims on that exact NC, an independent replay, a release level.
 *
 * Evidence, not the slicer's word: the NC text is read back (plate, heating, layers rising), its beads are laid on a grid next
 * to the material of each layer (walls, first and last layer, stray beads) and the interpreter replays every block.
 */
import { setupTransform } from "../setup.ts"
import { applyPoint } from "../../cad/brep/math.ts"
import { analyseGcode } from "../generator/analysis.ts"
import type { CadElement } from "../generator/schema.ts"
import type { PrinterSettings } from "../generator/printer-base.ts"
import { meshBounds, type Mesh64 } from "../model/element-mesh.ts"
import { findFilament, type Filament } from "../print/filament.ts"
import { printBodies } from "../print/bodies.ts"
import { slicePrint, type PrintResult } from "../print/index.ts"
import { meshVolume, printSolidIssue } from "../print/slice.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import {
  KERNEL_SCHEMA_VERSION,
  type CamArtifact, type CamIssue, type CamResult, type Claim, type KernelMachine, type ManufacturingJob, type OperationOutcome, type PrintRequirement, type ReleaseLevel
} from "./contracts.ts"
import { digestOf, sha256 } from "./identity.ts"

export const PRINT_ALGORITHM = "cadcamfun-cam-kernel/print@1"

export interface PrintRunOptions {
  /** Where the job is: the slicer reports its stages in the vocabulary of the milling pipeline. */
  readonly onProgress?: (progress: { readonly stage: "operations" | "post" | "replay" | "evidence"; readonly operation?: { readonly id: string; readonly index: number; readonly count: number } }) => void
  readonly signal?: { readonly aborted: boolean }
}

const issue = (tag: CamIssue["tag"], stage: CamIssue["stage"], message: string, extra: Partial<CamIssue> = {}): CamIssue =>
  ({ tag, severity: extra.severity ?? "error", stage, message, ...extra })

/** Settings of a print job: the machine and the filament decide what the requirement leaves open. */
export const printSettingsOf = (machine: KernelMachine, filament: Filament | undefined, req: PrintRequirement): { readonly settings: PrinterSettings; readonly notes: ReadonlyArray<string>; readonly issues: ReadonlyArray<CamIssue> } => {
  const p = machine.printer!
  const notes: string[] = []
  const issues: CamIssue[] = []
  const nozzle = p.nozzle.diameter
  // Half the nozzle, in steps of 0.05: 0.2 for a 0.4 nozzle, 0.3 for a 0.6.
  const layerHeight = req.layerHeight ?? Math.max(0.05, Math.round(nozzle * 10) / 20)
  if (layerHeight > nozzle * 0.8 + 1e-9) issues.push(issue("InvalidInput", "plan", `A layer of ${layerHeight} mm is thicker than 80 % of the ${nozzle} mm nozzle: the bead cannot fuse to the layer under it`))
  if (layerHeight < 0.04) issues.push(issue("InvalidInput", "plan", `A layer of ${layerHeight} mm is thinner than the 0.04 mm a printer can lay`))
  const nozzleTemperature = req.nozzleTemperature ?? filament?.nozzleTemperature ?? 210
  const bedTemperature = req.bedTemperature ?? filament?.bedTemperature ?? 60
  if (nozzleTemperature > p.nozzle.maxTemperature) issues.push(issue("MachineLimit", "plan", `The nozzle is asked for ${nozzleTemperature} degrees C; this printer's hotend goes to ${p.nozzle.maxTemperature}`))
  if (bedTemperature > p.maxBedTemperature) issues.push(issue("MachineLimit", "plan", `The bed is asked for ${bedTemperature} degrees C; this printer's bed goes to ${p.maxBedTemperature}`))
  const speed = Math.min(req.printSpeed ?? 60, p.maxSpeed)
  if (req.printSpeed !== undefined && req.printSpeed > p.maxSpeed) notes.push(`The print speed was limited to the printer's ${p.maxSpeed} mm/s`)
  const supports = req.supports ?? "none"
  const settings: PrinterSettings = {
    layerHeight,
    firstLayerHeight: req.firstLayerHeight ?? layerHeight,
    printSpeed: speed,
    travelSpeed: Math.min(150, p.maxSpeed),
    printTemperature: nozzleTemperature,
    bedTemperature,
    extrusionWidth: nozzle,
    nozzleDiameter: nozzle,
    filamentDiameter: p.filamentDiameter,
    retractionDistance: req.retractionDistance ?? (p.extruder === "bowden" ? 5 : 1),
    retractionSpeed: p.extruder === "bowden" ? 40 : 35,
    zHop: req.zHop ?? 0,
    infillDensity: req.infillDensity ?? 20,
    infillPattern: req.infillPattern ?? "grid",
    shellCount: req.walls ?? 2,
    topLayers: req.topLayers ?? Math.max(2, Math.ceil(0.8 / layerHeight)),
    bottomLayers: req.bottomLayers ?? Math.max(2, Math.ceil(0.8 / layerHeight)),
    supportType: supports === "none" ? "none" : supports === "everywhere" ? "full" : "minimal",
    supportPlacement: supports === "everywhere" ? "everywhere" : "buildplate",
    ...(req.supportAngle !== undefined ? { supportOverhangAngle: req.supportAngle } : {}),
    adhesion: req.adhesion ?? "none",
    ...(req.brimWidth !== undefined ? { brimWidth: req.brimWidth } : {}),
    fanSpeed: req.fan ?? filament?.fan ?? 100,
    vase: req.vase === true,
    autoOrient: req.orientation === "auto",
    ...(req.seam !== undefined ? { seam: req.seam } : {}),
    ...(req.flow !== undefined ? { flow: req.flow } : {}),
    relativeExtrusion: req.relativeExtrusion === true,
    flavor: p.flavor,
    material: filament?.id ?? "pla",
    bedWidth: p.bed.width,
    bedDepth: p.bed.depth,
    buildHeight: p.buildHeight,
    bedOrigin: p.bed.origin,
    centerOnBed: true,
    ...(filament !== undefined ? { maxVolumetricFlow: filament.maxVolumetricFlow } : {})
  }
  return { settings, notes, issues }
}

const CLAIM_OF_CHECK: Readonly<Record<string, Claim["id"]>> = {
  "bed-fit": "bed-fit", "heated-start": "heated-start", "layers-rise": "layers-rise", "wall-coverage": "wall-coverage", "skin-coverage": "skin-coverage", "no-spill": "no-spill", filament: "filament"
}

const meshesOfJob = (job: ManufacturingJob): { readonly meshes: Mesh64[]; readonly warnings: ReadonlyArray<string>; readonly skipped: ReadonlyArray<string>; readonly errors: ReadonlyArray<string> } => {
  if (job.part.kind === "meshes") {
    const errors = job.part.meshes.flatMap((m, i) => { const problem = printSolidIssue(m); return problem === undefined ? [] : [`Mesh ${i + 1}: ${problem}`] })
    return { meshes: errors.length > 0 ? [] : job.part.meshes.map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) })), warnings: [], skipped: [], errors }
  }
  const bodies = printBodies((job.part.elements as ReadonlyArray<CadElement>).filter((e) => e["type"] !== "workpiece"))
  return { meshes: [...bodies.meshes], warnings: bodies.warnings, skipped: bodies.skipped, errors: bodies.errors }
}

/** Runs a printer job: slice, write the NC, read it back, and release it only as far as the evidence goes. */
export const runPrintJob = (job: ManufacturingJob, options: PrintRunOptions = {}): CamResult<CamArtifact> => {
  const machine = job.machine
  const fail = (...issues: CamIssue[]): CamResult<CamArtifact> => ({ status: "failed", issues })
  if (machine?.kind !== "printer" || machine.printer === undefined) return fail(issue("InvalidInput", "prepare", "A print job needs a printer"))
  if (job.schemaVersion !== KERNEL_SCHEMA_VERSION) return fail(issue("InvalidInput", "prepare", `Unsupported job schema version ${String(job.schemaVersion)}`))
  if (options.signal?.aborted === true) return fail(issue("Cancelled", "prepare", "The job was cancelled before source validation; no artifact was produced"))

  const filament = findFilament(job.material)
  const issues: CamIssue[] = []
  if (filament === undefined) issues.push(issue("UnknownMaterial", "prepare", `'${job.material}' is not a filament the kernel knows (${["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC"].join(", ")}): printed with PLA's density and the temperatures of the request`, { severity: "warning" }))

  const part = meshesOfJob(job)
  if (part.errors.length > 0) return fail(...issues, ...part.errors.map((error) => issue("InvalidInput", "prepare", error)))
  let meshes = part.meshes
  if (meshes.length === 0) return fail(...issues, issue("InvalidInput", "prepare", part.skipped.length > 0 ? `Nothing to print: ${part.skipped.join(", ")} ${part.skipped.length === 1 ? "has" : "have"} no volume` : "The part has no solid to print"))
  for (const w of part.warnings) issues.push(issue("InvalidInput", "prepare", w, { severity: "warning" }))
  for (const s of part.skipped) issues.push(issue("UnsupportedCapability", "prepare", `${s} is not a solid and was not printed`, { severity: "warning" }))

  // The setup orientation names the face that goes down on the plate (the face the spindle would see from below).
  const orientation = job.setupOrientation ?? "+Z"
  if (orientation !== "+Z") {
    const transform = setupTransform(orientation)
    meshes = meshes.map((mesh) => {
      const positions = new Float64Array(mesh.positions.length)
      for (let i = 0; i < positions.length; i += 3) {
        const q = applyPoint(transform, { x: mesh.positions[i]!, y: mesh.positions[i + 1]!, z: mesh.positions[i + 2]! })
        positions.set([q.x, q.y, q.z], i)
      }
      return { positions, indices: mesh.indices }
    })
  }

  const request = job.print ?? {}
  const resolved = printSettingsOf(machine, filament, request)
  issues.push(...resolved.issues)
  if (issues.some((i) => i.severity === "error")) return fail(...issues)

  const report = (stage: "operations" | "post" | "replay" | "evidence"): void => {
    if (options.signal?.aborted === true) throw Object.assign(new Error("cancelled"), { name: "AbortError" })
    options.onProgress?.({ stage, ...(stage === "operations" ? { operation: { id: "print", index: 0, count: 1 } } : {}) })
  }
  let result: PrintResult
  try {
    report("operations")
    let last = ""
    result = slicePrint(meshes, resolved.settings, {
      ...(options.signal ? { signal: options.signal } : {}),
      onProgress: (_fraction, stage) => {
        if (stage === last) return
        last = stage
        if (stage === "g-code") report("post")
        else if (stage === "verify") report("replay")
      }
    })
    report("evidence")
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return fail(issue("Cancelled", "prepare", "The job was cancelled before it finished; no artifact was produced"))
    return fail(...issues, issue("GenerationFailed", "generate", cause instanceof Error ? cause.message : String(cause)))
  }

  const nc = result.gcode
  const analysis = analyseGcode(nc, job.name)
  const replay = interpretGcode(nc, { track: true })
  const settings = resolved.settings
  const claims: Claim[] = []
  const expectedBead = Object.values(result.stats.lengthByKind).reduce((a, b) => a + b, 0)
  const replayedBead = replay.segments.filter((s, index) => s.kind !== "dwell" && replay.states![index]!.extrude > 0 && (s.from.x !== s.to.x || s.from.y !== s.to.y)).length
  const tooFast = replay.segments.find((s, index) => s.kind !== "dwell" && replay.states![index]!.extrude > 0 && s.feed > machine.printer!.maxSpeed * 60 + 1e-6)
  const interpretation = result.checks.find((c) => c.id === "nc-interpretation")
  const filamentArea = Math.PI * ((settings.filamentDiameter ?? 1.75) / 2) ** 2

  claims.push({ id: "operations-complete", status: result.stats.layers > 0 && expectedBead > 0 ? "passed" : "failed", detail: `${result.stats.layers} layers, ${expectedBead.toFixed(0)} mm of bead` })
  claims.push({
    id: "machine-limits",
    status: (settings.printTemperature ?? 0) <= machine.printer.nozzle.maxTemperature && (settings.bedTemperature ?? 0) <= machine.printer.maxBedTemperature && tooFast === undefined ? "passed" : "failed",
    detail: tooFast !== undefined && tooFast.kind !== "dwell" ? `NC line ${tooFast.line} deposits at ${tooFast.feed / 60} mm/s above the printer's ${machine.printer.maxSpeed} mm/s limit` : `Nozzle ${settings.printTemperature} / ${machine.printer.nozzle.maxTemperature} degrees C, bed ${settings.bedTemperature} / ${machine.printer.maxBedTemperature}; all replayed deposition speeds <= ${machine.printer.maxSpeed} mm/s`
  })
  for (const check of result.checks) if (check.id !== "nc-interpretation") claims.push({ id: CLAIM_OF_CHECK[check.id]!, status: check.status, detail: check.detail })
  claims.push({
    id: "nc-replay", status: replay.errors.length > 0 || interpretation?.status !== "passed" || replayedBead === 0 ? "failed" : "passed",
    detail: interpretation?.status !== "passed" ? interpretation?.detail ?? "Print replay evidence is missing" : replay.errors.length > 0 ? `${replay.errors.length} block(s) the interpreter could not follow, the first: ${replay.errors[0]}` : `Interpreted ${replay.segments.length} NC motions independently of the slicer, including ${replayedBead} depositing motions`
  })
  if (result.warnings.length > 0) {
    for (const w of result.warnings) issues.push(issue("UnsupportedCapability", "evidence", w, { severity: "warning" }))
  }
  const hardFailure = issues.some((i) => i.severity === "error")
  const release: ReleaseLevel = hardFailure || nc === "" || claims.some((c) => c.status === "failed") ? "blocked" : claims.every((c) => c.status === "passed") && result.warnings.length === 0 ? "verified-program" : "preview"

  const partVolume = Math.round(meshes.reduce((v, m) => v + Math.abs(meshVolume(m)), 0))
  const bedBox = machine.printer.bed
  const outcome: OperationOutcome = {
    id: "print", name: "Print", strategy: "print", toolId: `nozzle-${machine.printer.nozzle.diameter}`, cut: "print", status: "ok",
    parameters: { ...settings, orientation: result.orientation }, overridden: Object.keys(request),
    warnings: result.warnings, cutLength: Math.round(expectedBead * 1000) / 1000, timeSeconds: Math.round(result.stats.timeSeconds), removedVolume: 0
  }
  const jobDigest = digestOf("cam-kernel/job@1", {
    ...job,
    part: job.part.kind === "meshes" ? { kind: "meshes", meshes: job.part.meshes.map((m) => ({ positions: Array.from(m.positions), indices: Array.from(m.indices) })) } : job.part,
    resolved: { filament: filament?.id ?? null, machine: machine.id, settings }
  })
  const half = { x: bedBox.origin === "center" ? bedBox.width / 2 : 0, y: bedBox.origin === "center" ? bedBox.depth / 2 : 0 }
  return {
    status: "ok",
    value: {
      schemaVersion: KERNEL_SCHEMA_VERSION, jobId: job.id,
      material: { id: filament?.id ?? "pla", name: filament?.name ?? job.material, iso: "filament" },
      machine: { id: machine.id, name: machine.name, post: machine.post },
      ...(job.setupOrientation !== undefined ? { setupOrientation: job.setupOrientation } : {}),
      origin: { x: 0, y: 0, z: 0 },
      stockBounds: { min: { x: -half.x, y: -half.y, z: 0 }, max: { x: bedBox.width - half.x, y: bedBox.depth - half.y, z: machine.printer.buildHeight } },
      operations: [outcome], program: analysis.program, tools: [], nc, claims, issues, release,
      stock: { initialVolume: 0, finalVolume: Math.round(result.stats.filamentMm * filamentArea), partVolume, remainingVolume: 0, maxRemaining: 0, cellSize: 0.25 },
      cycleTimeSeconds: Math.round(result.stats.timeSeconds),
      identity: { job: jobDigest, part: digestOf("cam-kernel/part@1", job.part), nc: sha256(nc), algorithm: PRINT_ALGORITHM },
      notes: [...resolved.notes, ...(result.orientation !== "as designed" ? [`The part was turned onto its best face (${result.orientation})`] : []), "A printer's volumes: stock.finalVolume is the filament laid, stock.partVolume the solid it was cut from"],
      print: {
        dialect: machine.printer.flavor,
        filament: { material: filament?.name ?? job.material, densityGcm3: filament?.densityGcm3 ?? 1.24, diameter: machine.printer.filamentDiameter },
        nozzle: { diameter: machine.printer.nozzle.diameter, temperature: settings.printTemperature ?? 0, bedTemperature: settings.bedTemperature ?? 0 },
        layers: result.stats.layers, layerHeight: settings.layerHeight,
        filamentMm: Math.round(result.stats.filamentMm * 100) / 100, filamentGrams: Math.round(result.stats.filamentGrams * 100) / 100,
        timeSeconds: Math.round(result.stats.timeSeconds), travelMm: Math.round(result.stats.travelMm), retractions: result.stats.retractions,
        lengthByKind: Object.fromEntries(Object.entries(result.stats.lengthByKind).map(([k, v]) => [k, Math.round((v as number) * 100) / 100])),
        size: { x: Math.round(result.stats.size.x * 1000) / 1000, y: Math.round(result.stats.size.y * 1000) / 1000, z: Math.round(result.stats.size.z * 1000) / 1000 },
        orientation: result.orientation, settings: request
      }
    }
  }
}

/** What a print job would do, without slicing: the plate, the layers and what the request leaves to the defaults. */
export const planPrintJob = (job: ManufacturingJob): CamResult<{ readonly notes: ReadonlyArray<string> }> => {
  const machine = job.machine
  if (machine?.kind !== "printer" || machine.printer === undefined) return { status: "failed", issues: [issue("InvalidInput", "prepare", "A print job needs a printer")] }
  const filament = findFilament(job.material)
  const part = meshesOfJob(job)
  if (part.errors.length > 0) return { status: "failed", issues: part.errors.map((error) => issue("InvalidInput", "prepare", error)) }
  if (part.meshes.length === 0) return { status: "failed", issues: [issue("InvalidInput", "prepare", "The part has no solid to print")] }
  const resolved = printSettingsOf(machine, filament, job.print ?? {})
  if (resolved.issues.some((i) => i.severity === "error")) return { status: "failed", issues: resolved.issues }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const m of part.meshes) { const b = meshBounds(m); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, b.min[a]!); hi[a] = Math.max(hi[a]!, b.max[a]!) } }
  const size = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!]
  const s = resolved.settings
  const layers = Math.max(1, Math.ceil((size[2]! - (s.firstLayerHeight ?? s.layerHeight)) / s.layerHeight) + 1)
  return { status: "ok", value: { notes: [
    `Print ${size.map((v) => v.toFixed(1)).join(" x ")} mm on the ${machine.printer.bed.width} x ${machine.printer.bed.depth} mm plate in about ${layers} layers of ${s.layerHeight} mm (${filament?.name ?? "PLA"}, nozzle ${s.printTemperature} degrees C, bed ${s.bedTemperature})`,
    `${s.shellCount} walls, ${s.topLayers} top and ${s.bottomLayers} bottom layers, ${s.infillDensity} % ${s.infillPattern} infill, supports ${s.supportType === "none" ? "off" : s.supportPlacement}`,
    ...resolved.notes
  ] } }
}
