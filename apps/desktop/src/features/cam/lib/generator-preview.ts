/** Small illustrative scenes, independent of CAD state and generated toolpaths. All points are in model space. */
import type { ToolpathSettings } from "../store/generatorStore.ts"

export type Point3 = readonly [number, number, number]
export interface PreviewFace { readonly points: readonly Point3[]; readonly shade: "top" | "side" | "end" }
export interface PreviewLine { readonly points: readonly Point3[]; readonly kind?: "path" | "guide" | "axis" }
export interface PreviewScene { readonly faces: readonly PreviewFace[]; readonly lines: readonly PreviewLine[]; readonly marker?: Point3 }
interface Scene { faces: PreviewFace[]; lines: PreviewLine[]; marker?: Point3 }
const scene = (): Scene => ({ faces: [], lines: [] })
const loop = (points: readonly Point3[]): Point3[] => [...points, points[0]!]
const rect = (w: number, h: number, z: number): Point3[] => [[-w / 2, -h / 2, z], [w / 2, -h / 2, z], [w / 2, h / 2, z], [-w / 2, h / 2, z]]
const ring = (r: number, z: number, n = 48): Point3[] => Array.from({ length: n }, (_, i) => [r * Math.cos(i * Math.PI * 2 / n), r * Math.sin(i * Math.PI * 2 / n), z])
const path = (s: Scene, points: readonly Point3[], kind: PreviewLine["kind"] = "path"): void => { s.lines.push({ points, kind }) }

/** Keep only faces pointing toward the fixed isometric camera. */
function face(s: Scene, points: readonly Point3[]): void {
  const a = points[0]!, b = points[1]!, c = points[2]!
  const u = b.map((v, i) => v - a[i]!), v = c.map((n, i) => n - a[i]!)
  const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
  if (normal[0]! + normal[1]! + normal[2]! <= 0) return
  s.faces.push({ points, shade: normal[2]! > Math.abs(normal[0]!) + Math.abs(normal[1]!) ? "top" : normal[0]! > normal[1]! ? "side" : "end" })
}
function prism(s: Scene, outline: readonly Point3[], bottom: number, top: number, transform: (p: Point3) => Point3 = p => p): void {
  const upper: Point3[] = outline.map(([x, y]) => [x, y, top])
  face(s, upper.map(transform))
  upper.forEach((p, i) => {
    const q = upper[(i + 1) % upper.length]!
    face(s, ([[p[0], p[1], bottom], [q[0], q[1], bottom], q, p] as Point3[]).map(transform))
  })
}
function box(s: Scene, w: number, h: number, bottom: number, top: number): void { prism(s, rect(w, h, top), bottom, top) }
function helix(radius: number, bottom: number, height: number, turns: number): Point3[] {
  return Array.from({ length: 241 }, (_, i) => {
    const t = i / 240, a = t * turns * Math.PI * 2
    return [radius * Math.cos(a), radius * Math.sin(a), bottom + t * height]
  })
}

export function geometryExample(shape: "rectangle" | "circle" | "polygon", width: number, height: number, depth: number, sides = 6): PreviewScene {
  const s = scene()
  const outline = shape === "rectangle" ? rect(width, height, 0) : ring(width / 2, 0, shape === "circle" ? 64 : Math.min(128, Math.max(3, Math.round(sides))))
  prism(s, outline, -depth, 0)
  path(s, loop(outline))
  return s
}

/** The milling origin is on the top face; machine/custom coordinates may be outside the stock. */
export function originExample(s: Pick<ToolpathSettings, "originType" | "originX" | "originY" | "originZ">, stock: { readonly width: number; readonly height: number; readonly depth: number; readonly x: number; readonly y: number; readonly topZ: number }): PreviewScene {
  const result = scene(), w = stock.width, h = stock.height, d = stock.depth
  box(result, w, h, -d, 0)
  const marker: Point3 = s.originType === "workpiece-center" ? [0, 0, 0]
    : s.originType === "workpiece-corner" ? [-w / 2, -h / 2, 0]
    : s.originType === "workpiece-corner2" ? [-w / 2, h / 2, 0]
    : s.originType === "custom" ? [s.originX - stock.x, s.originY - stock.y, s.originZ - stock.topZ]
    : [-stock.x, -stock.y, -stock.topZ]
  result.marker = marker
  const length = Math.max(w, h, d) * 0.28
  for (const delta of [[length, 0, 0], [0, length, 0], [0, 0, length]] as const) path(result, [marker, [marker[0] + delta[0], marker[1] + delta[1], marker[2] + delta[2]]], "axis")
  return result
}

