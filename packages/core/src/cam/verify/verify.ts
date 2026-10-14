/**
 * Toolpath verification (spec 04-core-cam.md §10): replays G-code or IR against a stock model.
 *
 *  - material removal on a height field (what is left, how much was cut, how much of the feed cut air);
 *  - rapids through material, shank and holder collisions, cutting below the stock, fixture collisions;
 *  - with a target, gouges and uncut stock.
 *
 * Pure and deterministic: the same request gives the same report. A clean report is evidence about the
 * modelled tool, stock and fixtures at the reported resolution; it is not a machine certification.
 */
import { meshOf } from "../../cad/solid.ts"
import type { P3 } from "../testing/gcode-interpreter.ts"
import { EPS, HeightField } from "./heightfield.ts"
import { forEachSample, pathFromGcode, pathFromProgram, sampleCount, type PathSegment } from "./path.ts"
import type { VerifyBounds, VerifyCode, VerifyIssue, VerifyRequest, VerifyResponse } from "./schema.ts"
import { toolModel, type ToolModel } from "./tool-model.ts"

/** Upper bounds that keep a verification interactive. */
export const MAX_CELLS = 2_500_000
export const MAX_SAMPLES = 3_000_000
export const WORK_BUDGET = 80_000_000
const PREVIEW_SIDE = 64
const MAX_WARNINGS = 20

const emptyStats = (cell: number): VerifyResponse["stats"] => ({
  cellSize: cell, cellsX: 0, cellsY: 0, samples: 0, stockVolume: 0, removedVolume: 0, remainingVolume: 0, engagedLength: 0, airCutLength: 0
})

const emptyPreview = (): VerifyResponse["preview"] => ({
  nx: 0, ny: 0, minX: 0, minY: 0, cellX: 0, cellY: 0, minZ: 0, maxZ: 0, heights: [], gouge: []
})

const invalid = (message: string): VerifyResponse => ({
  ok: false,
  issues: [{ code: "InvalidInput", severity: "error", message, count: 1 }],
  stats: emptyStats(0),
  preview: emptyPreview()
})

const fmt = (n: number): string => n.toFixed(3)

