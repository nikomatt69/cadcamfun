/**
 * The simulations the desktop runs on a drawing's exact solids, as plain functions (the panel only renders them):
 *  - finite-element studies (`fea` of `@cadcamfun/core`, spec 48): static stress, steady and transient thermal, thermal stress,
 *    natural frequencies, buckling, and a machining load from the Kienzle law of the CAM kernel;
 *  - assembly interference and clearance (exact Booleans and distances of the B-rep kernel);
 *  - mass properties from the exact volume and a density.
 * The assistant runs the same kernels (`cad.simulate`, `cad.assembly`), so a number here is the number it quotes.
 */
import { assemblyClearance, assemblyInterference, brep, cam, elementBrep, exchange, fea, type AssemblyPart } from "@cadcamfun/core"

export type SimKind = "fem" | "interference" | "mass"
export type Axis = "x" | "y" | "z"

export interface PartGeometry {
  readonly positions: Float64Array
  readonly indices: Uint32Array
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

const byIdOf = (all: ReadonlyArray<Record<string, unknown>>) => {
  const m = new Map<string, Record<string, unknown>>()
  for (const e of all) if (typeof e["id"] === "string") m.set(e["id"] as string, e)
  return m
}

/** Triangles of the element's exact solid, placed where the viewport draws it, or why it has none. */
export const partGeometry = (element: Record<string, unknown>, all: ReadonlyArray<Record<string, unknown>>, chordTol = 0.05): PartGeometry | { readonly reason: string } => {
  let placed: ReturnType<typeof elementBrep>
  try { placed = elementBrep(element, byIdOf(all)) } catch (cause) { return { reason: cause instanceof Error ? cause.message : String(cause) } }
  if (placed.brep === undefined) return { reason: placed.reason }
  const mesh = exchange.brepMesh(placed.brep, { chordTol })
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.positions.length; i += 3) for (let d = 0; d < 3; d++) { min[d] = Math.min(min[d]!, mesh.positions[i + d]!); max[d] = Math.max(max[d]!, mesh.positions[i + d]!) }
  return { positions: Float64Array.from(mesh.positions), indices: Uint32Array.from(mesh.indices), min, max }
}

export type LoadMode = "force" | "cutting"

export interface FemForm {
  readonly analysis: fea.Study["analysis"]
  readonly material: string
  /** Element size, mm; 0 picks one from the part. */
  readonly size: number
  /** The face that is held (and, for thermal studies, the hot face). */
  readonly fixedAxis: Axis
  readonly fixedSide: "min" | "max"
  /** Clamp the opposite face along the axis too (thermal stress of a restrained part). */
  readonly clampOpposite: boolean
  readonly loadMode: LoadMode
  readonly loadAxis: Axis
  readonly loadSign: 1 | -1
  readonly forceN: number
  /** Cutting load: CAM material id, depth of cut, chip load, teeth in the cut. */
  readonly cutMaterial: string
  readonly ap: number
  readonly fz: number
  readonly teeth: number
  readonly hot: number
  readonly cold: number
  readonly uniform: number
  readonly useUniform: boolean
  readonly reference: number
  readonly duration: number
  readonly modes: number
}

export const DEFAULT_FEM: FemForm = {
  analysis: "static", material: "steel-s235", size: 0, fixedAxis: "x", fixedSide: "min", clampOpposite: false,
  loadMode: "force", loadAxis: "z", loadSign: -1, forceN: 500, cutMaterial: "", ap: 2, fz: 0.1, teeth: 2,
  hot: 120, cold: 20, uniform: 120, useUniform: false, reference: 20, duration: 60, modes: 6
}

const AXIS = { x: 0, y: 1, z: 2 } as const

/** The default element size for a part: fine enough for two cells across its thinnest side and about 24 along its longest. */
export const autoSize = (g: PartGeometry): number => {
  const ext = [0, 1, 2].map((d) => g.max[d]! - g.min[d]!)
  return Math.max(0.2, Math.min(Math.max(...ext) / 24, Math.min(...ext) / 2))
}

export const cuttingMaterials = (): ReadonlyArray<{ readonly id: string; readonly name: string }> =>
  cam.kernel.MATERIALS.map((m) => ({ id: m.id, name: m.name }))

/** The resultant of the cutting load of a form, N (0 outside the cutting mode). */
export const cuttingResultant = (form: FemForm): number => {
  const m = cam.kernel.MATERIALS.find((x) => x.id === form.cutMaterial)
  return form.loadMode === "cutting" && m !== undefined ? fea.cuttingForce({ kc11: m.kc11, mc: m.mc, ap: form.ap, fz: form.fz, teeth: form.teeth }).resultant : 0
}

