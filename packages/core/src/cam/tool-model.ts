/**
 * The 3D model of a tool (spec 31 §5): one description of its shape, built from a user's tool resource, the generator's
 * settings or a kernel cutter, and drawn the same everywhere — the tool's page in the Resources, the CAM preview, the
 * set-up checks' envelope.
 *
 *   mill     a solid of revolution about +Z, tip at the origin: flat, ball, bull, corner rounding, chamfer / V-bit /
 *            engraver / spot drill, drill, reamer, tapered, roughing, face mill, thread mill (its teeth at the pitch),
 *            T-slot / Woodruff / keyway (a disc on a neck), dovetail, boring bar; shank and holder above
 *   probe    a touch probe: ruby ball, stylus, body (spindle off)
 *   setter   a tool setter on the table: what is measured is the cutter in the spindle
 *   lathe    a flat insert outline in the tool plane: turning, facing, threading, grooving, parting, boring, knurling
 *   nozzle   a printer hot end: nozzle cone of its diameter and material, heater block
 *
 * A property the resource does not give is taken from the tool's kind (and listed in `assumed`): the drawing never
 * pretends to know a length nobody entered.
 */
import type { MachineKind } from "./machine.ts"
import type { ToolpathSettings } from "./generator/schema.ts"
import type { Cutter, CutterKind } from "./kernel/cutters.ts"
import { revolveProfile, type AssemblyMesh, type AssemblyPart, type AssemblyProfile, type ProfilePoint } from "./kernel/assembly.ts"

export type MillShape =
  | "flat" | "roughing" | "ball" | "bull" | "cornerRounding" | "chamfer" | "engraver" | "spot" | "drill" | "reamer" | "tapered"
  | "facemill" | "threadmill" | "disc" | "dovetail" | "boringBar"

export type LatheInsert = "turning" | "facing" | "threading" | "grooving" | "parting" | "boring" | "knurling"
export type NozzleType = "brass" | "hardened" | "ruby" | "standard"

export interface MillModel {
  readonly family: "mill"
  readonly shape: MillShape
  readonly diameter: number
  readonly flutes: number
  /** Cutting length from the tip, mm. */
  readonly fluteLength: number
  readonly shankDiameter: number
  /** Tip to holder face, mm. */
  readonly stickout: number
  readonly holder?: { readonly diameter: number; readonly length: number }
  readonly cornerRadius?: number
  /** Included angle: chamfer / V-bit / spot / drill point / dovetail, degrees. */
  readonly angle?: number
  readonly pitch?: number
  /** Disc and dovetail cutters: the neck between the head and the shank. */
  readonly neckDiameter?: number
  readonly tipDiameter?: number
  readonly assumed: ReadonlyArray<string>
}
export interface ProbeModel { readonly family: "probe"; readonly ballDiameter: number; readonly stylusLength: number; readonly bodyDiameter: number; readonly assumed: ReadonlyArray<string> }
export interface SetterModel { readonly family: "setter"; readonly padDiameter: number; readonly height: number; readonly assumed: ReadonlyArray<string> }
export interface LatheModel { readonly family: "lathe"; readonly insert: LatheInsert; readonly noseRadius: number; readonly width: number; readonly assumed: ReadonlyArray<string> }
export interface NozzleModel { readonly family: "nozzle"; readonly diameter: number; readonly nozzle: NozzleType; readonly assumed: ReadonlyArray<string> }

export type ToolModel = MillModel | ProbeModel | SetterModel | LatheModel | NozzleModel

/** A tool resource as the Resources store it (`ToolRow`), the shape fields included. */
export interface ToolResource {
  readonly type: string
  readonly diameter: number
  readonly numberOfFlutes?: number | null
  readonly cuttingLength?: number | null
  readonly totalLength?: number | null
  readonly shankDiameter?: number | null
  readonly cornerRadius?: number | null
  readonly tipAngle?: number | null
  readonly threadPitch?: number | null
  readonly holderDiameter?: number | null
  readonly holderLength?: number | null
  readonly stickout?: number | null
}

