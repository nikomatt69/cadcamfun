import { cam, cad } from "@cadcamfun/core"
import { Context, Effect, Layer, Schema } from "effect"

// Deviation from legacy `calculate`: the path length is measured from the stored
// G-code (or the toolpath IR) instead of the `operations[].pathLength` sums the
// legacy UI happened to persist, and the material volume can come from the core
// geometry (a stock solid or the drawing bounds) as well as from `stockDimensions`.

export interface CostSettings {
  readonly id: string
  readonly defaultCurrencyCode: string
  readonly defaultMachineHourlyRate: number
  readonly defaultOperatorHourlyRate: number
  readonly defaultSetupTime: number
}

/** Used when neither a specific, organisation nor user cost-settings row exists. */
export const SYSTEM_DEFAULT_SETTINGS: CostSettings = {
  id: "SYSTEM_DEFAULT",
  defaultCurrencyCode: "EUR",
  defaultMachineHourlyRate: 50,
  defaultOperatorHourlyRate: 30,
  defaultSetupTime: 30
}

export interface ToolWearLike {
  readonly wearRatePerMeter: number
  readonly replacementCost: number
}

export interface MaterialCostLike {
  readonly costPerUnit: number
  readonly wasteFactor: number | null
  readonly minimumCharge: number | null
}

export interface ToolpathCostInput {
  readonly id: string
  readonly data: unknown
  readonly gcode?: string | null | undefined
  readonly toolId: string | null
  readonly materialId: string | null
}

export type PathLengthSource = "gcode" | "moves" | "operations" | "none"
export type VolumeSource = "stockDimensions" | "solid" | "drawing" | "none"

export interface CostMeasurement {
  /** Cutting (feed) moves only, millimetres. */
  readonly totalPathLengthMm: number
  readonly materialVolumeM3: number
  readonly feedRateMmMin: number
  readonly pathLengthSource: PathLengthSource
  readonly volumeSource: VolumeSource
}

export interface CostEstimateInput {
  readonly toolpath: ToolpathCostInput
  readonly settings: CostSettings
  readonly toolWear: ToolWearLike | null
  readonly materialCost: MaterialCostLike | null
}

export interface CostEstimate {
  readonly materialCost: number
  readonly toolWearCost: number
  readonly machineTime: number
  readonly machineTimeCost: number
  readonly operatorTime: number
  readonly operatorTimeCost: number
  readonly setupCost: number
  readonly totalCost: number
  readonly currencyCode: string
  readonly details: {
    readonly sourceSettingsId?: string
    readonly inputs: { readonly toolpathId: string; readonly toolId: string | null; readonly materialId: string | null }
    readonly calculatedValues: {
      readonly totalPathLengthMm: number
      readonly materialVolumeM3: number
      readonly feedRateMmMin: number
      readonly machineTimeMinutes: number
      readonly operatorTimeMinutes: number
      readonly totalSetupTimeMinutes: number
    }
    readonly costBreakdown: {
      readonly material: number
      readonly toolWear: number
      readonly machineRun: number
      readonly operator: number
      readonly setup: number
    }
  }
}

const MM3_PER_M3 = 1000 * 1000 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const positive = (value: unknown): number | undefined => {
  const n = finite(value)
  return n !== undefined && n > 0 ? n : undefined
}

const numberIn = (value: unknown, keys: ReadonlyArray<string>): number | undefined => {
  if (!isRecord(value)) return undefined
  for (const key of keys) {
    const n = finite(value[key])
    if (n !== undefined) return n
  }
  return undefined
}

// ---------------------------------------------------------------- G-code

interface GcodeMeasurement {
  readonly lengthMm: number
  readonly feedMmMin: number | undefined
}

const WORD = /([A-Z])(-?\d*\.?\d+)/g

const stripComments = (line: string): string => line.replace(/\(.*?\)/g, " ").split(";")[0]!

