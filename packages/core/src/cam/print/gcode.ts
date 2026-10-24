/**
 * The planned layers as G-code: start and end blocks of the chosen flavor, one block per layer, travel with retraction and
 * z-hop, extrusion from the bead's cross-section, part cooling, per-feature speeds, and the statistics (filament, time).
 */
import type { Vec2 } from "../../cad/vec.ts"
import { filamentDensity, type PrintProfile } from "./profile.ts"
import type { Extrusion, PathKind, PlannedLayer, PrintStats } from "./types.ts"

const f3 = (n: number): string => n.toFixed(3)

export interface EmitInput {
  readonly layers: ReadonlyArray<PlannedLayer>
  readonly profile: PrintProfile
  /** Comment lines for the top of the program (`; Warning: ...`, notes about placement). */
  readonly notes: ReadonlyArray<string>
}

export interface EmitResult {
  readonly gcode: string
  readonly stats: PrintStats
}

const TYPE_NAMES: Readonly<Record<PathKind, string>> = {
  "wall-outer": "WALL-OUTER",
  "wall-inner": "WALL-INNER",
  skin: "SKIN",
  infill: "FILL",
  bridge: "BRIDGE",
  support: "SUPPORT",
  "support-interface": "SUPPORT-INTERFACE",
  skirt: "SKIRT",
  brim: "BRIM",
  raft: "RAFT",
  vase: "WALL-OUTER"
}

const PART_KINDS: ReadonlySet<PathKind> = new Set(["wall-outer", "wall-inner", "skin", "infill", "bridge", "vase"])

const speedFactor = (kind: PathKind, p: PrintProfile): number => {
  switch (kind) {
    case "wall-outer": case "vase": return p.outerWallSpeed
    case "infill": return p.infillSpeed
    case "bridge": return p.bridgeSpeed
    case "support": return p.supportSpeed
    case "support-interface": return p.supportSpeed * 0.8
    default: return 1
  }
}

const pathLength = (points: ReadonlyArray<Vec2>): number => {
  let l = 0
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  return l
}

const startBlock = (p: PrintProfile, firstZ: number): string => {
  // G90/G91 reset E mode on the supported controllers, so select E mode after XYZ mode.
  const modes = ["G21 ; Set units to millimeters", "G90 ; Use absolute coordinates", p.relativeExtrusion ? "M83 ; Set extruder to relative mode" : "M82 ; Set extruder to absolute mode"]
  if (p.startGcode !== undefined && p.startGcode.trim() !== "") {
    const body = p.startGcode.replace(/\{nozzle\}/g, String(p.nozzleTemperature)).replace(/\{bed\}/g, String(p.bedTemperature)).replace(/\{layer\}/g, f3(firstZ))
    return `; Print Start G-code\n${modes.join("\n")}\n${body.trimEnd()}\n${modes.join("\n")}\nG92 E0 ; Reset extruder position\n`
  }
  const lines = [
    "; Print Start G-code",
    ...modes,
    `M104 S${p.nozzleTemperature} ; Set extruder temperature (no wait)`,
    `M140 S${p.bedTemperature} ; Set bed temperature (no wait)`,
    "G28 ; Home all axes",
    `M109 S${p.nozzleTemperature} ; Wait for extruder temperature`,
    `M190 S${p.bedTemperature} ; Wait for bed temperature`
  ]
  if (p.acceleration > 0) lines.push(`M204 S${p.acceleration} ; Set print acceleration`)
  if (p.pressureAdvance > 0) lines.push(p.flavor === "klipper" ? `SET_PRESSURE_ADVANCE ADVANCE=${p.pressureAdvance} ; Pressure advance` : `M900 K${p.pressureAdvance} ; Linear advance`)
  lines.push(`G1 Z${f3(Math.min(5, p.buildHeight))} F${Math.round(Math.min(5000, p.travelSpeed * 60))} ; Move Z up`, "G92 E0 ; Reset extruder position")
  return lines.join("\n") + "\n"
}