const MILL_TYPES: Readonly<Record<string, MillShape>> = {
  endmill: "flat", flat: "flat", flatendmill: "flat", squareendmill: "flat", slotdrill: "flat",
  roughingendmill: "roughing", roughing: "roughing", hogger: "roughing",
  ballendmill: "ball", ballnose: "ball", ball: "ball",
  bullnose: "bull", bull: "bull", toroidal: "bull", radiusendmill: "bull", cornerradius: "bull",
  cornerroundingmill: "cornerRounding", cornerrounding: "cornerRounding",
  chamfermill: "chamfer", chamfer: "chamfer", countersink: "chamfer",
  vbit: "engraver", engraver: "engraver", engraving: "engraver",
  spotdrill: "spot", centerdrill: "spot", spot: "spot",
  drillbit: "drill", drill: "drill", twistdrill: "drill",
  reamer: "reamer",
  taperedendmill: "tapered", tapered: "tapered",
  facemill: "facemill", shellmill: "facemill",
  threadmill: "threadmill",
  tslotcutter: "disc", tslot: "disc", woodruffcutter: "disc", woodruff: "disc", keywaycutter: "disc", keyseat: "disc", slittingsaw: "disc",
  dovetailcutter: "dovetail", dovetail: "dovetail",
  boringbar: "boringBar", boringhead: "boringBar"
}
const LATHE_TYPES: Readonly<Record<string, LatheInsert>> = {
  turning: "turning", turningtool: "turning", facing: "facing", facingtool: "facing", threading: "threading", threadingtool: "threading",
  grooving: "grooving", groovingtool: "grooving", parting: "parting", partingtool: "parting", partoff: "parting",
  boring: "boring", latheboring: "boring", knurling: "knurling", knurl: "knurling"
}
const NOZZLES: Readonly<Record<string, NozzleType>> = { brass: "brass", hardened: "hardened", ruby: "ruby", standard: "standard", nozzle: "standard" }

/** The tool types the Resources offer, by machine (the form's type list). */
export const TOOL_TYPES: Readonly<Record<MachineKind, ReadonlyArray<string>>> = {
  mill: ["endmill", "roughingendmill", "ballendmill", "bullnose", "cornerroundingmill", "chamfermill", "vbit", "engraver", "spotdrill", "drillbit", "reamer", "taperedendmill", "facemill", "threadmill", "tslotcutter", "woodruffcutter", "keywaycutter", "dovetailcutter", "boringbar", "probe", "toolsetter"],
  lathe: ["turning", "facing", "threading", "grooving", "parting", "boring", "knurling"],
  "3dprinter": ["brass", "hardened", "ruby", "standard"]
}

/** Which machine a tool type belongs to (`undefined`: not known; it is drawn as an end mill). */
export const toolMachineOf = (type: string): MachineKind | undefined => {
  const key = normalise(type)
  if (MILL_TYPES[key] !== undefined || key === "probe" || key === "touchprobe" || key === "toolsetter") return "mill"
  if (LATHE_TYPES[key] !== undefined) return "lathe"
  if (NOZZLES[key] !== undefined) return "3dprinter"
  return undefined
}

const normalise = (type: string): string => type.toLowerCase().replace(/[\s_\-/]+/g, "")
const positive = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0

/**
 * The model of a tool resource. `context` resolves a type both machines use ("boring", "threading"): a boring bar on a lathe is
 * an insert, on a mill a boring head.
 */