/** Arc length of a G2/G3 move: `i`/`j` are centre offsets from the start point, `r` a signed radius. */
const arcLength = (
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  i: number,
  j: number,
  r: number | undefined,
  clockwise: boolean
): number => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const chord = Math.hypot(dx, dy)
  let cx = from.x + i
  let cy = from.y + j
  let radius = Math.hypot(i, j)
  if (radius <= 1e-9 && r !== undefined && r !== 0) {
    radius = Math.abs(r)
    const h = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4))
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    if (chord <= 1e-9) return Math.hypot(dz, radius * Math.PI * 2)
    cx = mx + (clockwise ? 1 : -1) * (dy / chord) * h
    cy = my - (clockwise ? 1 : -1) * (dx / chord) * h
  }
  if (radius <= 1e-9) return Math.hypot(chord, dz)
  const start = Math.atan2(from.y - cy, from.x - cx)
  const end = Math.atan2(to.y - cy, to.x - cx)
  let sweep = end - start
  if (clockwise) {
    while (sweep > 0) sweep -= Math.PI * 2
    if (Math.abs(sweep) < 1e-12) sweep = -Math.PI * 2
  } else {
    while (sweep < 0) sweep += Math.PI * 2
    if (Math.abs(sweep) < 1e-12) sweep = Math.PI * 2
  }
  return Math.hypot(radius * Math.abs(sweep), dz)
}

/**
 * Total length of the feed moves (G1/G2/G3) and the last feed rate, in millimetres
 * and mm/min. Rapids move the machine but do not wear the tool, so they only
 * update the current position.
 */
export const measureGcode = (gcode: string): GcodeMeasurement => {
  let x = 0
  let y = 0
  let z = 0
  let absolute = true
  let unit = 1
  let motion: 0 | 1 | 2 | 3 | undefined
  let length = 0
  let feed: number | undefined
  for (const raw of gcode.split(/\r?\n/)) {
    const line = stripComments(raw).trim().toUpperCase()
    if (line.length === 0) continue
    let nx = x
    let ny = y
    let nz = z
    let i = 0
    let j = 0
    let r: number | undefined
    let nextMotion = motion
    let moved = false
    WORD.lastIndex = 0
    for (const match of line.matchAll(WORD)) {
      const letter = match[1]!
      const value = Number.parseFloat(match[2]!)
      if (!Number.isFinite(value)) continue
      if (letter === "G") {
        const code = Math.round(value)
        if (code === 0 || code === 1 || code === 2 || code === 3) nextMotion = code
        else if (code === 20) unit = 25.4
        else if (code === 21) unit = 1
        else if (code === 90) absolute = true
        else if (code === 91) absolute = false
        continue
      }
      switch (letter) {
        case "X":
          nx = absolute ? value * unit : x + value * unit
          moved = true
          break
        case "Y":
          ny = absolute ? value * unit : y + value * unit
          moved = true
          break
        case "Z":
          nz = absolute ? value * unit : z + value * unit
          moved = true
          break
        // I/J are always offsets from the current point, G90/G91 does not apply.
        case "I":
          i = value * unit
          break
        case "J":
          j = value * unit
          break
        case "R":
          r = value * unit
          break
        case "F":
          feed = value * unit
          break
        default:
          break
      }
    }
    if (nextMotion !== undefined) motion = nextMotion
    if (!moved || motion === undefined) continue
    if (motion !== 0) {
      length += motion === 1
        ? Math.hypot(nx - x, ny - y, nz - z)
        : arcLength({ x, y, z }, { x: nx, y: ny, z: nz }, i, j, r, motion === 2)
    }
    x = nx
    y = ny
    z = nz
  }
  return { lengthMm: length, feedMmMin: feed }
}

