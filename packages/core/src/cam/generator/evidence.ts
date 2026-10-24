/**
 * Evidence record of a generated program (spec 29 §10 "evidence records", for the legacy generator route).
 *
 * The record binds what went in (a digest of the canonical request), the tool and the process values, where the cutting
 * data comes from (the kernel's material table row, or "manual" with the deviation), the exact NC bytes (SHA-256), and
 * every check run on that NC:
 *
 *   generated             a program with motion, no generator error
 *   cutting-data          spindle speed / feeds against the kernel's recommendation for the material, cutter and cut
 *   safe-height           the first horizontal rapid happens above the stock top
 *   no-rapid-in-material  replay of the NC on the stock (`verify`)
 *   tool-clearance        shank / holder against the stock: unresolved unless the request models them
 *   within-stock          no cut below the stock bottom, no fixture collision
 *   no-gouge              the remaining stock never goes below the finished part, when the selection is a part
 *   nc-interpretation     the independent interpreter understood every block
 *
 * Pure and deterministic. A passing record is evidence about the modelled tool, stock and part at the verifier's
 * resolution; it is not a machine qualification.
 */
import type { Mesh } from "../../cad/solid.ts"
import { digestOf, sha256 } from "../kernel/identity.ts"
import { recommendForSettings } from "../kernel/compat.ts"
import { partMeshes } from "../model/model.ts"
import { verifyRequestFor } from "../verify/request.ts"
import { verifyToolpath } from "../verify/verify.ts"
import type { VerifyIssue } from "../verify/schema.ts"
import { originShift } from "./dispatch.ts"
import { flattenElements, topOf } from "./elements.ts"
import { historyFeatures } from "./history-features.ts"
import { METRIC_THREADS } from "../../cad/fasteners.ts"
import type { GcodeStats, GenerateRequest, ProgramCheck, ProgramRecord } from "./schema.ts"

/** Element types that are a finished part (their solid is what must remain), not a feature to cut. */
const PART_TYPES: ReadonlySet<string> = new Set(["parametric", "brep", "mesh"])

/** Relative difference allowed between the program's values and the kernel's before they count as manual. */
const KERNEL_MATCH = 0.15

const relative = (a: number, b: number): number => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - b) / Math.abs(b))
const pct = (x: number): string => `${Math.round(x * 100)}%`

type Element = Readonly<Record<string, unknown>>

/**
 * The finished part of a milling request in the coordinates of its G-code: the selected parametric / B-rep / mesh parts,
 * or every selected solid for 3D surface machining (it machines the solid itself). `undefined` when nothing selected is a part.
 */
/** XY / Z shift `dispatch.ts` applies to the selection: XY from the chosen origin, its highest face on the stock top. */
const placementOf = (request: GenerateRequest): { readonly dx: number; readonly dy: number; readonly dz: number } => {
  const { settings, geometry } = request
  const { dx, dy } = originShift(settings, geometry as never)
  const flat = flattenElements(geometry.selectedElements as never)
  const dz = geometry.stock !== undefined && flat.length > 0 ? geometry.stock.topZ - Math.max(...flat.map(topOf)) : 0
  return { dx, dy, dz }
}

export interface Relief { readonly x: number; readonly y: number; readonly radius: number; readonly bottom: number; readonly reason: string }

/**
 * Removal the operation performs on purpose but the model does not carry, in G-code coordinates: thread milling cuts the
 * thread form of each tapped hole (modelled at its tap drill) out to the major diameter, the same holes `history-features.ts`
 * threads.
 */
export const reliefsFor = (request: GenerateRequest): ReadonlyArray<Relief> => {
  const { settings, geometry } = request
  if (settings.machineType !== "mill" || settings.operationType !== "threading" || geometry.geometryType !== "selected") return []
  const { dx, dy, dz } = placementOf(request)
  const out: Relief[] = []
  for (const e of geometry.selectedElements as ReadonlyArray<Element>) {
    if (e["type"] !== "parametric") continue
    const features = historyFeatures(e as never)
    for (const h of features?.holes ?? []) {
      const thread = METRIC_THREADS.find((m) => Math.abs(m.tapDrill - h.diameter) < 0.051)
      if (thread === undefined || h.direction.z > -0.999) continue
      out.push({ x: h.entry.x + dx, y: h.entry.y + dy, radius: thread.d / 2 + 0.02, bottom: h.entry.z + dz - h.depth, reason: `${thread.name}x${thread.pitch} thread form in hole ${h.id}` })
    }
  }
  return out
}

export const targetMeshesFor = (request: GenerateRequest): ReadonlyArray<Mesh> | undefined => {
  const { settings, geometry } = request
  if (settings.machineType !== "mill" || geometry.geometryType !== "selected") return undefined
  const selected = geometry.selectedElements as ReadonlyArray<Element>
  const parts = settings.operationType === "3d_surface" ? selected : selected.filter((e) => PART_TYPES.has(String(e["type"])))
  if (parts.length === 0) return undefined
  let built: ReturnType<typeof partMeshes>
  try {
    built = partMeshes(parts as never, { tolerance: Math.max(0.01, settings.tolerance ?? 0.01) })
  } catch {
    return undefined
  }
  if (built === undefined || built.meshes.length === 0) return undefined
  const { dx, dy, dz } = placementOf(request)
  return built.meshes.map((m) => {
    const p = new Float32Array(m.positions.length)
    for (let k = 0; k < p.length; k += 3) { p[k] = m.positions[k]! + dx; p[k + 1] = m.positions[k + 1]! + dy; p[k + 2] = m.positions[k + 2]! + dz }
    return { positions: p, indices: Uint32Array.from(m.indices) }
  })
}

