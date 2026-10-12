/**
 * The section view: a plane that cuts the model so the inside can be seen at one point along an axis.
 *
 * Not inverted keeps what lies at or below `position` (the part above the plane is cut away, so the cut face is seen from
 * above, as in a section drawing); inverted keeps what lies at or above it. Positions are in the drawing's millimetres.
 */
export type SectionAxis = "x" | "y" | "z"

export interface SectionState {
  readonly enabled: boolean
  readonly axis: SectionAxis
  readonly position: number
  readonly inverted: boolean
}

export const DEFAULT_SECTION: SectionState = { enabled: false, axis: "z", position: 0, inverted: false }

export const SECTION_AXES: ReadonlyArray<SectionAxis> = ["x", "y", "z"]

export const isSectionAxis = (value: unknown): value is SectionAxis => value === "x" || value === "y" || value === "z"

const AXIS_INDEX: Readonly<Record<SectionAxis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 }

/** The clipping plane as three.js reads it: a point `p` is kept while `normal · p + constant >= 0`. */
export const clipPlaneFor = (section: Pick<SectionState, "axis" | "position" | "inverted">): { readonly normal: readonly [number, number, number]; readonly constant: number } => {
  const normal: [number, number, number] = [0, 0, 0]
  normal[AXIS_INDEX[section.axis]] = section.inverted ? 1 : -1
  return { normal, constant: section.inverted ? -section.position : section.position }
}

/** Is a point on the kept side of the section? (the cut face itself counts as kept) */
export const keeps = (section: SectionState, point: { readonly x: number; readonly y: number; readonly z: number }): boolean => {
  if (!section.enabled) return true
  const { normal, constant } = clipPlaneFor(section)
  return normal[0] * point.x + normal[1] * point.y + normal[2] * point.z + constant >= -1e-9
}

/** Merges what the assistant asked for into the current section; unknown or non-finite fields change nothing. */
export const mergeSection = (current: SectionState, patch: { readonly axis?: unknown; readonly position?: unknown; readonly inverted?: unknown; readonly enabled?: unknown }): SectionState => ({
  enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
  axis: isSectionAxis(patch.axis) ? patch.axis : current.axis,
  position: typeof patch.position === "number" && Number.isFinite(patch.position) ? patch.position : current.position,
  inverted: typeof patch.inverted === "boolean" ? patch.inverted : current.inverted
})