function surface(s: Scene, strategy: string): void {
  const z = (x: number, y: number): number => 7 + 12 * Math.exp(-(x * x + (y / 0.75) ** 2) / 430)
  for (let x = -26; x < 26; x += 4) for (let y = -20; y < 20; y += 4) {
    face(s, [[x, y, z(x, y)], [x + 4, y, z(x + 4, y)], [x + 4, y + 4, z(x + 4, y + 4)], [x, y + 4, z(x, y + 4)]])
  }
  if (strategy === "roughing") {
    for (const height of [8, 11, 14, 17]) {
      path(s, loop(rect(56, 44, height)))
      const radius = Math.sqrt(-430 * Math.log((height - 7) / 12))
      path(s, loop(ring(radius, height).map(([x, y, z]) => [x, y * 0.75, z])))
    }
  } else if (strategy === "spiral") {
    path(s, Array.from({ length: 321 }, (_, i) => {
      const r = 25 * i / 320, angle = i * Math.PI / 20, x = Math.cos(angle) * r, y = Math.sin(angle) * r * 0.75
      return [x, y, z(x, y) + 0.25]
    }))
  } else if (["waterline", "scallop"].includes(strategy)) {
    for (let r = 5; r < 26; r += 4) path(s, loop(ring(r, 0).map(([x, y]) => [x, y * 0.75, z(x, y * 0.75) + 0.25])))
  } else if (strategy === "radial") {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) path(s, Array.from({ length: 21 }, (_, i) => {
      const x = Math.cos(a) * i * 1.3, y = Math.sin(a) * i
      return [x, y, z(x, y) + 0.25]
    }))
  } else {
    for (let y = -18; y <= 18; y += 4) path(s, Array.from({ length: 27 }, (_, i) => { const x = -26 + i * 2; return [x, y, z(x, y) + 0.25] }))
  }
}

