/**
 * DXF import/export (spec 03-core-cad.md §3, stretch goal).
 *
 * Supported entities: LINE, CIRCLE, ARC, LWPOLYLINE (with bulge), ELLIPSE (full),
 * TEXT/MTEXT. Everything else is skipped and reported once per type in
 * `warnings`. Layers (LAYER table) and `$INSUNITS` are honoured.
 *
 * Units: geometry in a `Drawing` is always millimetres. On import, coordinates
 * are scaled to mm according to `$INSUNITS` (inch, cm and m are converted) and
 * `units` is set to `"inch"` only for inch files; on export, an `"inch"` drawing
 * is written in inches with `$INSUNITS = 1`.
 *
 * Angles are degrees on the DXF side only (a format boundary); entities keep radians.
 */
import { normalizeAngle } from "./arc-math.ts"
import {
  baseEntity,
  type Drawing,
  type Entity,
  type Layer
} from "./entities.ts"
import { tessellate } from "./tessellate.ts"
import { IDENTITY_AFFINE, applyTransform } from "./transform.ts"
import { TAU, type Vec2 } from "./vec.ts"

export interface DxfResult {
  readonly drawing: Drawing
  /** One human-readable line per skipped or repaired element kind. */
  readonly warnings: ReadonlyArray<string>
}

export interface DxfParseOptions {
  readonly id?: string
  readonly name?: string
  /** Prefix of generated entity ids (`<prefix>1`, `<prefix>2`, ...). Default `dxf-`. */
  readonly idPrefix?: string
}

interface Pair {
  readonly code: number
  readonly value: string
}

const MM_PER_INCH = 25.4

/** Splits a DXF document into (code, value) pairs, tolerating CRLF and stray whitespace. */
const parsePairs = (text: string): Pair[] => {
  const lines = text.split(/\r\n|\r|\n/)
  const pairs: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i]!.trim(), 10)
    if (!Number.isFinite(code)) break
    pairs.push({ code, value: lines[i + 1]!.trim() })
  }
  return pairs
}

const first = (pairs: ReadonlyArray<Pair>, code: number): string | undefined => pairs.find((p) => p.code === code)?.value

const num = (pairs: ReadonlyArray<Pair>, code: number): number | undefined => {
  const raw = first(pairs, code)
  if (raw === undefined) return undefined
  const v = Number.parseFloat(raw)
  return Number.isFinite(v) ? v : undefined
}

interface Chunk {
  readonly section: string
  readonly type: string
  readonly pairs: Pair[]
}

/** Groups pairs into `(section, entity-type, body)` chunks. */
const chunksOf = (pairs: ReadonlyArray<Pair>): Chunk[] => {
  const chunks: Chunk[] = []
  let section = ""
  let current: Chunk | undefined
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!
    if (p.code === 0 && p.value === "SECTION") {
      section = pairs[i + 1]?.code === 2 ? pairs[i + 1]!.value : ""
      i += 1
      current = undefined
      continue
    }
    if (p.code === 0 && (p.value === "ENDSEC" || p.value === "EOF")) {
      section = ""
      current = undefined
      continue
    }
    if (p.code === 0) {
      current = { section, type: p.value, pairs: [] }
      chunks.push(current)
      continue
    }
    if (current !== undefined) current.pairs.push(p)
  }
  return chunks
}

/** `$INSUNITS` from the HEADER section, if present. */
const headerUnits = (pairs: ReadonlyArray<Pair>): number | undefined => {
  for (let i = 0; i + 1 < pairs.length; i++) {
    if (pairs[i]!.code === 9 && pairs[i]!.value === "$INSUNITS" && pairs[i + 1]!.code === 70) {
      const v = Number.parseInt(pairs[i + 1]!.value, 10)
      return Number.isFinite(v) ? v : undefined
    }
  }
  return undefined
}