/**
 * Lowest Z of the first rapid that moves in X or Y: the lower of its start and end, since a combined XYZ rapid travels
 * sideways from where it starts (`undefined` when a cut comes first or there is no horizontal rapid).
 */
export const firstHorizontalRapidZ = (gcode: string): { readonly z: number; readonly line: number } | undefined => {
  let g = -1, z: number | undefined
  const lines = gcode.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i]!.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").toUpperCase()
    if (code.trim() === "") continue
    const gw = /\bG0*([0-3])(?!\d)/.exec(code)
    if (gw) g = Number(gw[1])
    const from = z
    const zw = /\bZ(-?\d*\.?\d+)/.exec(code)
    if (zw) z = Number(zw[1])
    if (g === 0 && /\b[XY]-?\d*\.?\d+/.test(code) && z !== undefined) return { z: from === undefined ? z : Math.min(from, z), line: i + 1 }
    if (g >= 1 && /\b[XYZ]-?\d*\.?\d+/.test(code)) return undefined
  }
  return undefined
}

const issueCheck = (id: ProgramCheck["id"], issues: ReadonlyArray<VerifyIssue>, codes: ReadonlyArray<VerifyIssue["code"]>, passed: string): ProgramCheck => {
  const hits = issues.filter((i) => codes.includes(i.code) && i.severity !== "info")
  if (hits.length === 0) return { id, status: "passed", detail: passed }
  const first = hits[0]!
  return { id, status: hits.some((h) => h.severity === "error") ? "failed" : "unresolved", detail: hits.map((h) => h.message).join("; "), ...(first.line !== undefined ? { line: first.line } : {}) }
}

const REPLAY_CHECKS = ["no-rapid-in-material", "tool-clearance", "within-stock", "no-gouge", "nc-interpretation"] as const