export const toolModelOf = (tool: ToolResource, context?: MachineKind): ToolModel => {
  const key = normalise(tool.type)
  const d = positive(tool.diameter) ? tool.diameter : 6
  const assumed: string[] = []
  const pick = (value: number | null | undefined, fallback: number, name: string): number => {
    if (positive(value)) return value
    assumed.push(name)
    return fallback
  }
  if (key === "probe" || key === "touchprobe") {
    return { family: "probe", ballDiameter: d, stylusLength: pick(tool.cuttingLength, 30, "cuttingLength"), bodyDiameter: pick(tool.shankDiameter, 25, "shankDiameter"), assumed }
  }
  if (key === "toolsetter") return { family: "setter", padDiameter: d, height: pick(tool.totalLength, 60, "totalLength"), assumed }
  const lathe = LATHE_TYPES[key]
  if (lathe !== undefined && (context === "lathe" || MILL_TYPES[key] === undefined)) {
    const noseDefault = lathe === "turning" || lathe === "facing" || lathe === "boring" ? 0.4 : 0
    // A nose radius of 0 is a real choice (a sharp tool), not a missing value.
    const nose = typeof tool.cornerRadius === "number" && Number.isFinite(tool.cornerRadius) && tool.cornerRadius >= 0 ? tool.cornerRadius : (assumed.push("cornerRadius"), noseDefault)
    return { family: "lathe", insert: lathe, noseRadius: lathe === "turning" || lathe === "facing" || lathe === "boring" ? nose : 0, width: lathe === "grooving" || lathe === "parting" ? Math.min(d, 10) : d, assumed }
  }
  const nozzle = NOZZLES[key]
  if (nozzle !== undefined) return { family: "nozzle", diameter: positive(tool.diameter) ? tool.diameter : 0.4, nozzle, assumed }
  const shape = MILL_TYPES[key] ?? (assumed.push("type"), "flat" as const)
  const short = shape === "facemill" || shape === "disc"
  const fluteLength = pick(tool.cuttingLength, short ? Math.max(2, d * 0.12) : shape === "drill" || shape === "reamer" ? 5 * d : 3 * d, "cuttingLength")
  const shankDiameter = pick(tool.shankDiameter, shape === "facemill" ? Math.min(32, Math.max(16, d * 0.4)) : shape === "disc" || shape === "dovetail" ? Math.max(6, Math.min(d * 0.4, 16)) : Math.max(3, d), "shankDiameter")
  // Stickout: given, else the total length less what a holder grips (a third), else the kind's default.
  const stickout = positive(tool.stickout) ? tool.stickout
    : positive(tool.totalLength) ? (assumed.push("stickout"), Math.max(fluteLength + 2, tool.totalLength * 0.66))
    : (assumed.push("stickout"), Math.max(fluteLength + 5, short ? 40 : 4 * d + 10))
  const holder = positive(tool.holderDiameter) ? { diameter: tool.holderDiameter, length: positive(tool.holderLength) ? tool.holderLength : 45 } : undefined
  const angleDefault: Partial<Record<MillShape, number>> = { chamfer: 90, engraver: 60, spot: 90, drill: 118, dovetail: 60 }
  return {
    family: "mill", shape, diameter: d, flutes: positive(tool.numberOfFlutes) ? Math.round(tool.numberOfFlutes) : (assumed.push("numberOfFlutes"), shape === "facemill" ? 5 : shape === "drill" ? 2 : 3),
    fluteLength, shankDiameter, stickout, ...(holder !== undefined ? { holder } : {}),
    ...(shape === "bull" || shape === "cornerRounding" ? { cornerRadius: positive(tool.cornerRadius) ? tool.cornerRadius : (assumed.push("cornerRadius"), shape === "bull" ? d * 0.1 : d * 0.25) } : {}),
    ...(angleDefault[shape] !== undefined ? { angle: positive(tool.tipAngle) ? tool.tipAngle : (assumed.push("tipAngle"), angleDefault[shape]!) } : {}),
    ...(shape === "tapered" ? { angle: positive(tool.tipAngle) ? tool.tipAngle : (assumed.push("tipAngle"), 3) } : {}),
    ...(shape === "threadmill" ? { pitch: positive(tool.threadPitch) ? tool.threadPitch : (assumed.push("threadPitch"), 1.5) } : {}),
    ...(shape === "disc" || shape === "dovetail" ? { neckDiameter: Math.min(shankDiameter, d * 0.6) } : {}),
    ...(shape === "engraver" ? { tipDiameter: 0.2 } : {}),
    assumed
  }
}

/** The model of the generator's tool for a machine (mill cutters, lathe inserts, printer nozzles). */
export const toolModelFromSettings = (s: ToolpathSettings, kind: MachineKind = s.machineType): ToolModel => {
  if (kind === "3dprinter") return toolModelOf({ type: NOZZLES[normalise(s.toolType)] ?? "standard", diameter: s.nozzleDiameter })
  if (kind === "lathe") return toolModelOf({ type: s.operationType === "knurling" ? "knurling" : LATHE_TYPES[normalise(s.toolType)] !== undefined ? s.toolType : "turning", diameter: s.toolDiameter, cornerRadius: s.noseRadius }, "lathe")
  if (s.operationType === "probing" || s.toolType === "probe") return toolModelOf({ type: s.toolType === "toolsetter" ? "toolsetter" : "probe", diameter: s.probeStylus })
  return toolModelOf({ type: s.toolType === "vbit" ? "vbit" : s.toolType, diameter: s.toolDiameter, numberOfFlutes: s.flutes, ...(s.toolType === "threadmill" ? { threadPitch: s.threadPitch } : {}) }, "mill")
}

