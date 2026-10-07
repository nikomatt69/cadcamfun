/**
 * What the verifier is asked: the generator's own job (settings, geometry, stock) plus the holder the
 * user describes. A pure function over snapshots, like `job.ts`, so the rules are testable without a DOM.
 */
import { cam } from "@cadcamfun/core"

export interface HolderForm {
  /** Flute length, mm; 0 = not modelled. */
  readonly cuttingLength: number
  /** Length from the tip to the holder face, mm; 0 = not modelled. */
  readonly stickout: number
  /** Holder diameter, mm; 0 = not modelled. */
  readonly holderDiameter: number
  readonly holderLength: number
  readonly tolerance: number
}

export const DEFAULT_HOLDER: HolderForm = { cuttingLength: 0, stickout: 0, holderDiameter: 0, holderLength: 40, tolerance: 0.05 }

const positive = (n: number): n is number => Number.isFinite(n) && n > 0

/** Tool fields the user filled in; a zero or blank field means "not modelled", never a zero-size tool. */
export const toolOverrides = (form: HolderForm): Partial<cam.verify.VerifyTool> => ({
  ...(positive(form.cuttingLength) ? { cuttingLength: form.cuttingLength } : {}),
  ...(positive(form.stickout) ? { stickout: form.stickout } : {}),
  ...(positive(form.holderDiameter) ? { holderDiameter: form.holderDiameter, ...(positive(form.holderLength) ? { holderLength: form.holderLength } : {}) } : {})
})

export const buildVerifyRequest = (
  request: cam.generator.GenerateRequest,
  gcode: string,
  form: HolderForm = DEFAULT_HOLDER
): cam.verify.VerifyRequestResult => {
  if (gcode.trim().length === 0) return { ok: false, error: "Generate or paste G-code first" }
  return cam.verify.verifyRequestFor(request, gcode, {
    tool: toolOverrides(form),
    ...(Number.isFinite(form.tolerance) && form.tolerance >= 0 ? { tolerance: form.tolerance } : {})
  })
}

export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

/** Issues worst first; equal severities keep the order the verifier found them in. */
export const sortedIssues = (issues: ReadonlyArray<cam.verify.VerifyIssue>): ReadonlyArray<cam.verify.VerifyIssue> =>
  issues.map((issue, index) => ({ issue, index }))
    .sort((a, b) => SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] || a.index - b.index)
    .map(({ issue }) => issue)

/** Colour of a remaining-stock height, from the stock top (light) to the floor (dark), as a CSS rgb string. */
export const heightColour = (z: number, minZ: number, maxZ: number): string => {
  const t = maxZ > minZ ? Math.min(1, Math.max(0, (z - minZ) / (maxZ - minZ))) : 1
  const v = Math.round(60 + t * 170)
  return `rgb(${v},${Math.round(v * 0.92)},${Math.round(v * 0.75)})`
}
