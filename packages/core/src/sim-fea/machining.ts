/**
 * Process load for a workpiece study (spec 48 meets spec 61): the cutting force of a milling cut from the Kienzle law the CAM
 * kernel's materials carry, so "how much does this part deflect while it is machined" is one static study with a realistic force.
 */
export interface CuttingForceInput {
  /** Specific cutting force at 1 mm chip thickness, N/mm². */
  readonly kc11: number
  /** Kienzle exponent. */
  readonly mc: number
  /** Axial depth of cut, mm. */
  readonly ap: number
  /** Chip load per tooth, mm (taken as the mean chip thickness: conservative for a wide cut). */
  readonly fz: number
  /** Teeth in the cut at once (at least 1). */
  readonly teeth?: number
}

export interface CuttingForce {
  /** Tangential force, N: `kc11 · h^(1-mc) · ap` per tooth. */
  readonly tangential: number
  /** Radial component, N (0.4 of the tangential, the usual side-milling ratio). */
  readonly radial: number
  /** Magnitude of the resultant the workpiece must carry, N. */
  readonly resultant: number
}

export const cuttingForce = (input: CuttingForceInput): CuttingForce => {
  const z = Math.max(1, input.teeth ?? 1)
  const tangential = z * input.kc11 * Math.max(input.fz, 1e-6) ** (1 - input.mc) * input.ap
  const radial = 0.4 * tangential
  return { tangential, radial, resultant: Math.hypot(tangential, radial) }
}