/**
 * The model of the tool a preview draws: the user's tool resource when it belongs to this machine (and, on a mill, its
 * diameter is still the generator's), else the generator's own tool settings. The desktop preview and the sidecar that
 * serves the phone both ask here, so the two draw the same tool.
 */
export const previewToolModel = (kind: MachineKind, settings: ToolpathSettings, library?: ToolResource): ToolModel => {
  if (library !== undefined && toolMachineOf(library.type) === kind && (kind !== "mill" || Math.abs((library.diameter ?? 0) - settings.toolDiameter) < 1e-9)) {
    return toolModelOf(library, kind)
  }
  return toolModelFromSettings(settings, kind)
}

const KERNEL_SHAPE: Readonly<Record<CutterKind, MillShape>> = { flat: "flat", ball: "ball", bull: "bull", chamfer: "chamfer", spot: "spot", drill: "drill", facemill: "facemill", threadmill: "threadmill", engraver: "engraver" }

/** The model of a kernel cutter (the kernel's own tool library): the same shape the preview draws for a resource. */
export const toolModelFromCutter = (c: Cutter): MillModel => ({
  family: "mill", shape: KERNEL_SHAPE[c.kind], diameter: c.diameter, flutes: c.flutes, fluteLength: c.fluteLength, shankDiameter: c.shankDiameter, stickout: c.stickout,
  ...(c.holder !== undefined ? { holder: c.holder } : {}), ...(c.cornerRadius !== undefined ? { cornerRadius: c.cornerRadius } : {}), ...(c.angle !== undefined ? { angle: c.angle } : {}),
  ...(c.pitch !== undefined ? { pitch: c.pitch } : {}), ...(c.tipDiameter !== undefined ? { tipDiameter: c.tipDiameter } : {}), assumed: []
})

const arc = (cr: number, cz: number, radius: number, from: number, to: number, steps = 10): ProfilePoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => { const a = from + ((to - from) * i) / steps; return { r: cr + radius * Math.cos(a), z: cz + radius * Math.sin(a) } })

/** The cutting part of a mill model, tip on the axis to the top of the cutting length. */
const millCutting = (m: MillModel): ProfilePoint[] => {
  const R = m.diameter / 2, top = Math.max(m.fluteLength, 1e-3)
  const cone = (angle: number, tip: number) => {
    const half = (angle / 2) * (Math.PI / 180)
    const h = (R - tip) / Math.max(Math.tan(half), 1e-6)
    return [{ r: 0, z: 0 }, ...(tip > 0 ? [{ r: tip, z: 0 }] : []), { r: R, z: h }, ...(top > h + 1e-9 ? [{ r: R, z: top }] : [])]
  }
  switch (m.shape) {
    case "ball": return [{ r: 0, z: 0 }, ...arc(0, R, R, -Math.PI / 2, 0).slice(1), { r: R, z: Math.max(top, R) }]
    case "bull": {
      const rc = Math.min(m.cornerRadius ?? 0, R)
      return rc <= 1e-9 ? [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: top }] : [{ r: 0, z: 0 }, ...arc(R - rc, rc, rc, -Math.PI / 2, 0), { r: R, z: Math.max(top, rc) }]
    }
    case "cornerRounding": {
      // A concave quarter circle from the pilot to the full diameter: it rounds the edge it runs along.
      const rc = Math.min(m.cornerRadius ?? R / 2, R * 0.9)
      const pilot = Math.max(R - rc, R * 0.1)
      return [{ r: 0, z: 0 }, { r: pilot, z: 0 }, ...arc(pilot + rc, 0, rc, Math.PI, Math.PI / 2).slice(1), { r: R, z: Math.max(top, rc) }]
    }
    case "chamfer": return cone(m.angle ?? 90, Math.min(R * 0.15, 1))
    case "engraver": return cone(m.angle ?? 60, Math.min(m.tipDiameter ?? 0.2, R) / 2)
    case "spot": return cone(m.angle ?? 90, 0)
    case "drill": return cone(m.angle ?? 118, 0)
    case "reamer": {
      const lead = Math.min(R * 0.15, 0.5)
      return [{ r: 0, z: 0 }, { r: R - lead, z: 0 }, { r: R, z: lead }, { r: R, z: top }]
    }
    case "tapered": {
      const taper = Math.tan(((m.angle ?? 3) * Math.PI) / 180)
      const tipR = R
      return [{ r: 0, z: 0 }, { r: tipR, z: 0 }, { r: tipR + taper * top, z: top }]
    }
    case "roughing": {
      // Chip-breaker serrations: the radius ripples along the flutes.
      const out: ProfilePoint[] = [{ r: 0, z: 0 }, { r: R, z: 0 }]
      const wave = Math.max(0.5, Math.min(2, m.diameter * 0.12))
      for (let z = wave / 2, k = 0; z < top; z += wave / 2, k++) out.push({ r: k % 2 === 0 ? R * 0.94 : R, z })
      out.push({ r: R, z: top })
      return out
    }
    case "threadmill": {
      // Teeth at the pitch: 60 degree flanks, root at 0.6 pitch below the crest.
      const p = Math.max(m.pitch ?? 1.5, 0.2)
      const depth = Math.min(0.6 * p, R * 0.4)
      const out: ProfilePoint[] = [{ r: 0, z: 0 }, { r: R - depth, z: 0 }]
      for (let z = 0; z + p <= top + 1e-9; z += p) out.push({ r: R, z: z + p / 2 }, { r: R - depth, z: z + p })
      return out
    }
    case "disc": {
      // A disc head `fluteLength` thick on a neck.
      const neck = (m.neckDiameter ?? m.shankDiameter * 0.6) / 2
      return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: top }, { r: Math.min(neck, R), z: top }]
    }
    case "dovetail": {
      const neck = (m.neckDiameter ?? m.shankDiameter * 0.6) / 2
      const h = Math.max(top, (R - neck) / Math.max(Math.tan((((m.angle ?? 60)) * Math.PI) / 180), 1e-6))
      return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: Math.min(neck, R), z: Math.min(h, top) }]
    }
    case "boringBar": {
      // The bar's swept envelope at the cutting diameter, a short insert: the head is drawn by its radius.
      return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: Math.min(top, 4) }, { r: Math.max(R * 0.45, 2), z: Math.min(top, 4) }, { r: Math.max(R * 0.45, 2), z: top }]
    }
    case "flat":
    case "facemill":
      return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: top }]
  }
}

