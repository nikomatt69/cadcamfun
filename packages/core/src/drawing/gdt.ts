/**
 * Geometric dimensioning and tolerancing on a sheet (ISO 1101 / ASME Y14.5): feature control frames (symbol, tolerance zone,
 * modifier, datum references), datum feature symbols and balloons for a bill of materials. Everything is stroked from lines,
 * circles and arcs, so the symbols export to DXF and PDF with the sheet and need no font. A `Pen` is the drawing surface the
 * sheet generator already has; `fmtTol` makes the zone text.
 */
type P = { readonly x: number; readonly y: number }

export interface Pen {
  line(a: P, b: P, width?: number): void
  circle(c: P, r: number): void
  arc(c: P, r: number, a0: number, a1: number): void
  poly(points: ReadonlyArray<P>, closed: boolean, fill?: boolean): void
  rect(x0: number, y0: number, x1: number, y1: number, width?: number): void
  text(at: P, text: string, size: number, o?: { align?: "left" | "center" | "right"; baseline?: "top" | "middle" | "bottom" }): void
}

export type GdtKind =
  | "straightness" | "flatness" | "circularity" | "cylindricity" | "profile-line" | "profile-surface"
  | "parallelism" | "perpendicularity" | "angularity" | "position" | "concentricity" | "symmetry" | "runout" | "total-runout"

/** Which kinds are form tolerances (no datum) and which need one. */
export const GDT_NEEDS_DATUM: Readonly<Record<GdtKind, boolean>> = {
  straightness: false, flatness: false, circularity: false, cylindricity: false, "profile-line": false, "profile-surface": false,
  parallelism: true, perpendicularity: true, angularity: true, position: false, concentricity: true, symmetry: true, runout: true, "total-runout": true
}

export interface GdtSpec {
  readonly kind: GdtKind
  /** Width of the tolerance zone, mm. */
  readonly value: number
  /** The zone is a cylinder (`Ø` before the value). */
  readonly diameter?: boolean
  /** Material condition modifier after the value: maximum (M), least (L) or regardless (none). */
  readonly modifier?: "M" | "L"
  /** Datum references, primary first (A, B, C). */
  readonly datums?: ReadonlyArray<string>
}

export const fmtTol = (spec: GdtSpec): string => {
  const v = spec.value < 0.1 ? spec.value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(Number(spec.value.toFixed(2)))
  return `${spec.diameter === true ? "Ø" : ""}${v}${spec.modifier === undefined ? "" : ` (${spec.modifier})`}`
}

/** Checks a specification: a positive finite zone, the datums its kind needs, single capital letters. */
export const validateGdt = (spec: GdtSpec): string | undefined => {
  if (!Number.isFinite(spec.value) || spec.value <= 0) return "the tolerance zone must be positive and finite"
  if (GDT_NEEDS_DATUM[spec.kind] && (spec.datums === undefined || spec.datums.length === 0)) return `${spec.kind} needs a datum reference`
  if ((spec.datums ?? []).some((d) => !/^[A-Z]$/.test(d))) return "a datum is one capital letter"
  if (new Set(spec.datums ?? []).size !== (spec.datums ?? []).length) return "a datum is referenced once"
  if (spec.diameter === true && !["position", "concentricity", "straightness", "perpendicularity", "parallelism", "angularity", "runout", "total-runout"].includes(spec.kind)) return `${spec.kind} has no cylindrical zone`
  return undefined
}

const CELL = 7 // frame height and symbol cell width, mm

/** The symbol of a characteristic inside a square cell of side CELL centred on `c`. */
export const drawGdtSymbol = (pen: Pen, kind: GdtKind, c: P): void => {
  const h = CELL * 0.34
  const L = (ax: number, ay: number, bx: number, by: number) => pen.line({ x: c.x + ax, y: c.y + ay }, { x: c.x + bx, y: c.y + by })
  switch (kind) {
    case "flatness": pen.poly([{ x: c.x - h * 1.1, y: c.y - h * 0.55 }, { x: c.x + h * 0.6, y: c.y - h * 0.55 }, { x: c.x + h * 1.1, y: c.y + h * 0.55 }, { x: c.x - h * 0.6, y: c.y + h * 0.55 }], true); break
    case "straightness": L(-h * 1.1, 0, h * 1.1, 0); break
    case "circularity": pen.circle(c, h); break
    case "cylindricity": pen.circle(c, h * 0.8); L(-h * 1.5, -h * 0.9, -h * 0.5, h * 0.9); L(h * 0.5, -h * 0.9, h * 1.5, h * 0.9); break
    case "profile-line": pen.arc(c, h * 1.1, 0, Math.PI); break
    case "profile-surface": pen.arc(c, h * 1.1, 0, Math.PI); L(-h * 1.1, 0, h * 1.1, 0); break
    case "parallelism": L(-h * 0.9, -h, h * 0.1, h); L(-h * 0.1, -h, h * 0.9, h); break
    case "perpendicularity": L(-h * 1.1, -h, h * 1.1, -h); L(0, -h, 0, h); break
    case "angularity": L(-h * 1.1, -h, h * 1.1, -h); L(-h * 1.1, -h, h * 0.7, h); break
    case "position": pen.circle(c, h * 0.9); L(-h * 1.4, 0, h * 1.4, 0); L(0, -h * 1.4, 0, h * 1.4); break
    case "concentricity": pen.circle(c, h * 0.55); pen.circle(c, h * 1.1); break
    case "symmetry": L(-h * 1.1, h * 0.7, h * 1.1, h * 0.7); L(-h * 1.1, 0, h * 1.1, 0); L(-h * 1.1, -h * 0.7, h * 1.1, -h * 0.7); break
    case "runout": L(-h, -h, h, h); pen.poly([{ x: c.x + h, y: c.y + h }, { x: c.x + h * 0.2, y: c.y + h * 0.9 }, { x: c.x + h * 0.9, y: c.y + h * 0.2 }], true, true); break
    case "total-runout": L(-h * 1.3, -h, h * 0.1, h * 0.4); L(-h * 0.3, -h, h * 1.1, h * 0.4); pen.poly([{ x: c.x + h * 0.1, y: c.y + h * 0.4 }, { x: c.x - h * 0.4, y: c.y + h * 0.4 }, { x: c.x + h * 0.1, y: c.y - h * 0.1 }], true, true); break
  }
}