/** AutoCAD Color Index to CSS colour for the basic indices; everything else falls back. */
const ACI_COLORS: Readonly<Record<number, string>> = {
  1: "#ff0000",
  2: "#ffff00",
  3: "#00ff00",
  4: "#00ffff",
  5: "#0000ff",
  6: "#ff00ff",
  7: "#ffffff"
}
const DEFAULT_LAYER_COLOR = "#1e88e5"

const colorToAci = (css: string): number => {
  const normalized = css.toLowerCase()
  for (const [index, color] of Object.entries(ACI_COLORS)) if (color === normalized) return Number(index)
  return 7
}

const layerIdOf = (name: string): string => (name === "0" ? "layer-0" : `layer:${name}`)

/** Parses a DXF document into a `Drawing`. Unknown entities become warnings. */
export const parseDxf = (text: string, options: DxfParseOptions = {}): DxfResult => {
  const pairs = parsePairs(text)
  const warnings: string[] = []
  if (pairs.length === 0) warnings.push("DXF document contains no readable code/value pairs")

  const insUnits = headerUnits(pairs)
  const unitScale = insUnits === 1 ? MM_PER_INCH : insUnits === 5 ? 10 : insUnits === 6 ? 1000 : 1
  if (insUnits !== undefined && ![0, 1, 4, 5, 6].includes(insUnits)) {
    warnings.push(`Unsupported $INSUNITS ${insUnits}; treating coordinates as millimetres`)
  }
  const s = (v: number): number => v * unitScale
  const prefix = options.idPrefix ?? "dxf-"
  let counter = 0
  const nextId = (): string => `${prefix}${++counter}`

  const layers: Layer[] = [{ id: "layer-0", name: "0", visible: true, locked: false, color: DEFAULT_LAYER_COLOR }]
  const layerIds = new Set(["layer-0"])
  const ensureLayer = (name: string): string => {
    const id = layerIdOf(name)
    if (!layerIds.has(id)) {
      layerIds.add(id)
      layers.push({ id, name, visible: true, locked: false, color: DEFAULT_LAYER_COLOR })
    }
    return id
  }

  const chunks = chunksOf(pairs)
  for (const chunk of chunks) {
    if (chunk.section !== "TABLES" || chunk.type !== "LAYER") continue
    const name = first(chunk.pairs, 2)
    if (name === undefined) continue
    const id = ensureLayer(name)
    const flags = num(chunk.pairs, 70) ?? 0
    const aci = num(chunk.pairs, 62)
    const index = layers.findIndex((l) => l.id === id)
    layers[index] = {
      id,
      name,
      visible: aci === undefined || aci >= 0,
      locked: (flags & 4) === 4,
      color: ACI_COLORS[Math.abs(aci ?? 7)] ?? DEFAULT_LAYER_COLOR
    }
  }

  const entities: Entity[] = []
  const skipped = new Map<string, number>()
  const skip = (type: string): void => {
    skipped.set(type, (skipped.get(type) ?? 0) + 1)
  }

  for (const chunk of chunks) {
    if (chunk.section !== "ENTITIES") continue
    const p = chunk.pairs
    const layerId = ensureLayer(first(p, 8) ?? "0")
    const base = (): ReturnType<typeof baseEntity> => baseEntity(nextId(), layerId)
    switch (chunk.type) {
      case "LINE": {
        const x1 = num(p, 10)
        const y1 = num(p, 20)
        const x2 = num(p, 11)
        const y2 = num(p, 21)
        if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
          skip("LINE without coordinates")
          break
        }
        entities.push({ ...base(), _tag: "Line", start: { x: s(x1), y: s(y1) }, end: { x: s(x2), y: s(y2) } })
        break
      }
      case "CIRCLE": {
        const cx = num(p, 10)
        const cy = num(p, 20)
        const r = num(p, 40)
        if (cx === undefined || cy === undefined || r === undefined || r <= 0) {
          skip("CIRCLE without centre or radius")
          break
        }
        entities.push({ ...base(), _tag: "Circle", center: { x: s(cx), y: s(cy) }, radius: s(r) })
        break
      }
      case "ARC": {
        const cx = num(p, 10)
        const cy = num(p, 20)
        const r = num(p, 40)
        const a0 = num(p, 50)
        const a1 = num(p, 51)
        if (cx === undefined || cy === undefined || r === undefined || r <= 0 || a0 === undefined || a1 === undefined) {
          skip("ARC without centre, radius or angles")
          break
        }
        // DXF arcs always run counter-clockwise from the start to the end angle.
        entities.push({
          ...base(),
          _tag: "Arc",
          center: { x: s(cx), y: s(cy) },
          radius: s(r),
          startAngle: normalizeAngle((a0 * Math.PI) / 180),
          endAngle: normalizeAngle((a1 * Math.PI) / 180),
          clockwise: false
        })
        break
      }
      case "LWPOLYLINE": {
        // Vertices are `10`/`20` pairs; an optional `42` bulge belongs to the vertex before it.
        const points: Vec2[] = []
        const bulge: number[] = []
        let pendingX: number | undefined
        for (const q of p) {
          if (q.code === 10) pendingX = Number.parseFloat(q.value)
          else if (q.code === 20 && pendingX !== undefined) {
            points.push({ x: s(pendingX), y: s(Number.parseFloat(q.value)) })
            bulge.push(0)
            pendingX = undefined
          } else if (q.code === 42 && bulge.length > 0) bulge[bulge.length - 1] = Number.parseFloat(q.value)
        }
        const valid = points.length >= 2 && points.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
        if (!valid) {
          skip("LWPOLYLINE with fewer than two valid vertices")
          break
        }
        const closed = ((num(p, 70) ?? 0) & 1) === 1
        const clean = bulge.map((b) => (Number.isFinite(b) ? b : 0))
        entities.push({
          ...base(),
          _tag: "Polyline",
          points,
          closed,
          ...(clean.some((b) => Math.abs(b) > 1e-12) ? { bulge: clean } : {})
        })
        break
      }
      case "ELLIPSE": {
        const cx = num(p, 10)
        const cy = num(p, 20)
        const mx = num(p, 11)
        const my = num(p, 21)
        const ratio = num(p, 40)
        const t0 = num(p, 41) ?? 0
        const t1 = num(p, 42) ?? TAU
        if (cx === undefined || cy === undefined || mx === undefined || my === undefined || ratio === undefined) {
          skip("ELLIPSE without centre, axis or ratio")
          break
        }
        if (Math.abs(t1 - t0 - TAU) > 1e-6 && Math.abs(t1 - t0) > 1e-6) {
          skip("ELLIPSE arcs (only full ellipses are supported)")
          break
        }
        const major = Math.hypot(mx, my)
        if (major <= 0 || ratio <= 0) {
          skip("degenerate ELLIPSE")
          break
        }
        entities.push({
          ...base(),
          _tag: "Ellipse",
          center: { x: s(cx), y: s(cy) },
          radiusX: s(major),
          radiusY: s(major * ratio),
          rotation: Math.atan2(my, mx)
        })
        break
      }
      case "TEXT":
      case "MTEXT": {
        const x = num(p, 10)
        const y = num(p, 20)
        if (x === undefined || y === undefined) {
          skip(`${chunk.type} without insertion point`)
          break
        }
        const height = num(p, 40) ?? 2.5
        entities.push({
          ...base(),
          _tag: "Text",
          position: { x: s(x), y: s(y) },
          text: (first(p, 1) ?? "").replace(/\\P/g, "\n"),
          fontSize: height > 0 ? s(height) : 2.5,
          fontFamily: "Helvetica",
          rotation: ((num(p, 50) ?? 0) * Math.PI) / 180,
          alignment: "left",
          baseline: "bottom"
        })
        break
      }
      default:
        if (chunk.type.length > 0) skip(chunk.type)
    }
  }
  for (const [type, count] of skipped) warnings.push(`Skipped ${count} unsupported DXF entit${count === 1 ? "y" : "ies"}: ${type}`)

  const drawing: Drawing = {
    schemaVersion: 1,
    id: options.id ?? "dxf-drawing",
    name: options.name ?? "Imported DXF",
    units: insUnits === 1 ? "inch" : "mm",
    layers,
    entities,
    version: 0
  }
  return { drawing, warnings }
}