/** The half-section of a revolved tool (mill cutter or probe), tip at the origin, +Z up the spindle. */
export const toolProfile = (model: MillModel | ProbeModel): AssemblyProfile => {
  const points: ProfilePoint[] = []
  const parts: AssemblyPart[] = []
  const push = (p: ProfilePoint, part: AssemblyPart): void => {
    const last = points[points.length - 1]
    if (last !== undefined && Math.abs(last.r - p.r) < 1e-9 && Math.abs(last.z - p.z) < 1e-9) return
    if (last !== undefined) parts.push(part)
    points.push({ r: Math.max(0, p.r), z: p.z })
  }
  if (model.family === "probe") {
    const rb = model.ballDiameter / 2, rs = Math.max(rb * 0.45, 0.4)
    // The ruby ball from its tip on the axis up to where the stylus leaves it.
    push({ r: 0, z: 0 }, "cutting")
    for (const p of arc(0, rb, rb, -Math.PI / 2, Math.PI / 2 - Math.asin(Math.min(1, rs / rb))).slice(1)) push(p, "cutting")
    push({ r: rs, z: model.stylusLength }, "shank")
    const rbody = model.bodyDiameter / 2
    push({ r: rbody, z: model.stylusLength }, "holder")
    push({ r: rbody, z: model.stylusLength + 45 }, "holder")
    push({ r: 0, z: model.stylusLength + 45 }, "holder")
    return { points, parts, length: model.stylusLength + 45, assumedHolder: false }
  }
  for (const p of millCutting(model)) push(p, "cutting")
  const Rs = Math.max(model.shankDiameter / 2, 1e-3)
  const top = points[points.length - 1]!
  const stickout = Math.max(model.stickout, top.z + 1e-3)
  const step = Math.min(Math.abs(top.r - Rs), Math.max(0, stickout - top.z))
  if (Math.abs(top.r - Rs) > 1e-9) push({ r: Rs, z: top.z + step }, "shank")
  push({ r: Rs, z: stickout }, "shank")
  let length = stickout
  if (model.holder !== undefined) {
    const Rh = Math.max(model.holder.diameter / 2, Rs)
    push({ r: Rh, z: stickout }, "holder")
    push({ r: Rh, z: stickout + model.holder.length }, "holder")
    push({ r: 0, z: stickout + model.holder.length }, "holder")
    length += model.holder.length
  } else push({ r: 0, z: stickout }, "shank")
  return { points, parts, length, assumedHolder: false }
}