/** Length of the toolpath IR stored in `data.moves`, canned cycles expanded. */
const measureMoves = (data: unknown): number | undefined => {
  if (!Array.isArray(data)) return undefined
  const decoded = Schema.decodeUnknownOption(Schema.Array(cam.MoveSchema))(data)
  if (decoded._tag === "None") return undefined
  let at = { x: 0, y: 0, z: 0 }
  let length = 0
  for (const move of cam.expandMoves(decoded.value, at)) {
    length += cam.moveLength(move, at)
    at = cam.moveTarget(move) ?? at
  }
  return length
}

/** Legacy fallback: the `operations[].pathLength` sums the legacy UI persisted. */
const measureOperations = (data: unknown): number => {
  if (!isRecord(data) || !Array.isArray(data.operations)) return 0
  let total = 0
  for (const operation of data.operations) {
    const length = isRecord(operation) ? finite(operation.pathLength) : undefined
    if (length !== undefined) total += length
  }
  return total
}

const solidVolumeM3 = (value: unknown): number | undefined => {
  const solid = Schema.decodeUnknownOption(cad.SolidSchema)(value)
  if (solid._tag === "None") return undefined
  const volume = cad.meshVolume(cad.meshOf(solid.value))
  return Number.isFinite(volume) && volume > 0 ? volume / MM3_PER_M3 : undefined
}

/** Bounding-box volume of the stored drawing entities, when a stock depth is known. */
const drawingVolumeM3 = (data: Record<string, unknown>): number | undefined => {
  if (!Array.isArray(data.entities)) return undefined
  const decoded = Schema.decodeUnknownOption(Schema.Array(cad.EntitySchema))(data.entities)
  if (decoded._tag === "None") return undefined
  const depth = positive(numberIn(data, ["stockDepth", "depth", "stockHeight"]))
  if (depth === undefined) return undefined
  const bounds = cad.boundsOfDrawing(decoded.value)
  const volume = cad.boxWidth(bounds) * cad.boxHeight(bounds) * depth
  return volume > 0 ? volume / MM3_PER_M3 : undefined
}

const measureVolume = (data: unknown): { readonly materialVolumeM3: number; readonly source: VolumeSource } => {
  const record = isRecord(data) ? data : {}
  const x = positive(numberIn(record.stockDimensions, ["x", "width"]))
  const y = positive(numberIn(record.stockDimensions, ["y", "height", "depth"]))
  const z = positive(numberIn(record.stockDimensions, ["z", "thickness"]))
  if (x !== undefined && y !== undefined && z !== undefined) {
    return { materialVolumeM3: (x * y * z) / MM3_PER_M3, source: "stockDimensions" }
  }
  for (const key of ["stock", "solid"] as const) {
    const volume = solidVolumeM3(record[key])
    if (volume !== undefined) return { materialVolumeM3: volume, source: "solid" }
  }
  const drawing = drawingVolumeM3(record)
  if (drawing !== undefined) return { materialVolumeM3: drawing, source: "drawing" }
  return { materialVolumeM3: 0, source: "none" }
}

const measure = (toolpath: ToolpathCostInput): CostMeasurement => {
  const data = toolpath.data ?? {}
  const record = isRecord(data) ? data : {}
  const gcode = typeof toolpath.gcode === "string" && toolpath.gcode.length > 0
    ? toolpath.gcode
    : typeof record.gcode === "string" && record.gcode.length > 0
    ? record.gcode
    : undefined

  let totalPathLengthMm = 0
  let pathLengthSource: PathLengthSource = "none"
  let gcodeFeed: number | undefined
  if (gcode !== undefined) {
    const measured = measureGcode(gcode)
    gcodeFeed = measured.feedMmMin
    if (measured.lengthMm > 0) {
      totalPathLengthMm = measured.lengthMm
      pathLengthSource = "gcode"
    }
  }
  if (pathLengthSource === "none") {
    const fromMoves = measureMoves(record.moves)
    if (fromMoves !== undefined && fromMoves > 0) {
      totalPathLengthMm = fromMoves
      pathLengthSource = "moves"
    }
  }
  if (pathLengthSource === "none") {
    const fromOperations = measureOperations(record)
    if (fromOperations > 0) {
      totalPathLengthMm = fromOperations
      pathLengthSource = "operations"
    }
  }

  const declaredFeed = positive(numberIn(record.parameters, ["feedrate", "feedRate", "feed"]))
  const feedRateMmMin = declaredFeed ?? positive(gcodeFeed) ?? 1000

  const volume = measureVolume(record)
  return { totalPathLengthMm, materialVolumeM3: volume.materialVolumeM3, feedRateMmMin, pathLengthSource, volumeSource: volume.source }
}