/** The evidence record of `gcode`, generated for `request`. */
export const programRecord = (request: GenerateRequest, gcode: string, stats: GcodeStats, generatorError?: string, printChecks?: ReadonlyArray<ProgramCheck>): ProgramRecord => {
  const { settings, geometry } = request
  const stock = geometry.stock
  const checks: ProgramCheck[] = []
  const motion = stats.cutLength > 0 || /^\s*G0*[0-3]\b.*[XYZ]/im.test(gcode)
  const printer = settings.machineType === "3dprinter"
  checks.push(generatorError !== undefined
    ? { id: "generated", status: "failed", detail: generatorError }
    : motion ? { id: "generated", status: "passed", detail: `${stats.lines} lines, ${stats.cutLength.toFixed(1)} mm of feed moves` } : { id: "generated", status: "failed", detail: "The program has no motion" })

  // Cutting data against the kernel's table.
  let cuttingData: ProgramRecord["cuttingData"]
  const rec = printer ? undefined : recommendForSettings(settings)
  if (printer) {
    // A printer has no cutting data: the filament and its melt rate are the process, and the checks below read them off the program.
    cuttingData = { status: "not-applicable", detail: "A printer has no cutting data: the filament sets the temperatures and the melt rate" }
  } else if (rec === undefined) {
    cuttingData = { status: "not-applicable", detail: settings.machineType === "mill" ? `No kernel material for '${settings.material}'` : `The kernel's cutting data covers milling; the ${settings.machineType} uses its own process model` }
    checks.push({ id: "cutting-data", status: settings.machineType === "mill" ? "unresolved" : "not-run", detail: cuttingData.detail })
  } else {
    const d = rec.data
    const deviations = ([["rpm", settings.rpm, d.rpm], ["feed", settings.feedrate, d.feed], ["plunge", settings.plungerate, d.plungeFeed]] as const)
      .map(([name, actual, wanted]) => ({ name, actual, wanted, off: relative(actual, wanted) }))
      .filter((x) => x.off > KERNEL_MATCH)
    const recommended = { rpm: d.rpm, feed: d.feed, plunge: d.plungeFeed, stepdown: d.ap }
    if (deviations.length === 0) {
      cuttingData = { status: "kernel", detail: `${rec.material.name}: within ${pct(KERNEL_MATCH)} of the kernel's data (${d.source})`, recommended, reference: d.reference }
      checks.push({ id: "cutting-data", status: d.exceeded.length > 0 ? "failed" : "passed", detail: d.exceeded.length > 0 ? d.exceeded.join("; ") : cuttingData.detail })
    } else {
      const detail = `Manual values: ${deviations.map((x) => `${x.name} ${x.actual} vs ${x.wanted} (${x.actual > x.wanted ? "+" : "-"}${pct(x.off)})`).join(", ")} for ${rec.material.name}`
      cuttingData = { status: "manual", detail, recommended, reference: d.reference }
      checks.push({ id: "cutting-data", status: "unresolved", detail })
    }
  }

  // Safe height and the replay of the NC on the stock.
  if (settings.machineType === "3dprinter") {
    // A printer is not replayed on a stock: its program is read for the plate, the heating and the layers, and its beads are
    // laid next to the material of each layer.
    checks.push(...(printChecks ?? [{ id: "bed-fit" as const, status: "unresolved" as const, detail: "No solid was sliced: the program was not checked against a part" }]))
  } else if (settings.machineType !== "mill" || settings.operationType === "multiaxis") {
    const detail = settings.machineType !== "mill" ? `The stock replay covers 3-axis milling, not the ${settings.machineType}` : "Multi-axis programs are checked by the multi-axis planner, not the 3-axis replay"
    for (const id of ["safe-height", ...REPLAY_CHECKS] as const) checks.push({ id, status: "not-run", detail })
  } else if (motion) {
    const rapid = firstHorizontalRapidZ(gcode)
    checks.push(stock === undefined
      ? { id: "safe-height", status: "unresolved", detail: "No stock in the request: the stock top is unknown" }
      : rapid === undefined ? { id: "safe-height", status: "passed", detail: "No horizontal rapid before the first cut" }
      : rapid.z > stock.topZ + 1e-6 ? { id: "safe-height", status: "passed", detail: `First horizontal rapid travels at Z${rapid.z} or above, ${(rapid.z - stock.topZ).toFixed(3)} mm over the stock top Z${stock.topZ}` }
      : { id: "safe-height", status: "failed", detail: `First horizontal rapid travels from Z${rapid.z}, not above the stock top Z${stock.topZ}`, line: rapid.line })
    const target = targetMeshesFor(request)
    const reliefs = reliefsFor(request)
    const built = verifyRequestFor(request, gcode, target !== undefined
      ? { target: { solids: [], meshes: target.map((m) => ({ positions: Array.from(m.positions), indices: Array.from(m.indices) })), ...(reliefs.length > 0 ? { reliefs } : {}) } }
      : {})
    if (!built.ok) {
      for (const id of REPLAY_CHECKS) checks.push({ id, status: "unresolved", detail: built.error })
    } else {
      const report = verifyToolpath(built.request)
      const issues = report.issues
      checks.push(issueCheck("no-rapid-in-material", issues, ["RapidInMaterial"], "No rapid move touches the stock in the replay of the NC"))
      const tool = built.request.tool
      checks.push(tool.cuttingLength === undefined && tool.holderDiameter === undefined
        ? { id: "tool-clearance", status: "unresolved", detail: "Flute length and holder are not given: shank and holder contact is not checked" }
        : issueCheck("tool-clearance", issues, ["ShankCollision", "HolderCollision"], "Shank and holder stay clear of the stock"))
      checks.push(issueCheck("within-stock", issues, ["BelowStock", "FixtureCollision"], "No cut below the stock bottom or into a fixture"))
      checks.push(target === undefined
        ? { id: "no-gouge", status: "unresolved", detail: "The selection is not a finished part (parametric, B-rep or mesh): gouges are not checked" }
        : issueCheck("no-gouge", issues, ["Gouge"], `The remaining stock stays on or above the part (tolerance ${built.request.tolerance} mm, cell ${report.stats.cellSize.toFixed(3)} mm)${reliefs.length > 0 ? `; declared removal: ${reliefs.map((r) => r.reason).join(", ")}` : ""}`))
      checks.push(issueCheck("nc-interpretation", issues, ["InvalidInput", "InterpreterWarning"], "Every block interpreted independently of the generator"))
    }
  }

  const result: ProgramRecord["result"] = checks.some((c) => c.status === "failed") ? "failed" : checks.some((c) => c.status === "unresolved") ? "warnings" : "passed"
  const { evidence: _evidence, ...inputs } = request
  return {
    schema: "cadcamfun/program-record@1",
    inputs: {
      digest: digestOf("cadcamfun/generate-request@1", inputs),
      machineType: settings.machineType,
      operationType: settings.operationType,
      material: printer ? request.printer.filament : settings.material,
      elements: (geometry.selectedElements as ReadonlyArray<Element>).map((e) => String(e["id"] ?? e["type"] ?? "?")),
      ...(stock !== undefined ? { stock: { width: stock.width, height: stock.height, depth: stock.depth, topZ: stock.topZ } } : {})
    },
    tool: { type: settings.toolType, diameter: settings.toolDiameter, flutes: settings.flutes },
    process: { rpm: settings.rpm, feed: settings.feedrate, plunge: settings.plungerate, stepdown: settings.stepdown, stepover: settings.stepover, coolant: settings.coolant },
    cuttingData,
    program: { sha256: sha256(gcode), lines: stats.lines, cutLength: Math.round(stats.cutLength * 1000) / 1000, estimatedSeconds: Math.round(stats.estimatedSeconds * 10) / 10 },
    checks,
    result
  }
}