// ---------------------------------------------------------------- writing

const pair = (code: number, value: string | number): string => `${code}\n${value}\n`

/** Fixed six decimals with trailing zeros trimmed; never `-0`. */
const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return "0"
  const fixed = n.toFixed(6)
  if (Number(fixed) === 0) return "0"
  return fixed.replace(/\.?0+$/, "")
}

/** Flattens blocks (children are placed at their base point) and bakes local transforms. */
const flatten = (entities: ReadonlyArray<Entity>, offset: Vec2 = { x: 0, y: 0 }): Entity[] => {
  const out: Entity[] = []
  for (const raw of entities) {
    const entity = raw.transform === undefined ? raw : applyTransform(raw, IDENTITY_AFFINE)
    if (entity._tag === "Block") {
      out.push(...flatten(entity.entities, { x: offset.x + entity.basePoint.x, y: offset.y + entity.basePoint.y }))
    } else if (offset.x !== 0 || offset.y !== 0) {
      out.push(applyTransform(entity, { ...IDENTITY_AFFINE, e: offset.x, f: offset.y }))
    } else out.push(entity)
  }
  return out
}

/** Serialises a drawing to DXF (R2000 layout: LINE, CIRCLE, ARC, LWPOLYLINE, ELLIPSE, TEXT). */
export const writeDxf = (drawing: Drawing): string => {
  const inch = drawing.units === "inch"
  const k = inch ? 1 / MM_PER_INCH : 1
  const f = (n: number): string => fmt(n * k)
  const layerName = (layerId: string): string => drawing.layers.find((l) => l.id === layerId)?.name ?? "0"
  const out: string[] = []

  out.push(pair(0, "SECTION"), pair(2, "HEADER"))
  out.push(pair(9, "$ACADVER"), pair(1, "AC1015"))
  out.push(pair(9, "$INSUNITS"), pair(70, inch ? 1 : 4))
  out.push(pair(0, "ENDSEC"))

  out.push(pair(0, "SECTION"), pair(2, "TABLES"), pair(0, "TABLE"), pair(2, "LAYER"), pair(70, drawing.layers.length))
  for (const layer of drawing.layers) {
    out.push(pair(0, "LAYER"), pair(2, layer.name), pair(70, layer.locked ? 4 : 0))
    out.push(pair(62, layer.visible ? colorToAci(layer.color) : -colorToAci(layer.color)), pair(6, "CONTINUOUS"))
  }
  out.push(pair(0, "ENDTAB"), pair(0, "ENDSEC"))

  out.push(pair(0, "SECTION"), pair(2, "ENTITIES"))
  const head = (type: string, layerId: string, sub: string): void => {
    out.push(pair(0, type), pair(100, "AcDbEntity"), pair(8, layerName(layerId)), pair(100, sub))
  }
  const polyline = (layerId: string, points: ReadonlyArray<Vec2>, closed: boolean, bulge?: ReadonlyArray<number>): void => {
    head("LWPOLYLINE", layerId, "AcDbPolyline")
    out.push(pair(90, points.length), pair(70, closed ? 1 : 0))
    points.forEach((pt, i) => {
      out.push(pair(10, f(pt.x)), pair(20, f(pt.y)))
      const b = bulge?.[i] ?? 0
      if (Math.abs(b) > 1e-12) out.push(pair(42, fmt(b)))
    })
  }
  for (const entity of flatten(drawing.entities)) {
    switch (entity._tag) {
      case "Line":
        head("LINE", entity.layerId, "AcDbLine")
        out.push(pair(10, f(entity.start.x)), pair(20, f(entity.start.y)), pair(30, 0))
        out.push(pair(11, f(entity.end.x)), pair(21, f(entity.end.y)), pair(31, 0))
        break
      case "Circle":
        head("CIRCLE", entity.layerId, "AcDbCircle")
        out.push(pair(10, f(entity.center.x)), pair(20, f(entity.center.y)), pair(30, 0), pair(40, f(entity.radius)))
        break
      case "Arc": {
        const full = Math.abs(entity.startAngle - entity.endAngle) < 1e-12
        if (full) {
          head("CIRCLE", entity.layerId, "AcDbCircle")
          out.push(pair(10, f(entity.center.x)), pair(20, f(entity.center.y)), pair(30, 0), pair(40, f(entity.radius)))
          break
        }
        // DXF arcs are counter-clockwise only: a clockwise arc is the same curve with its ends swapped.
        const a0 = entity.clockwise ? entity.endAngle : entity.startAngle
        const a1 = entity.clockwise ? entity.startAngle : entity.endAngle
        head("ARC", entity.layerId, "AcDbCircle")
        out.push(pair(10, f(entity.center.x)), pair(20, f(entity.center.y)), pair(30, 0), pair(40, f(entity.radius)))
        out.push(pair(100, "AcDbArc"), pair(50, fmt((a0 * 180) / Math.PI)), pair(51, fmt((a1 * 180) / Math.PI)))
        break
      }
      case "Polyline":
        polyline(entity.layerId, entity.points, entity.closed, entity.bulge)
        break
      case "Rectangle": {
        const x0 = Math.min(entity.corner1.x, entity.corner2.x)
        const x1 = Math.max(entity.corner1.x, entity.corner2.x)
        const y0 = Math.min(entity.corner1.y, entity.corner2.y)
        const y1 = Math.max(entity.corner1.y, entity.corner2.y)
        polyline(entity.layerId, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], true)
        break
      }
      case "Ellipse": {
        // DXF stores the major axis; swap the radii (and quarter-turn the rotation) when Y is longer.
        const swap = entity.radiusY > entity.radiusX
        const major = swap ? entity.radiusY : entity.radiusX
        const minor = swap ? entity.radiusX : entity.radiusY
        const rot = entity.rotation + (swap ? Math.PI / 2 : 0)
        head("ELLIPSE", entity.layerId, "AcDbEllipse")
        out.push(pair(10, f(entity.center.x)), pair(20, f(entity.center.y)), pair(30, 0))
        out.push(pair(11, f(major * Math.cos(rot))), pair(21, f(major * Math.sin(rot))), pair(31, 0))
        out.push(pair(40, fmt(minor / major)), pair(41, 0), pair(42, fmt(TAU)))
        break
      }
      case "Spline":
      case "Hatch": {
        // Not representable in the supported subset: written as a polyline approximation (0.01 mm).
        const closed = entity._tag === "Hatch" ? true : entity.closed
        for (const ring of tessellate(entity, 0.01)) if (ring.length >= 2) polyline(entity.layerId, ring, closed)
        break
      }
      case "Text":
        head("TEXT", entity.layerId, "AcDbText")
        out.push(pair(10, f(entity.position.x)), pair(20, f(entity.position.y)), pair(30, 0))
        out.push(pair(40, f(entity.fontSize)), pair(1, entity.text.replace(/\r?\n/g, " ")))
        out.push(pair(50, fmt((entity.rotation * 180) / Math.PI)), pair(100, "AcDbText"))
        break
      case "Dimension":
        // Dimensions are annotations; they are not exported.
        break
      case "Block":
        break
    }
  }
  out.push(pair(0, "ENDSEC"), pair(0, "EOF"))
  return out.join("")
}