/** Deviation from legacy: legacy used the stock volume; the geometry is preferred when the toolpath carries it. */
const estimate = (input: CostEstimateInput): CostEstimate => {
  const { toolpath, settings, toolWear, materialCost } = input
  const measured = measure(toolpath)

  const totalSetupTimeMinutes = settings.defaultSetupTime || 0
  const machineTimeMinutes = measured.totalPathLengthMm > 0 && measured.feedRateMmMin > 0
    ? measured.totalPathLengthMm / measured.feedRateMmMin
    : 0

  const calculatedToolWearCost = toolWear && measured.totalPathLengthMm > 0
    ? ((measured.totalPathLengthMm / 1000) * toolWear.wearRatePerMeter / 100) * toolWear.replacementCost
    : 0
  const calculatedMaterialCost = materialCost && measured.materialVolumeM3 > 0
    ? Math.max(
      measured.materialVolumeM3 * (1 + (materialCost.wasteFactor || 0) / 100) * materialCost.costPerUnit,
      materialCost.minimumCharge || 0
    )
    : 0

  const machineRate = settings.defaultMachineHourlyRate
  const operatorRate = settings.defaultOperatorHourlyRate
  const setupCost = (totalSetupTimeMinutes / 60) * (machineRate + operatorRate)
  const machineTimeCost = (machineTimeMinutes / 60) * machineRate
  const operatorTimeMinutes = machineTimeMinutes + totalSetupTimeMinutes
  const operatorTimeCost = (operatorTimeMinutes / 60) * operatorRate

  return {
    materialCost: calculatedMaterialCost,
    toolWearCost: calculatedToolWearCost,
    machineTime: machineTimeMinutes,
    machineTimeCost,
    operatorTime: operatorTimeMinutes,
    operatorTimeCost,
    setupCost,
    totalCost: calculatedMaterialCost + calculatedToolWearCost + machineTimeCost + operatorTimeCost + setupCost,
    currencyCode: settings.defaultCurrencyCode,
    details: {
      ...(settings.id !== SYSTEM_DEFAULT_SETTINGS.id ? { sourceSettingsId: settings.id } : {}),
      inputs: { toolpathId: toolpath.id, toolId: toolpath.toolId, materialId: toolpath.materialId },
      calculatedValues: {
        totalPathLengthMm: measured.totalPathLengthMm,
        materialVolumeM3: measured.materialVolumeM3,
        feedRateMmMin: measured.feedRateMmMin,
        machineTimeMinutes,
        operatorTimeMinutes,
        totalSetupTimeMinutes
      },
      costBreakdown: {
        material: calculatedMaterialCost,
        toolWear: calculatedToolWearCost,
        machineRun: machineTimeCost,
        operator: operatorTimeCost,
        setup: setupCost
      }
    }
  }
}

/** Pure cost maths for `/api/production-costs/estimates/calculate`; no I/O, so no `Database` dependency. */
export class CostService extends Context.Service<CostService, {
  measure(toolpath: ToolpathCostInput): CostMeasurement
  estimate(input: CostEstimateInput): CostEstimate
}>()("cadcamfun/CostService") {
  static readonly layer: Layer.Layer<CostService> = Layer.succeed(
    CostService,
    CostService.of({ measure, estimate })
  )
}