/** A purge line along the front edge of the plate, laid at the first layer height. */
const primeLine = (p: PrintProfile, firstZ: number): { gcode: string; length: number } => {
  const length = Math.min(100, p.bedWidth - 20)
  if (length < 20) return { gcode: "", length: 0 }
  const x0 = p.bedOrigin === "center" ? -p.bedWidth / 2 + 10 : 10
  const y0 = p.bedOrigin === "center" ? -p.bedDepth / 2 + 5 : 5
  const area = p.extrusionWidth * 1.3 * firstZ
  const filament = (Math.PI * (p.filamentDiameter / 2) ** 2)
  const e = (length * area) / filament * p.flow
  const absolute = !p.relativeExtrusion
  return {
    length,
    gcode:
      `G1 X${f3(x0)} Y${f3(y0)} Z${f3(firstZ)} F${Math.round(Math.min(50, p.travelSpeed) * 60)} ; Move to prime position\n` +
      `G1 X${f3(x0 + length)} Y${f3(y0)} E${e.toFixed(5)} F${Math.round(Math.min(20, p.printSpeed) * 60)} ; Prime line\n` +
      (absolute ? "G92 E0 ; Reset extruder position again\n" : "")
  }
}

const endBlock = (p: PrintProfile, lastZ: number, retracted: boolean): string => {
  if (p.endGcode !== undefined && p.endGcode.trim() !== "") {
    return `\n; Print End G-code\n${p.endGcode.replace(/\{nozzle\}/g, String(p.nozzleTemperature)).replace(/\{bed\}/g, String(p.bedTemperature)).replace(/\{layer\}/g, f3(lastZ)).trimEnd()}\nM84 ; Disable motors\n`
  }
  const present = p.bedOrigin === "center" ? "G1 X0 Y" + f3(p.bedDepth / 2) : "G1 X0 Y" + f3(Math.min(p.bedDepth, 200))
  return (
    "\n; Print End G-code\n" +
    // Relative moves from here on: in absolute mode `E-2` would pull the filament back to E-2, not 2 mm.
    "M83 ; Relative extruder moves\n" +
    (retracted || p.retractionDistance <= 0 ? "" : `G1 E-${p.retractionDistance} F${Math.round(p.retractionSpeed * 60)} ; Retract filament\n`) +
    "M107 ; Fan off\n" +
    "G91 ; Relative positioning\n" +
    `G1 Z${f3(Math.max(0, Math.min(5, p.buildHeight - lastZ)))} F${Math.round(Math.min(50, p.travelSpeed) * 60)} ; Move Z up relative\n` +
    "G90 ; Absolute positioning\n" +
    `${present} F${Math.round(Math.min(50, p.travelSpeed) * 60)} ; Present print\n` +
    "M104 S0 ; Turn off extruder temperature\n" +
    "M140 S0 ; Turn off bed temperature\n" +
    "M84 ; Disable motors\n"
  )
}

