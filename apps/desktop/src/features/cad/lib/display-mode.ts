import * as THREE from "three"

/**
 * How the CAD canvas draws solids (the Fusion "Visual Style" menu):
 *
 * - `shaded`: faces only.
 * - `shaded-edges`: faces and their edges (the default, what the canvas has always drawn).
 * - `hidden-line`: the faces only hide what lies behind them (depth, no colour); the edges that are visible are drawn.
 * - `wireframe`: edges only, every edge, through the solid. A part without edge lines (a plain primitive) falls back to its triangles.
 * - `xray`: translucent faces with the edges, to see through the whole model.
 * - `ghost`: with a selection, everything else fades to a faint shell so the selected parts stand out; without one, the same as `shaded-edges`.
 *
 * Presentation only: the elements and the geometry are untouched. The original look of every material is remembered on
 * `material.userData.displayBase`, so a mode is always applied from the original and the modes never compound.
 */
export const DISPLAY_MODES = ["shaded", "shaded-edges", "hidden-line", "wireframe", "xray", "ghost"] as const
export type DisplayMode = (typeof DISPLAY_MODES)[number]
export const DEFAULT_DISPLAY_MODE: DisplayMode = "shaded-edges"

export const isDisplayMode = (value: unknown): value is DisplayMode => typeof value === "string" && (DISPLAY_MODES as readonly string[]).includes(value)

/** What a mode asks of one object. `fill` is how its faces are drawn. */
export interface DisplayPlan {
  readonly fill: "solid" | "depth-only" | "invisible" | "triangles" | "translucent"
  /** Opacity the translucent fill is drawn at, as a fraction of the material's own opacity. */
  readonly opacity: number
  readonly edges: boolean
}

export const XRAY_OPACITY = 0.3
export const GHOST_OPACITY = 0.1

/**
 * The plan of one mode for one object. `hasEdges` says whether the object carries edge lines (a mesh solid or a B-rep does, a
 * plain primitive does not); `ghosted` is whether the `ghost` mode fades this object.
 */
export const planFor = (mode: DisplayMode, hasEdges: boolean, ghosted = false): DisplayPlan => {
  switch (mode) {
    case "shaded": return { fill: "solid", opacity: 1, edges: false }
    case "shaded-edges": return { fill: "solid", opacity: 1, edges: true }
    case "hidden-line": return { fill: "depth-only", opacity: 1, edges: true }
    case "wireframe": return hasEdges ? { fill: "invisible", opacity: 1, edges: true } : { fill: "triangles", opacity: 1, edges: false }
    case "xray": return { fill: "translucent", opacity: XRAY_OPACITY, edges: true }
    case "ghost": return ghosted ? { fill: "translucent", opacity: GHOST_OPACITY, edges: false } : { fill: "solid", opacity: 1, edges: true }
  }
}

interface MaterialBase {
  readonly wireframe: boolean
  readonly transparent: boolean
  readonly opacity: number
  readonly depthWrite: boolean
  readonly colorWrite: boolean
}

type DisplayMaterial = THREE.Material & { wireframe?: boolean }

/** A triangle mesh. The thick lines (`LineSegments2`) are meshes too, and their material is not the face's to dress. */
const isMesh = (object: THREE.Object3D): object is THREE.Mesh => {
  const flags = object as { isMesh?: boolean; isLine?: boolean; isLineSegments?: boolean; isLineSegments2?: boolean; isPoints?: boolean }
  return flags.isMesh === true && flags.isLineSegments2 !== true && flags.isLine !== true && flags.isLineSegments !== true && flags.isPoints !== true
}
const isEdgeHolder = (object: THREE.Object3D): boolean => object.name === "edges" || object.userData.brepEdge !== undefined

/** Whether a drawn element carries edge lines of its own (the group a mesh solid adds, the lines of a B-rep). */
export const hasEdgeLines = (root: THREE.Object3D): boolean => {
  let found = false
  root.traverse((object) => { if (!found && isEdgeHolder(object)) found = true })
  return found
}

const baseOf = (material: DisplayMaterial): MaterialBase =>
  (material.userData.displayBase ??= {
    wireframe: material.wireframe === true,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    colorWrite: material.colorWrite
  } satisfies MaterialBase) as MaterialBase

/** Puts one material in the look `plan` asks for, from its original look. Returns whether the shader has to be rebuilt. */
const dress = (material: DisplayMaterial, plan: DisplayPlan): boolean => {
  const base = baseOf(material)
  const wireframe = plan.fill === "triangles" ? true : base.wireframe
  const translucent = plan.fill === "translucent"
  const transparent = translucent ? true : base.transparent
  const rebuild = (material.wireframe === true) !== wireframe || material.transparent !== transparent
  if ("wireframe" in material) material.wireframe = wireframe
  material.transparent = transparent
  material.opacity = translucent ? base.opacity * plan.opacity : base.opacity
  // A translucent face must not hide what is behind it; a depth-only face hides it without being seen.
  material.depthWrite = translucent ? false : plan.fill === "invisible" ? false : base.depthWrite
  material.colorWrite = plan.fill === "depth-only" || plan.fill === "invisible" ? false : base.colorWrite
  if (plan.fill === "depth-only") material.depthWrite = true
  if (rebuild) material.needsUpdate = true
  return rebuild
}

/**
 * Applies `mode` to a drawn element (and everything under it). `ghosted` fades it in the `ghost` mode. Idempotent: the same
 * mode on the same object does nothing the second time. Returns whether anything changed, so the caller can ask for a frame.
 */
export const applyDisplayMode = (root: THREE.Object3D, mode: DisplayMode, ghosted = false): boolean => {
  const key = `${mode}:${ghosted ? "g" : ""}`
  const was = root.userData.displayKey as string | undefined
  if (was === key) return false
  // An element never touched and asked for the default look is already in it.
  if (was === undefined && mode === DEFAULT_DISPLAY_MODE) { root.userData.displayKey = key; return false }
  const plan = planFor(mode, hasEdgeLines(root), ghosted)
  root.traverse((object) => {
    if (object.userData.isControlPoint === true || object.userData.isOutline === true) return
    if (isEdgeHolder(object)) { object.visible = plan.edges; return }
    if (!isMesh(object)) return
    // Hidden-line faces must be in the depth buffer before the edges are tested against it.
    const base = (object.userData.displayRenderOrder ??= object.renderOrder) as number
    object.renderOrder = plan.fill === "depth-only" ? Math.min(base, -1) : base
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    // The flat fill of a section cut is never drawn as triangles: in a wireframe the cut is open.
    const look = object.userData.isSectionCap === true && plan.fill === "triangles" ? { ...plan, fill: "invisible" as const } : plan
    for (const material of materials) dress(material as DisplayMaterial, look)
  })
  root.userData.displayKey = key
  return true
}
