/**
 * Solid text: the single-stroke font (`stroke-font.ts`) given a stroke width and a depth, so a text can be embossed on a face or
 * engraved into it (Fusion's Text feature). Every stroke segment becomes a bar with square ends, `width` wide and `depth` tall; the
 * bars of one letter overlap at their joints and are united, the letters (which do not touch) are put side by side in one mesh.
 */
import { booleanMesh, mergeMeshes } from "./csg.ts"
import { meshOf, type Mesh } from "./solid.ts"
import { textStrokes } from "./stroke-font.ts"
import type { Vec2 } from "./vec.ts"

export type TextAlign = "left" | "centre"

export interface TextSpec {
  readonly text: string
  /** Cap height, mm. */
  readonly height: number
  /** Width of a stroke, mm. */
  readonly strokeWidth: number
  /** Extent along the normal, from 0 to `depth`. */
  readonly depth: number
  readonly spacing?: number
  readonly align?: TextAlign
}

export interface TextSolid {
  /** In the plane's own coordinates: x along the text, y up, z along the normal; the text's lower-left corner (or its centre) at the origin. */
  readonly mesh: Mesh | undefined
  readonly width: number
  readonly height: number
  readonly unsupported: ReadonlyArray<string>
}

/** The rectangle of one stroke segment, its ends pushed out by half the width so the joints of a polyline overlap. */
const bar = (a: Vec2, b: Vec2, width: number): Vec2[] => {
  const dx = b.x - a.x, dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  const ux = dx / l, uy = dy / l, h = width / 2
  const nx = -uy * h, ny = ux * h
  const p = { x: a.x - ux * h, y: a.y - uy * h }, q = { x: b.x + ux * h, y: b.y + uy * h }
  return [{ x: p.x - nx, y: p.y - ny }, { x: q.x - nx, y: q.y - ny }, { x: q.x + nx, y: q.y + ny }, { x: p.x + nx, y: p.y + ny }]
}

const boundsOf = (ring: ReadonlyArray<Vec2>) => ({
  x0: Math.min(...ring.map((p) => p.x)), x1: Math.max(...ring.map((p) => p.x)),
  y0: Math.min(...ring.map((p) => p.y)), y1: Math.max(...ring.map((p) => p.y))
})

/** Groups of items whose boxes overlap, directly or through others (union-find). */
const clusters = (boxes: ReadonlyArray<ReturnType<typeof boundsOf>>): number[][] => {
  const parent = boxes.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!
    if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1) parent[find(i)] = find(j)
  }
  const groups = new Map<number, number[]>()
  boxes.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]) })
  return [...groups.values()]
}

/** The solid of `spec.text`. `mesh` is undefined when nothing could be drawn (empty text, or no letter with a glyph). */
export const textSolid = (spec: TextSpec): TextSolid => {
  if (!(spec.height > 0 && spec.strokeWidth > 0 && spec.depth > 0)) throw new RangeError("Text needs a positive height, stroke width and depth")
  const laid = textStrokes(spec.text, spec.height, spec.spacing ?? 1)
  const shift: Vec2 = spec.align === "centre" ? { x: -laid.width / 2, y: -spec.height / 2 + (laid.height - spec.height) / 2 } : { x: 0, y: 0 }
  const bars: Vec2[][] = []
  for (const stroke of laid.strokes) {
    const pts = stroke.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })).filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1]!.x, p.y - all[i - 1]!.y) > 1e-9)
    if (pts.length === 1) { const p = pts[0]!; bars.push(bar({ x: p.x, y: p.y }, { x: p.x + 1e-6, y: p.y }, spec.strokeWidth)); continue }
    for (let i = 0; i + 1 < pts.length; i++) bars.push(bar(pts[i]!, pts[i + 1]!, spec.strokeWidth))
  }
  if (bars.length === 0) return { mesh: undefined, width: laid.width, height: laid.height, unsupported: laid.unsupported }
  const solids = bars.map((ring) => meshOf({ _tag: "Extrude", profile: ring, height: spec.depth, origin: { x: 0, y: 0, z: 0 } }, 0.01))
  const groups = clusters(bars.map(boundsOf))
  const pieces = groups.map((g) => g.slice(1).reduce((acc, i) => booleanMesh(acc, solids[i]!, "union"), solids[g[0]!]!))
  return { mesh: pieces.length === 1 ? pieces[0]! : mergeMeshes(pieces), width: laid.width, height: laid.height, unsupported: laid.unsupported }
}
