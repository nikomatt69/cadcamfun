/**
 * Compatibility Adapter (spec 29 §12 `compatibility/`): the legacy toolpath-generator settings in, the kernel's cutting data
 * out, and a patch of the settings fields that carry it. The generator keeps its own defaults; a caller (the CAM panel, the
 * assistant) applies the patch when it asks for material-correct parameters.
 */
import type { ToolpathSettings } from "../generator/schema.ts"
import type { Cutter, CutterKind, ToolMaterial } from "./cutters.ts"
import { cuttingData, type CutClass, type CuttingData, type MachineLimits } from "./cutting-data.ts"
import { findMaterial, LEGACY_MATERIAL_GRADE, type WorkpieceMaterial } from "./materials.ts"

const KIND: Readonly<Record<string, CutterKind>> = {
  endmill: "flat", ballnose: "ball", drill: "drill", vbit: "engraver", chamfer: "chamfer", threadmill: "threadmill", reamer: "drill"
}

/** The cut a legacy operation performs. */
export const legacyCutClass = (s: ToolpathSettings): CutClass => {
  switch (s.operationType) {
    case "drill": return "drill"
    case "engrave": return "engrave"
    case "threading": return "thread-mill"
    case "3d_surface":
      return s.surfaceStrategy === "roughing" ? (s.surfaceClearing === "adaptive" ? "adaptive" : "rough-side") : "finish-3d"
    case "pocket": return "rough-side"
    case "contour":
    case "profile": return s.finishingPass ? "finish-wall" : "rough-side"
    default: return "rough-side"
  }
}

export interface LegacyRecommendation {
  readonly material: WorkpieceMaterial
  readonly cutter: Cutter
  readonly data: CuttingData
  /** Settings fields to apply. */
  readonly patch: Partial<Pick<ToolpathSettings, "rpm" | "feedrate" | "plungerate" | "stepdown" | "stepover" | "coolant" | "adaptiveEngagement" | "threadPasses">>
}

/**
 * Cutting data for the settings of the generator. `grade` refines the legacy family (`aluminum` -> `al-7075-t6`); `toolMaterial`
 * defaults to carbide; `machine` defaults to the spindle speed the settings allow and a feed of 10 m/min.
 */
export const recommendForSettings = (
  s: ToolpathSettings,
  options: { readonly grade?: string; readonly toolMaterial?: ToolMaterial; readonly machine?: Partial<MachineLimits>; readonly stickout?: number } = {}
): LegacyRecommendation | undefined => {
  if (s.machineType !== "mill") return undefined
  const material = (options.grade !== undefined ? findMaterial(options.grade) : undefined) ?? findMaterial(LEGACY_MATERIAL_GRADE[s.material] ?? s.material)
  if (material === undefined) return undefined
  const kind = KIND[s.toolType] ?? "flat"
  const d = s.toolDiameter
  const cutter: Cutter = {
    id: "settings-tool", name: `${s.toolType} Ø${d}`, kind, diameter: d, flutes: s.flutes, material: options.toolMaterial ?? "carbide",
    coating: material.iso === "N" ? "none" : "altin", fluteLength: Math.max(1, 3 * d), shankDiameter: Math.max(3, d), stickout: options.stickout ?? Math.max(10, 4 * d + 10),
    ...(kind === "engraver" || kind === "chamfer" ? { angle: 60, tipDiameter: 0.2 } : {}),
    ...(kind === "drill" ? { angle: 140 } : {}),
    ...(kind === "threadmill" ? { pitch: s.threadPitch } : {})
  }
  const machine: MachineLimits = { maxRpm: options.machine?.maxRpm ?? 24000, maxFeed: options.machine?.maxFeed ?? 10000, ...options.machine }
  const cut = legacyCutClass(s)
  const data = cuttingData({ material, cutter, cut, machine, depth: s.depth })
  const patch: Record<string, unknown> = {
    rpm: data.rpm,
    feedrate: data.feed,
    plungerate: data.plungeFeed,
    coolant: data.coolant !== "off"
  }
  if (cut !== "drill" && cut !== "thread-mill") patch["stepdown"] = data.ap
  if (cut === "adaptive") patch["adaptiveEngagement"] = Math.max(1, Math.min(50, data.stepoverPercent))
  else if (cut !== "drill" && cut !== "thread-mill" && cut !== "engrave") patch["stepover"] = Math.max(1, Math.min(100, data.stepoverPercent))
  if (cut === "thread-mill" && data.passes !== undefined) patch["threadPasses"] = data.passes
  return { material, cutter, data, patch: patch as LegacyRecommendation["patch"] }
}