/** The study a form describes on a part: faces are picked by the part's bounds, so any orientation works. */
export const femStudy = (form: FemForm, g: PartGeometry, maxElements = 9_000): fea.Study => {
  const a = AXIS[form.fixedAxis], la = AXIS[form.loadAxis]
  const fixedAt = form.fixedSide === "min" ? g.min[a]! : g.max[a]!, otherAt = form.fixedSide === "min" ? g.max[a]! : g.min[a]!
  const size = form.size > 0 ? form.size : autoSize(g)
  const heldFace: fea.Region = { kind: "plane", axis: form.fixedAxis, value: fixedAt }
  const supports: fea.Support[] = [{ name: "fixed face", region: heldFace }]
  if (form.clampOpposite) supports.push({ name: "opposite face", region: { kind: "plane", axis: form.fixedAxis, value: otherAt }, dofs: [form.fixedAxis] })
  const base = { geometry: { kind: "solid", positions: g.positions, indices: g.indices } as const, material: { id: form.material }, mesh: { size, maxElements }, referenceTemperature: form.reference }
  const thermalFaces: fea.ThermalLoad[] = [
    { kind: "temperature", region: heldFace, value: form.hot },
    { kind: "temperature", region: { kind: "plane", axis: form.fixedAxis, value: otherAt }, value: form.cold }
  ]
  switch (form.analysis) {
    case "static": case "buckling": {
      let force = form.forceN
      let region: fea.Region = { kind: "plane", axis: form.loadAxis, value: form.loadSign > 0 ? g.max[la]! : g.min[la]! }
      if (form.loadMode === "cutting") {
        force = cuttingResultant(form)
        const c: [number, number, number] = [(g.min[0]! + g.max[0]!) / 2, (g.min[1]! + g.max[1]!) / 2, (g.min[2]! + g.max[2]!) / 2]
        c[la] = form.loadSign > 0 ? g.max[la]! : g.min[la]!
        region = { kind: "sphere", center: c, radius: Math.max(size * 2.2, 0.12 * Math.max(...[0, 1, 2].map((d) => g.max[d]! - g.min[d]!))) }
      }
      const vec: [number, number, number] = [0, 0, 0]
      vec[la] = form.loadSign * force
      return { ...base, analysis: form.analysis, supports, loads: [{ kind: "force", name: form.loadMode === "cutting" ? "cutting force" : "load", region, force: vec }], modes: Math.min(form.modes, 4) }
    }
    case "modal": return { ...base, analysis: "modal", supports: form.fixedSide === undefined ? [] : supports, modes: form.modes }
    case "thermal": return { ...base, analysis: "thermal", thermal: thermalFaces }
    case "thermal_stress": return { ...base, analysis: "thermal_stress", supports, ...(form.useUniform ? { uniformTemperature: form.uniform } : { thermal: thermalFaces }) }
    case "transient_thermal": return { ...base, analysis: "transient_thermal", supports, initialTemperature: form.reference, thermal: [{ kind: "temperature", region: heldFace, value: form.hot }], transient: { duration: form.duration, steps: 30, stressSteps: 4 } }
  }
}

// ------------------------------------------------------------------------------------------------ result fields

export type FieldName = "vonMises" | "displacement" | "safety" | "maxPrincipal" | "minPrincipal" | "tresca" | "temperature" | "mode"

/** The fields a result can show, in the order the picker lists them. */
export const fieldsOf = (r: fea.StudyResult): ReadonlyArray<FieldName> => {
  const out: FieldName[] = []
  if (r.fields.stressMeasures !== undefined) out.push("vonMises", "safety", "tresca", "maxPrincipal", "minPrincipal")
  if (r.fields.displacement !== undefined && r.modes === undefined && r.buckling === undefined) out.push("displacement")
  if (r.fields.temperature !== undefined) out.push("temperature")
  if (r.modes !== undefined || r.buckling !== undefined) out.push("mode")
  return out.includes("vonMises") ? [...out.filter((f) => f === "vonMises"), ...out.filter((f) => f !== "vonMises")] : out
}

export interface FieldValues { readonly values: Float64Array; readonly shape?: Float64Array }