export const emitGcode = (input: EmitInput): EmitResult => {
  const p = input.profile
  const layers = input.layers
  const filamentArea = Math.PI * (p.filamentDiameter / 2) ** 2
  const firstZ = layers[0]?.height ?? p.layerHeight
  const accel = p.acceleration > 0 ? p.acceleration : 1500

  const body: string[] = []
  let e = 0
  let emittedE = 0
  let cx = 0, cy = 0, cz = 0
  let feed = -1
  let retracted = false
  let fan = 0
  let lastType: PathKind | undefined
  let time = 0
  let travelMm = 0
  let retractions = 0
  let extrudedMm = 0
  const lengthByKind: Partial<Record<PathKind, number>> = {}
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = 0
  const total = layers.length

  const prime = primeLine(p, firstZ)
  let located = prime.length > 0
  cx = prime.length > 0 ? (p.bedOrigin === "center" ? -p.bedWidth / 2 + 10 + prime.length : 10 + prime.length) : 0
  cy = prime.length > 0 ? (p.bedOrigin === "center" ? -p.bedDepth / 2 + 5 : 5) : 0
  cz = firstZ

  // Quantize cumulative E, then difference it for M83. Rounding each relative bead independently
  // accumulates a filament deficit on long programs; both modes must deposit the same total.
  const extrusionWord = (): string => {
    const next = Number(e.toFixed(5))
    const word = p.relativeExtrusion ? next - emittedE : next
    emittedE = next
    return word.toFixed(5)
  }

  const f = (mmPerSecond: number): string => {
    const v = Math.round(mmPerSecond * 60)
    if (v === feed) return ""
    feed = v
    return ` F${v}`
  }
  const setFan = (percent: number): void => {
    const rounded = Math.round(Math.max(0, Math.min(100, percent)) * 2.55)
    if (rounded === fan) return
    fan = rounded
    body.push(rounded === 0 ? "M107 ; Fan off" : `M106 S${rounded} ; Fan`)
  }
  const retract = (): void => {
    if (retracted || p.retractionDistance <= 0) return
    const amount = p.retractionDistance
    e -= amount
    body.push(`G1 E${extrusionWord()} F${Math.round(p.retractionSpeed * 60)} ; Retract`)
    feed = -1
    time += amount / p.retractionSpeed
    retracted = true
    retractions++
  }
  const unretract = (): void => {
    if (!retracted) return
    const amount = p.retractionDistance
    e += amount
    body.push(`G1 E${extrusionWord()} F${Math.round(p.retractionSpeed * 60)} ; Unretract`)
    feed = -1
    time += amount / p.retractionSpeed
    retracted = false
  }
  /** Moves to `to` at height `z` without extruding; long moves and layer changes retract first. */
  const travel = (to: Vec2, z: number): void => {
    const d = Math.hypot(to.x - cx, to.y - cy)
    const layerChange = !located || Math.abs(z - cz) > 1e-6
    if (d < 1e-6 && !layerChange) return
    const lift = d >= p.retractMinTravel || layerChange
    if (lift) retract()
    const hop = lift && retracted && p.zHop > 0
    if (hop) body.push(`G1 Z${f3(Math.max(cz, z) + p.zHop)}${f(p.travelSpeed)}`)
    const zCode = layerChange && !hop ? ` Z${f3(z)}` : ""
    body.push(`G1 X${f3(to.x)} Y${f3(to.y)}${zCode}${f(p.travelSpeed)}`)
    if (hop) body.push(`G1 Z${f3(z)}${f(p.travelSpeed)}`)
    time += d / p.travelSpeed + (layerChange ? Math.abs(z - cz) / 10 : 0)
    travelMm += d
    cx = to.x
    cy = to.y
    cz = z
    located = true
    unretract()
  }

  for (const layer of layers) {
    const n = layer.index + 1
    body.push(`\n; Layer ${n} / ${total} at Z=${f3(layer.z)}`, `;LAYER:${layer.index}`, `;HEIGHT:${layer.height}`)
    if (n >= p.fanFromLayer && p.fanSpeed > 0) setFan(p.fanSpeed)
    if (n < p.fanFromLayer) setFan(0)
    // A layer that would be over too quickly is slowed down so the plastic can set.
    const speeds = layer.paths.map((path) => {
      const base = p.printSpeed * (layer.index === 0 ? p.firstLayerSpeed : speedFactor(path.kind, p))
      return base
    })
    let layerTime = 0
    layer.paths.forEach((path, idx) => {
      const melt = p.maxVolumetricFlow > 0 ? p.maxVolumetricFlow / (p.extrusionWidth * (path.widthScale ?? 1) * layer.height) : Infinity
      layerTime += pathLength(path.points) / Math.min(speeds[idx]!, melt)
    })
    const slow = p.minLayerTime > 0 && layerTime > 0 && layerTime < p.minLayerTime ? layerTime / p.minLayerTime : 1
    layer.paths.forEach((path, idx) => {
      const points = path.points
      if (points.length < 2) return
      const z0 = path.zs?.[0] ?? layer.z
      if (path.kind !== lastType) { body.push(`;TYPE:${TYPE_NAMES[path.kind]}`); lastType = path.kind }
      const bridge = path.kind === "bridge"
      if (bridge && p.fanSpeed > 0) setFan(100)
      travel(points[0]!, z0)
      const width = p.extrusionWidth * (path.widthScale ?? 1)
      // The hotend melts only so much per second: a thick, wide bead is printed slower than the speed asked for.
      const melt = p.maxVolumetricFlow > 0 ? p.maxVolumetricFlow / (width * layer.height) : Infinity
      const limited = Math.min(speeds[idx]!, melt)
      const speed = Math.max(Math.min(10, limited), limited * slow)
      const area = bridge ? Math.PI * (p.nozzleDiameter / 2) ** 2 : width * layer.height
      const perMm = (area / filamentArea) * p.flow * (bridge ? 0.95 : 1)
      let prev = points[0]!
      let pathTime = speed / accel
      for (let k = 1; k < points.length; k++) {
        const q = points[k]!
        const len = Math.hypot(q.x - prev.x, q.y - prev.y)
        if (len < 1e-6) continue
        const amount = len * perMm
        e += amount
        extrudedMm += amount
        const z = path.zs?.[k]
        const zCode = z !== undefined ? ` Z${f3(z)}` : ""
        if (z !== undefined) cz = z
        body.push(`G1 X${f3(q.x)} Y${f3(q.y)}${zCode} E${extrusionWord()}${f(speed)}`)
        pathTime += len / speed
        lengthByKind[path.kind] = (lengthByKind[path.kind] ?? 0) + len
        if (PART_KINDS.has(path.kind)) {
          if (q.x < minX) minX = q.x
          if (q.x > maxX) maxX = q.x
          if (q.y < minY) minY = q.y
          if (q.y > maxY) maxY = q.y
          maxZ = Math.max(maxZ, z ?? layer.z)
        }
        prev = q
      }
      time += pathTime
      cx = prev.x
      cy = prev.y
      if (bridge && p.fanSpeed > 0) setFan(layer.index + 1 >= p.fanFromLayer ? p.fanSpeed : 0)
    })
  }

  const filamentMm = Number(extrudedMm.toFixed(5))
  const grams = (filamentMm * filamentArea) / 1000 * filamentDensity(p.material)
  const size = isFinite(minX) ? { x: maxX - minX, y: maxY - minY, z: maxZ } : { x: 0, y: 0, z: 0 }
  const stats: PrintStats = { layers: total, filamentMm, filamentGrams: grams, timeSeconds: time, travelMm, retractions, lengthByKind, size }

  const header = [
    "; Generated by the CADCAMFUN print slicer",
    `; FLAVOR:${p.flavor === "klipper" ? "Klipper" : p.flavor === "reprap" ? "RepRap" : "Marlin"}`,
    `; Layers: ${total}, layer height ${p.layerHeight} mm, nozzle ${p.nozzleDiameter} mm, bead ${p.extrusionWidth} mm`,
    `; Walls ${p.walls}, top ${p.topLayers}, bottom ${p.bottomLayers}, infill ${p.infillDensity}% ${p.infillPattern}, support ${p.support}, adhesion ${p.adhesion}`,
    `; Estimated time ${Math.round(time)} s, filament ${filamentMm.toFixed(1)} mm (${grams.toFixed(1)} g)`,
    `; Part size ${f3(size.x)} x ${f3(size.y)} x ${f3(size.z)} mm`,
    ...input.notes.map((line) => (line.startsWith(";") ? line : `; ${line}`))
  ].join("\n")
  const gcode = `${header}\n${startBlock(p, firstZ)}${prime.gcode}\n${body.join("\n")}\n${endBlock(p, layers[layers.length - 1]?.z ?? 0, retracted)}`
  return { gcode, stats }
}

export type { Extrusion }