function millExample(settings: ToolpathSettings): PreviewScene {
  const s = scene(), op = String(settings.operationType)
  if (op === "3d_surface") { box(s, 62, 50, 0, 6); surface(s, settings.surfaceStrategy); return s }
  if (op === "pocket") {
    // A recessed floor and four rim strips expose the pocket depth.
    box(s, 60, 46, 0, 5)
    const outer = rect(60, 46, 15), inner = rect(42, 28, 15)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, a = inner[i]!, b = inner[j]!
      face(s, [outer[i]!, outer[j]!, b, a])
      face(s, [a, b, [b[0], b[1], 5], [a[0], a[1], 5]])
      face(s, [[outer[i]![0], outer[i]![1], 0], [outer[j]![0], outer[j]![1], 0], outer[j]!, outer[i]!])
    }
    for (let inset = 0; inset < 12; inset += 4) path(s, loop(rect(36 - inset * 2, 22 - inset, 5.3)))
  } else if (op === "threading") {
    prism(s, ring(17, 0), 0, 20)
    path(s, helix(17.5, 1, 18, 5))
  } else {
    box(s, 60, 46, 0, 14)
    if (op === "drill") {
      for (const x of [-17, 17]) for (const y of [-11, 11]) {
        path(s, loop(ring(3.5, 14.2).map(([a, b, z]) => [a + x, b + y, z])))
        path(s, [[x, y, 28], [x, y, 5]])
      }
    } else if (op === "engrave") path(s, [[-18, -10, 14.2], [0, 12, 14.2], [18, -10, 14.2], [0, 0, 14.2], [-18, -10, 14.2]])
    else if (op === "probing") {
      const contact: Point3 = settings.probeCycle === "edgeX" ? [30, 0, 9] : settings.probeCycle === "edgeY" ? [0, 23, 9] : settings.probeCycle === "corner" ? [30, 23, 9] : [0, 0, 14]
      s.marker = contact
      path(s, [contact, [contact[0], contact[1], 34]], "guide")
    } else for (const z of [3, 7, 11]) path(s, loop(rect(61, 47, z)))
  }
  return s
}
function latheExample(op: string): PreviewScene {
  const s = scene()
  const rotate = ([x, y, z]: Point3): Point3 => [z - 22, y, -x]
  prism(s, ring(14, 0), 0, 44, rotate)
  if (op === "threading" || op === "knurling") path(s, helix(14.3, 4, 36, 9))
  else if (op === "parting" || op === "grooving") for (const z of op === "parting" ? [34] : [12, 26, 34]) path(s, loop(ring(14.3, z)))
  else if (op === "facing" || op === "boring") for (let r = 3; r < 15; r += 3) path(s, loop(ring(r, 44.2)))
  else for (const y of [-3, 0, 3]) path(s, [[14.5, y, 2], [14.5, y, 40]])
  // Rotate the shaft's axis onto X without changing face winding.
  return { faces: s.faces, lines: s.lines.map(l => ({ ...l, points: l.points.map(rotate) })) }
}
function printExample(op: string, layerHeight: number): PreviewScene {
  const s = scene()
  box(s, 60, 50, -2, 0)
  if (op === "vase") {
    prism(s, ring(13, 0), 0, 28)
    path(s, helix(13.3, 0.5, 28, Math.min(32, Math.max(8, 5 / layerHeight))))
  } else {
    box(s, 30, 26, 0, 24)
    const spacing = Math.max(1, layerHeight * 10)
    for (let z = spacing; z <= 24; z += spacing) path(s, loop(rect(30.3, 26.3, z)))
    if (op === "raft" || op === "brim") for (let r = 0; r < 5; r++) path(s, loop(rect(34 + r * 2, 30 + r * 2, op === "raft" ? 1 + r * 0.5 : 0.4)))
    if (op === "support") for (let x = 18; x <= 24; x += 3) path(s, [[x, 0, 0], [x, 0, 24], [15, 0, 24]])
    for (let y = -10; y <= 10; y += op === "infill" ? 2 : 6) path(s, [[-13, y, 24.2], [13, y, 24.2]])
  }
  return s
}
export function operationExample(settings: ToolpathSettings): PreviewScene {
  return settings.machineType === "lathe" ? latheExample(settings.operationType)
    : settings.machineType === "3dprinter" ? printExample(settings.operationType, settings.layerHeight)
    : millExample(settings)
}

/** Orthographic projection with a bounded viewBox, so millimetres never turn into overflowing SVG pixels. */
export function projectExample(model: PreviewScene) {
  const project = ([x, y, z]: Point3): readonly [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z]
  const all = [...model.faces.flatMap(f => f.points), ...model.lines.flatMap(l => l.points), ...(model.marker ? [model.marker] : [])].map(project)
  const xs = all.map(p => p[0]), ys = all.map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(1, Math.max(...xs) - minX), h = Math.max(1, Math.max(...ys) - minY)
  const scale = Math.min(250 / w, 115 / h)
  const point = (p: Point3): readonly [number, number] => { const [x, y] = project(p); return [160 + (x - minX - w / 2) * scale, 77 + (y - minY - h / 2) * scale] }
  const points = (ps: readonly Point3[]): string => ps.map(p => point(p).map(n => n.toFixed(2)).join(",")).join(" ")
  const depth = (ps: readonly Point3[]): number => ps.reduce((n, [x, y, z]) => n + x + y + z, 0) / ps.length
  return {
    faces: [...model.faces].sort((a, b) => depth(a.points) - depth(b.points)).map(f => ({ ...f, points: points(f.points) })),
    lines: model.lines.map(l => ({ ...l, points: points(l.points) })),
    marker: model.marker ? point(model.marker) : undefined
  }
}