export const fieldValues = (r: fea.StudyResult, field: FieldName, mode = 0): FieldValues => {
  const m = r.fields.stressMeasures
  switch (field) {
    case "vonMises": return { values: m!.vonMises, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "tresca": return { values: m!.tresca, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "maxPrincipal": return { values: m!.maxPrincipal, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "minPrincipal": return { values: m!.minPrincipal, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "safety": return { values: m!.safetyFactor, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "displacement": return { values: fea.magnitudes(r.fields.displacement!), shape: r.fields.displacement! }
    case "temperature": return { values: r.fields.temperature!, ...(r.fields.displacement !== undefined ? { shape: r.fields.displacement } : {}) }
    case "mode": {
      const shape = (r.modes?.filter((x) => !x.rigid)[mode] ?? r.modes?.[mode])?.shape ?? r.buckling?.[mode]?.shape
      return shape === undefined ? { values: new Float64Array(r.mesh.nodeCount) } : { values: fea.magnitudes(shape), shape }
    }
  }
}

/** Blue → cyan → green → yellow → red. */
export const rampColor = (t: number): readonly [number, number, number] => {
  const x = Math.max(0, Math.min(1, t)) * 4
  const seg = Math.min(3, Math.floor(x)), f = x - seg
  const stops: ReadonlyArray<readonly [number, number, number]> = [[40, 70, 220], [30, 200, 230], [60, 200, 90], [240, 220, 40], [230, 50, 40]]
  const a = stops[seg]!, b = stops[seg + 1]!
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

export interface DrawTriangle { readonly points: readonly [number, number, number, number, number, number]; readonly color: string; readonly depth: number }

export interface View { readonly yaw: number; readonly pitch: number; readonly zoom: number }

export interface Projected { readonly triangles: ReadonlyArray<DrawTriangle>; readonly min: number; readonly max: number }

/**
 * The boundary of a result as shaded, colour-mapped triangles for a canvas of `width × height`: orbit by `view`, optionally
 * deformed by `deform` times the displacement (scaled so the peak is 6 % of the part's size when `deform` is 1), painter-sorted.
 * A safety-factor field is reversed (low is red) and clipped at 10.
 */
export const projectResult = (r: fea.StudyResult, field: FieldName, mode: number, view: View, deform: number, width: number, height: number): Projected => {
  const { values, shape } = fieldValues(r, field, mode)
  const reverse = field === "safety"
  const clip = field === "safety" ? 10 : Infinity
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < values.length; i++) { const v = Math.min(values[i]!, clip); if (v < lo) lo = v; if (v > hi) hi = v }
  const span = hi > lo ? hi - lo : 1
  const m = r.mesh
  const size = Math.hypot(m.bounds.max[0] - m.bounds.min[0], m.bounds.max[1] - m.bounds.min[1], m.bounds.max[2] - m.bounds.min[2])
  let peak = 0
  if (shape !== undefined) for (let i = 0; i < m.nodeCount; i++) peak = Math.max(peak, Math.hypot(shape[i * 3]!, shape[i * 3 + 1]!, shape[i * 3 + 2]!))
  const scale = shape !== undefined && peak > 0 ? deform * 0.06 * size / peak : 0
  const cx = (m.bounds.min[0] + m.bounds.max[0]) / 2, cy = (m.bounds.min[1] + m.bounds.max[1]) / 2, cz = (m.bounds.min[2] + m.bounds.max[2]) / 2
  const cyaw = Math.cos(view.yaw), syaw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
  const px = new Float64Array(m.nodeCount), py = new Float64Array(m.nodeCount), pz = new Float64Array(m.nodeCount)
  const f = view.zoom * Math.min(width, height) / (size * 1.25)
  for (let n = 0; n < m.nodeCount; n++) {
    let x = m.nodes[n * 3]! - cx, y = m.nodes[n * 3 + 1]! - cy, z = m.nodes[n * 3 + 2]! - cz
    if (scale !== 0) { x += scale * shape![n * 3]!; y += scale * shape![n * 3 + 1]!; z += scale * shape![n * 3 + 2]! }
    // z up: yaw about z, then pitch about x
    const x1 = cyaw * x - syaw * y, y1 = syaw * x + cyaw * y
    const y2 = cp * y1 - sp * z, z2 = sp * y1 + cp * z
    px[n] = width / 2 + x1 * f; py[n] = height / 2 - z2 * f; pz[n] = y2
  }
  const triangles: DrawTriangle[] = []
  for (let q = 0; q < m.faceCount; q++) {
    const a = m.faces[q * 6]!, b = m.faces[q * 6 + 1]!, c = m.faces[q * 6 + 2]!
    // outward normal in view space decides facing and the light
    const ux = px[b]! - px[a]!, uy = py[b]! - py[a]!, vx = px[c]! - px[a]!, vy = py[c]! - py[a]!
    const ax = m.nodes[b * 3]! - m.nodes[a * 3]!, ay = m.nodes[b * 3 + 1]! - m.nodes[a * 3 + 1]!, az = m.nodes[b * 3 + 2]! - m.nodes[a * 3 + 2]!
    const bx = m.nodes[c * 3]! - m.nodes[a * 3]!, by = m.nodes[c * 3 + 1]! - m.nodes[a * 3 + 1]!, bz = m.nodes[c * 3 + 2]! - m.nodes[a * 3 + 2]!
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    const y1n = syaw * nx + cyaw * ny
    const vz = sp * y1n + cp * nz
    const facing = ux * vy - uy * vx
    if (facing === 0) continue
    const tone = 0.55 + 0.45 * Math.max(0, -(cp * (syaw * nx + cyaw * ny) - sp * nz))
    const t = ((Math.min(values[a]!, clip) + Math.min(values[b]!, clip) + Math.min(values[c]!, clip)) / 3 - lo) / span
    const [r0, g0, b0] = rampColor(reverse ? 1 - t : t)
    triangles.push({ points: [px[a]!, py[a]!, px[b]!, py[b]!, px[c]!, py[c]!], color: `rgb(${Math.round(r0 * tone)},${Math.round(g0 * tone)},${Math.round(b0 * tone)})`, depth: (pz[a]! + pz[b]! + pz[c]!) / 3 + 0 * vz })
  }
  triangles.sort((p, q) => q.depth - p.depth)
  return { triangles, min: lo, max: hi }
}

// ------------------------------------------------------------------------------------------------ assembly and mass

export interface PartRef { readonly id: string; readonly name: string; readonly brep: brep.Brep }

export const solidParts = (all: ReadonlyArray<Record<string, unknown>>): ReadonlyArray<PartRef> => {
  const map = byIdOf(all), out: PartRef[] = []
  for (const e of all) {
    try {
      const placed = elementBrep(e, map)
      if (placed.brep !== undefined) out.push({ id: String(e["id"]), name: String(e["name"] ?? e["type"] ?? e["id"]), brep: placed.brep })
    } catch { /* an element with no exact solid is not a part */ }
  }
  return out
}

export interface InterferenceSummary {
  readonly parts: number
  readonly clashes: ReadonlyArray<{ readonly a: string; readonly b: string; readonly volume: number }>
  readonly touching: number
  readonly undetermined: ReadonlyArray<{ readonly a: string; readonly b: string; readonly reason: string }>
  readonly closest: ReadonlyArray<{ readonly a: string; readonly b: string; readonly distance: number }>
}

export const interferenceStudy = (parts: ReadonlyArray<PartRef>, within = 5): InterferenceSummary => {
  const named = (id: string) => parts.find((p) => p.id === id)?.name ?? id
  const list: AssemblyPart[] = parts.map((p) => ({ id: p.id, name: p.name, brep: p.brep }))
  const report = assemblyInterference(list)
  const gaps = assemblyClearance(list, within)
  return {
    parts: parts.length,
    clashes: report.interferences.filter((i) => i.kind === "clash").map((i) => ({ a: named(i.a), b: named(i.b), volume: i.volume })),
    touching: report.touching.length,
    undetermined: report.undetermined.map((u) => ({ a: named(u.a), b: named(u.b), reason: u.reason })),
    closest: gaps.filter((g) => !g.overlap).slice(0, 8).map((g) => ({ a: named(g.a), b: named(g.b), distance: g.distance }))
  }
}

export interface MassSummary {
  readonly name: string
  readonly volumeMm3: number
  readonly areaMm2: number
  readonly massKg: number
  readonly centroid: readonly [number, number, number]
  /** Principal moments of inertia about the centroid, kg·mm². */
  readonly inertia: readonly [number, number, number]
}

export const massStudy = (part: PartRef, material: string): MassSummary | { readonly reason: string } => {
  const m = fea.materialById(material)
  if (m === undefined) return { reason: `No material ${material}` }
  const p = brep.massProperties(part.brep)
  const rho = m.density * 1e-9 // kg/m³ → kg/mm³
  const I = p.inertia
  const eig = fea.jacobiEigen(Float64Array.from([I[0], I[1], I[2], I[3], I[4], I[5], I[6], I[7], I[8]]), 3).values
  const sorted = Array.from(eig).sort((x, y) => x - y).map((v) => v * rho) as [number, number, number]
  return { name: part.name, volumeMm3: p.volume, areaMm2: p.area, massKg: p.volume * rho, centroid: [p.centroid.x, p.centroid.y, p.centroid.z], inertia: sorted }
}