export interface FrameLayout {
  /** Total width, mm. */
  readonly width: number
  readonly height: number
  /** The text a reader (or a report) sees: `⌖ | Ø0.1 (M) | A | B`. */
  readonly text: string
}

const SYMBOL_TEXT: Readonly<Record<GdtKind, string>> = {
  straightness: "straightness", flatness: "flatness", circularity: "circularity", cylindricity: "cylindricity", "profile-line": "profile of a line",
  "profile-surface": "profile of a surface", parallelism: "parallelism", perpendicularity: "perpendicularity", angularity: "angularity", position: "position",
  concentricity: "concentricity", symmetry: "symmetry", runout: "circular runout", "total-runout": "total runout"
}

/** Feature control frame with its lower-left corner at `at`: [symbol | zone | datum | datum | datum]. */
export const drawFeatureFrame = (pen: Pen, at: P, spec: GdtSpec): FrameLayout => {
  const err = validateGdt(spec)
  if (err !== undefined) throw new RangeError(err)
  const zone = fmtTol(spec)
  const zoneW = Math.max(CELL * 1.4, zone.length * 2.1 + 4)
  const datums = spec.datums ?? []
  const width = CELL + zoneW + datums.length * CELL
  pen.rect(at.x, at.y, at.x + width, at.y + CELL, 0.35)
  let x = at.x + CELL
  pen.line({ x, y: at.y }, { x, y: at.y + CELL }, 0.35)
  drawGdtSymbol(pen, spec.kind, { x: at.x + CELL / 2, y: at.y + CELL / 2 })
  pen.text({ x: x + zoneW / 2, y: at.y + CELL / 2 }, zone, 3.2, { align: "center", baseline: "middle" })
  x += zoneW
  for (const d of datums) {
    pen.line({ x, y: at.y }, { x, y: at.y + CELL }, 0.35)
    pen.text({ x: x + CELL / 2, y: at.y + CELL / 2 }, d, 3.4, { align: "center", baseline: "middle" })
    x += CELL
  }
  return { width, height: CELL, text: [SYMBOL_TEXT[spec.kind], zone, ...datums].join(" | ") }
}

/** Leader from the right end of a frame at `from` to the toleranced feature `to`, with an arrowhead on the feature. */
export const drawFrameLeader = (pen: Pen, from: P, to: P): void => {
  pen.line(from, to, 0.25)
  const d = { x: to.x - from.x, y: to.y - from.y }, l = Math.hypot(d.x, d.y)
  if (l < 1e-9) return
  const u = { x: d.x / l, y: d.y / l }, s = 2.5
  const b = { x: to.x - u.x * s, y: to.y - u.y * s }
  pen.poly([to, { x: b.x - u.y * s * 0.18, y: b.y + u.x * s * 0.18 }, { x: b.x + u.y * s * 0.18, y: b.y - u.x * s * 0.18 }], true, true)
}

/** Datum feature symbol: a lettered square joined to a filled triangle whose tip is on the feature at `on`, `dir` pointing away from the part. */
export const drawDatumFeature = (pen: Pen, on: P, dir: P, letter: string): void => {
  if (!/^[A-Z]$/.test(letter)) throw new RangeError("a datum is one capital letter")
  const l = Math.hypot(dir.x, dir.y) || 1
  const u = { x: dir.x / l, y: dir.y / l }, n = { x: -u.y, y: u.x }
  const tri = 2.4
  const base = { x: on.x + u.x * tri * 1.2, y: on.y + u.y * tri * 1.2 }
  pen.poly([on, { x: base.x + n.x * tri * 0.55, y: base.y + n.y * tri * 0.55 }, { x: base.x - n.x * tri * 0.55, y: base.y - n.y * tri * 0.55 }], true, true)
  const stem = 5
  const boxC = { x: base.x + u.x * (stem + CELL / 2), y: base.y + u.y * (stem + CELL / 2) }
  pen.line(base, { x: base.x + u.x * stem, y: base.y + u.y * stem }, 0.25)
  pen.rect(boxC.x - CELL / 2, boxC.y - CELL / 2, boxC.x + CELL / 2, boxC.y + CELL / 2, 0.35)
  pen.text(boxC, letter, 3.6, { align: "center", baseline: "middle" })
}

/** Balloon: a circle with the item number at `centre`, leader to `anchor` ending in a dot on the part. */
export const drawBalloon = (pen: Pen, centre: P, anchor: P, text: string, radius = 4.2): void => {
  pen.circle(centre, radius)
  pen.text(centre, text, text.length > 2 ? 2.8 : 3.4, { align: "center", baseline: "middle" })
  const d = { x: anchor.x - centre.x, y: anchor.y - centre.y }, l = Math.hypot(d.x, d.y)
  if (l <= radius) return
  const u = { x: d.x / l, y: d.y / l }
  pen.line({ x: centre.x + u.x * radius, y: centre.y + u.y * radius }, anchor, 0.25)
  const r = 0.7
  pen.poly([{ x: anchor.x + r, y: anchor.y }, { x: anchor.x, y: anchor.y + r }, { x: anchor.x - r, y: anchor.y }, { x: anchor.x, y: anchor.y - r }], true, true)
}