/** Generic collet holder for a mill model that names none (drawn translucent, flagged assumed). */
export const assumedHolderOf = (m: MillModel): { readonly diameter: number; readonly length: number } =>
  ({ diameter: Math.round(Math.max(m.shankDiameter * 1.6 + 12, 22)), length: 45 })

/** Meshes of a revolved model; `assumeHolder` adds the generic holder when the model has none. */
export const toolMeshes = (model: MillModel | ProbeModel, options: { readonly assumeHolder?: boolean; readonly segments?: number } = {}): ReadonlyArray<AssemblyMesh> => {
  if (model.family === "mill" && model.holder === undefined && options.assumeHolder === true) {
    const meshes = revolveProfile(toolProfile({ ...model, holder: assumedHolderOf(model) }), options.segments)
    return meshes.map((m) => (m.part === "holder" ? { ...m, assumed: true } : m))
  }
  return revolveProfile(toolProfile(model), options.segments)
}

/** The envelope the set-up checks use: largest cutting radius and the reach from the tip to the holder face. */
export const toolEnvelope = (model: ToolModel): { readonly radius: number; readonly length: number } => {
  if (model.family === "mill") {
    const cutting = toolProfile(model).points.filter((_, i, all) => i < all.length)
    return { radius: Math.max(model.diameter / 2, ...cutting.filter((p) => p.z <= model.fluteLength + 1e-9).map((p) => p.r)), length: model.stickout }
  }
  if (model.family === "probe") return { radius: model.ballDiameter / 2, length: model.stylusLength }
  return { radius: 0.5, length: 20 }
}

/** The closest kernel cutter for cutting data and verification (`undefined`: not a cutting tool). */
export const cutterOf = (model: ToolModel, id = "tool", name = "tool"): Cutter | undefined => {
  if (model.family !== "mill") return undefined
  const kind: CutterKind = ({ flat: "flat", roughing: "flat", reamer: "flat", tapered: "flat", disc: "flat", boringBar: "flat", ball: "ball", bull: "bull", cornerRounding: "bull", chamfer: "chamfer", dovetail: "chamfer", engraver: "engraver", spot: "spot", drill: "drill", facemill: "facemill", threadmill: "threadmill" } as const)[model.shape]
  return {
    id, name, kind, diameter: model.diameter, flutes: model.flutes, material: "carbide", coating: "none", fluteLength: model.fluteLength,
    shankDiameter: model.shankDiameter, stickout: model.stickout, ...(model.holder !== undefined ? { holder: model.holder } : {}),
    ...(model.cornerRadius !== undefined ? { cornerRadius: model.cornerRadius } : {}), ...(model.angle !== undefined ? { angle: model.angle } : {}),
    ...(model.pitch !== undefined ? { pitch: model.pitch } : {}), ...(model.tipDiameter !== undefined ? { tipDiameter: model.tipDiameter } : {})
  }
}

/** One line for labels and the assistant: what the model is, what was assumed. */
export const describeTool = (model: ToolModel): string => {
  const assumed = model.assumed.length > 0 ? ` (assumed: ${model.assumed.join(", ")})` : ""
  switch (model.family) {
    case "mill": return `${model.shape} Ø${model.diameter}, ${model.flutes} flutes, ${model.fluteLength} mm cutting, Ø${model.shankDiameter} shank, ${round(model.stickout)} mm stickout${model.cornerRadius !== undefined ? `, r${model.cornerRadius}` : ""}${model.angle !== undefined ? `, ${model.angle}°` : ""}${model.pitch !== undefined ? `, pitch ${model.pitch}` : ""}${assumed}`
    case "probe": return `touch probe, ball Ø${model.ballDiameter}, stylus ${model.stylusLength} mm${assumed}`
    case "setter": return `tool setter, pad Ø${model.padDiameter}${assumed}`
    case "lathe": return `${model.insert} insert${model.noseRadius > 0 ? `, nose r${model.noseRadius}` : ""}${model.insert === "grooving" || model.insert === "parting" ? `, ${model.width} mm wide` : ""}${assumed}`
    case "nozzle": return `${model.nozzle} nozzle Ø${model.diameter}${assumed}`
  }
}
const round = (n: number) => Math.round(n * 100) / 100