const validBounds = (b: VerifyBounds): boolean =>
  [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every(Number.isFinite) && b.minX < b.maxX && b.minY < b.maxY && b.minZ < b.maxZ

interface Plan {
  readonly cellX: number
  readonly cellY: number
  readonly nx: number
  readonly ny: number
  readonly cell: number
  readonly samples: number
  readonly coarsened: boolean
}

/** Cell size that fits the cell, sample and work budgets. */
const plan = (stock: VerifyBounds, segments: ReadonlyArray<PathSegment>, model: ToolModel, requested: number): Plan => {
  const width = stock.maxX - stock.minX
  const height = stock.maxY - stock.minY
  let cell = Math.max(requested, Math.sqrt((width * height) / MAX_CELLS))
  for (let attempt = 0; attempt < 8; attempt++) {
    let samples = 0
    for (const s of segments) samples += sampleCount(s, cell)
    const footprint = Math.max(1, (Math.PI * model.radius * model.radius) / (cell * cell))
    const work = samples * footprint
    if (samples <= MAX_SAMPLES && work <= WORK_BUDGET) {
      const nx = Math.max(1, Math.ceil(width / cell))
      const ny = Math.max(1, Math.ceil(height / cell))
      return { cell, nx, ny, cellX: width / nx, cellY: height / ny, samples, coarsened: cell > requested * (1 + 1e-9) }
    }
    cell *= Math.max(1.25, Math.min(4, Math.cbrt(Math.max(work / WORK_BUDGET, samples / MAX_SAMPLES))))
  }
  const nx = Math.max(1, Math.ceil(width / cell))
  const ny = Math.max(1, Math.ceil(height / cell))
  return { cell, nx, ny, cellX: width / nx, cellY: height / ny, samples: 0, coarsened: true }
}

class Findings {
  private readonly byKey = new Map<string, VerifyIssue & { lastSegment: number }>()

  add(
    code: VerifyCode,
    severity: VerifyIssue["severity"],
    message: string,
    segment: number,
    line: number | undefined,
    point: P3 | undefined,
    fixtureId?: string
  ): void {
    const key = `${code}/${fixtureId ?? ""}`
    const found = this.byKey.get(key)
    if (found !== undefined) {
      if (found.lastSegment !== segment) {
        this.byKey.set(key, { ...found, count: found.count + 1, lastSegment: segment })
      }
      return
    }
    this.byKey.set(key, {
      code,
      severity,
      message,
      count: 1,
      ...(line !== undefined ? { line } : {}),
      ...(point !== undefined ? { point: { x: point.x, y: point.y, z: point.z } } : {}),
      ...(fixtureId !== undefined ? { fixtureId } : {}),
      lastSegment: segment
    })
  }

  list(): VerifyIssue[] {
    return [...this.byKey.values()].map(({ lastSegment: _, ...issue }) => issue)
  }
}

const circleHitsBox = (cx: number, cy: number, r: number, b: VerifyBounds): boolean => {
  const dx = Math.max(b.minX - cx, 0, cx - b.maxX)
  const dy = Math.max(b.minY - cy, 0, cy - b.maxY)
  return dx * dx + dy * dy < r * r - EPS
}

export const verifyToolpath = (request: VerifyRequest): VerifyResponse => {
  const hasGcode = request.gcode !== undefined
  const hasProgram = request.program !== undefined
  if (hasGcode === hasProgram) return invalid("Provide exactly one of gcode or program")
  if (!validBounds(request.stock)) return invalid("Stock must be a finite box with positive volume")
  for (const fixture of request.fixtures) {
    if (!validBounds(fixture.bounds)) return invalid(`Fixture "${fixture.id}" must be a finite box with positive volume`)
  }
  if (!(request.tool.diameter > 0) || !Number.isFinite(request.tool.diameter)) return invalid("Tool diameter must be positive")

  const stock = request.stock
  const model = toolModel(request.tool)
  const replay = request.gcode !== undefined
    ? pathFromGcode(request.gcode, request.start)
    : pathFromProgram(request.program!, request.start)
  const segments = replay.segments.filter((s) =>
    [s.from.x, s.from.y, s.from.z, s.to.x, s.to.y, s.to.z].every(Number.isFinite))

  const requested = request.resolution ?? request.tool.diameter / 10
  const grid = plan(stock, segments, model, requested)
  const field = new HeightField(grid.nx, grid.ny, stock.minX, stock.minY, stock.maxX - stock.minX, stock.maxY - stock.minY, stock.minZ, stock.maxZ)
  const findings = new Findings()
  const issuesFirst: VerifyIssue[] = []

  for (const warning of replay.warnings.slice(0, MAX_WARNINGS)) {
    issuesFirst.push({ code: "InterpreterWarning", severity: "warning", message: warning, count: 1 })
  }
  if (replay.warnings.length > MAX_WARNINGS) {
    issuesFirst.push({ code: "InterpreterWarning", severity: "warning", message: `${replay.warnings.length - MAX_WARNINGS} more interpreter warnings omitted`, count: replay.warnings.length - MAX_WARNINGS })
  }
  if (grid.coarsened) {
    issuesFirst.push({
      code: "ResolutionCoarsened",
      severity: "info",
      message: `Resolution coarsened to ${fmt(grid.cell)} mm (requested ${fmt(requested)} mm) to keep the verification within its compute budget`,
      count: 1
    })
  }

  const shankChecked = model.fluteLength !== undefined && model.shankRadius > 0
  const holderChecked = model.holderStart !== undefined && model.holderRadius !== undefined
  const step = grid.cell
  let removed = 0
  let engaged = 0
  let air = 0
  let samples = 0

  segments.forEach((segment, index) => {
    const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y, segment.to.z - segment.from.z)
    let segmentRemoved = 0
    forEachSample(segment, step, (x, y, z) => {
      samples++
      const tip: P3 = { x, y, z }
      const here = (code: VerifyCode, severity: VerifyIssue["severity"], message: string, fixtureId?: string): void =>
        findings.add(code, severity, message, index, segment.line, tip, fixtureId)

      if (z < stock.minZ - EPS && x > stock.minX - model.radius && x < stock.maxX + model.radius && y > stock.minY - model.radius && y < stock.maxY + model.radius) {
        here("BelowStock", "error",
          `Tool tip goes ${fmt(stock.minZ - z)} mm below the stock bottom at X${fmt(x)} Y${fmt(y)} Z${fmt(z)}: it would cut into the table or fixture`)
      }

      // Shank and holder are checked against the stock as it is *before* this sample cuts: a column the
      // flutes are about to remove still has to clear the shank above them.
      if (shankChecked && field.reaches(x, y, model.shankRadius, z + model.fluteLength!)) {
        here("ShankCollision", "error",
          `Material above the ${fmt(model.fluteLength!)} mm flutes touches the shank at X${fmt(x)} Y${fmt(y)} Z${fmt(z)}: use a longer cutter or less depth`)
      }
      if (holderChecked && field.reaches(x, y, model.holderRadius!, z + model.holderStart!)) {
        here("HolderCollision", "error",
          `The holder (Ø${fmt(model.holderRadius! * 2)} mm) hits the stock at X${fmt(x)} Y${fmt(y)} Z${fmt(z)}: increase the stickout or reduce the depth`)
      }
      if (segment.rapid) {
        if (field.touches(model, x, y, z)) {
          here("RapidInMaterial", "error", `Rapid move enters material at X${fmt(x)} Y${fmt(y)} Z${fmt(z)}`)
        }
      } else {
        segmentRemoved += field.cut(model, x, y, z)
      }

      for (const fixture of request.fixtures) {
        const b = fixture.bounds
        for (const zone of model.zones) {
          if (z + zone.to <= b.minZ + EPS || z + zone.from >= b.maxZ - EPS) continue
          if (!circleHitsBox(x, y, zone.radius, b)) continue
          here("FixtureCollision", "error", `The ${zone.part} collide with fixture "${fixture.id}" at X${fmt(x)} Y${fmt(y)} Z${fmt(z)}`, fixture.id)
          break
        }
      }
    })
    removed += segmentRemoved
    if (!segment.rapid) {
      if (segmentRemoved > EPS) engaged += length
      else air += length
    }
  })

  const issues: VerifyIssue[] = [...issuesFirst, ...findings.list()]
  const stockVolume = field.width * field.height * (field.ceiling - field.floor)
  const stats: { -readonly [K in keyof VerifyResponse["stats"]]: VerifyResponse["stats"][K] } = {
    cellSize: grid.cell,
    cellsX: grid.nx,
    cellsY: grid.ny,
    samples,
    stockVolume,
    removedVolume: removed,
    remainingVolume: field.volume(),
    engagedLength: engaged,
    airCutLength: air
  }

  // ------------------------------------------------------------ target comparison
  let gougeCells: Uint8Array | undefined
  if (request.target !== undefined && (request.target.solids.length > 0 || (request.target.meshes?.length ?? 0) > 0)) {
    const meshes = [
      ...request.target.solids.map((solid) => meshOf(solid, Math.max(0.01, Math.min(0.1, grid.cell / 2)))),
      ...(request.target.meshes ?? []).map((m) => ({ positions: Float32Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
    ]
    const target = field.rasterise(meshes)
    for (const r of request.target.reliefs ?? []) {
      for (let j = 0; j < field.ny; j++) for (let i = 0; i < field.nx; i++) {
        if (Math.hypot(field.centreX(i) - r.x, field.centreY(j) - r.y) <= r.radius) {
          const k = j * field.nx + i
          target[k] = Math.min(target[k]!, r.bottom)
        }
      }
    }
    const around = field.neighbourhood(target)
    const tolerance = request.tolerance
    const area = field.cellArea
    gougeCells = new Uint8Array(field.top.length)
    let gouge = 0, maxGouge = 0, gougeCount = 0, uncut = 0, maxUncut = 0, uncutCount = 0
    let worst = -1
    for (let k = 0; k < field.top.length; k++) {
      const top = field.top[k]!
      const low = around.min[k]! - top
      if (low > tolerance) {
        gougeCells[k] = 1
        gouge += low * area
        gougeCount++
        if (low > maxGouge) { maxGouge = low; worst = k }
      }
      const high = top - around.max[k]!
      if (high > tolerance) {
        uncut += high * area
        uncutCount++
        if (high > maxUncut) maxUncut = high
      }
    }
    stats.gougeVolume = gouge
    stats.maxGouge = maxGouge
    stats.uncutVolume = uncut
    stats.maxUncut = maxUncut
    if (gougeCount > 0) {
      const i = worst % grid.nx
      const j = Math.floor(worst / grid.nx)
      issues.push({
        code: "Gouge",
        severity: "error",
        message: `${gougeCount} cells cut below the finished part by more than ${fmt(tolerance)} mm (deepest ${fmt(maxGouge)} mm, ${fmt(gouge)} mm³)`,
        count: gougeCount,
        point: { x: field.centreX(i), y: field.centreY(j), z: field.top[worst]! }
      })
    }
    if (uncutCount > 0) {
      issues.push({
        code: "UncutStock",
        severity: "info",
        message: `${fmt(uncut)} mm³ of stock remain above the finished part (up to ${fmt(maxUncut)} mm) in ${uncutCount} cells`,
        count: uncutCount
      })
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    stats,
    preview: previewOf(field, gougeCells)
  }
}

/** Block-averaged remaining stock, at most `PREVIEW_SIDE` cells on the longer side. */
const previewOf = (field: HeightField, gouge: Uint8Array | undefined): VerifyResponse["preview"] => {
  const block = Math.max(1, Math.ceil(Math.max(field.nx, field.ny) / PREVIEW_SIDE))
  const nx = Math.ceil(field.nx / block)
  const ny = Math.ceil(field.ny / block)
  const heights: number[] = []
  const flags: number[] = []
  let minZ = Infinity
  let maxZ = -Infinity
  for (let bj = 0; bj < ny; bj++) {
    for (let bi = 0; bi < nx; bi++) {
      let sum = 0, count = 0, flag = 0
      for (let j = bj * block; j < Math.min(field.ny, (bj + 1) * block); j++) {
        for (let i = bi * block; i < Math.min(field.nx, (bi + 1) * block); i++) {
          const k = j * field.nx + i
          sum += field.top[k]!
          count++
          if (gouge?.[k] === 1) flag = 1
        }
      }
      const h = Math.round((sum / count) * 1000) / 1000
      heights.push(h)
      flags.push(flag)
      if (h < minZ) minZ = h
      if (h > maxZ) maxZ = h
    }
  }
  return {
    nx, ny, minX: field.minX, minY: field.minY,
    cellX: field.cellX * block, cellY: field.cellY * block,
    minZ, maxZ, heights, gouge: gouge === undefined ? [] : flags
  }
}
