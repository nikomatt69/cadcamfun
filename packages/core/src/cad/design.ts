/**
 * The design space of the CAD editor: its axes, planes, angle conventions and what each solid's own axis is, plus the checks that
 * say whether a model makes sense (the CAD counterpart of `cam/machine.ts` for machines).
 *
 * Working in 3D means being able to say, for every shape, where it is, which way it points, how big it is and whether it touches the
 * rest. The table below is what the editor really does (its renderer reads these fields), so the assistant and the user reason about
 * the same space; `checkModel` finds what is illogical in it. Lengths are millimetres.
 */
import { chordError, segmentsFor } from "./tolerance.ts"

export const DESIGN_SPACE = {
  handedness: "right-handed",
  axes: {
    X: "to the right on the top view",
    Y: "away from the viewer on the top view (up the screen)",
    Z: "up, out of the ground plane; the height of a solid"
  },
  planes: {
    XY: "the ground plane (top view): 2D elements lie flat on it at their z; a mill's table and a printer's plate are parallel to it",
    XZ: "the front plane (front view)",
    YZ: "the side plane (right view)"
  },
  origin: "X0 Y0 Z0 is the world origin; solids are placed by their CENTRE (x, y, z), flat elements by their centre, lines by their end points",
  angles: {
    rotation: "element.rotation {x, y, z} is in DEGREES, applied about the element's own centre",
    arcs: "arc startAngle and endAngle are RADIANS, counter-clockwise from +X",
    revolution: "the revolution angle is in RADIANS (2 pi = a full turn)"
  },
  solidAxes: {
    cylinder: "stands along Z; height is its Z extent, radius its radius; centred on x, y, z",
    cone: "stands along Z with the apex at +Z; height along Z",
    capsule: "its direction field (x, y or z) is its axis",
    torus: "lies in the XY plane, tube axis round Z",
    cube: "width is the X extent, height the Y extent, depth the Z extent",
    pyramid: "base in XY (baseWidth x baseDepth), apex at +Z over height",
    prism: "regular polygon of `sides` in XY, height along Z",
    revolution: "profile x is the radius, profile y the height along its axis (default Y); angle is the sweep",
    extrusion: "the profile in XY is extruded depth along +Z"
  },
  /** Rule of thumb for fitting a model to a machine. */
  toMachine: "mill: Z0 is the top of the stock, the part sits at negative Z; printer: the part is set down on the plate (bottom at Z0); lathe: model the half section as a revolution and the axis is the spindle"
} as const

export interface DesignIssue {
  readonly severity: "error" | "warning" | "info"
  readonly code: string
  readonly elementId?: string
  readonly message: string
}

type El = Readonly<Record<string, unknown>> & { readonly id?: unknown; readonly type?: unknown }

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

export interface CheckOptions {
  /** Drawing tolerance, mm: features smaller than it cannot be drawn or machined. */
  readonly tolerance?: number
  /** A stock box or plate: parts outside it are reported. */
  readonly stock?: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ?: number; readonly maxZ?: number }
  /** Axis-aligned bounds of an element (the editor's own rules live in the CAM generator). */
  readonly boundsOf?: (element: El) => { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } } | undefined
}

const SIZE_KEYS = ["width", "height", "depth", "radius", "radiusX", "radiusY", "radiusZ", "length", "thickness", "tubeRadius", "baseWidth", "baseDepth"] as const
const SOLIDS = new Set(["cube", "box", "sphere", "cylinder", "cone", "torus", "pyramid", "prism", "hemisphere", "ellipsoid", "capsule", "extrusion", "revolution", "parametric", "sweep", "loft", "gear", "spring", "bolt", "screw", "nut", "washer", "wall", "column", "stair"])
const BOOLEANS = new Set(["boolean-union", "boolean-subtract", "boolean-intersect"])
/** Angles that look like radians typed into a field that holds degrees. */
const RADIAN_LOOKALIKES = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI]
const TOO_LARGE = 20_000

const key = (e: El, bounds?: ReturnType<NonNullable<CheckOptions["boundsOf"]>>): string =>
  JSON.stringify([e.type, ...["x", "y", "z", "x1", "y1", "z1", "x2", "y2", "z2", ...SIZE_KEYS].map((k) => num(e[k as string]) ?? null), bounds ? [bounds.min, bounds.max] : null])

/** Reads a model for what is illogical in it. Static and fast; it never changes anything. */
export const checkModel = (elements: ReadonlyArray<El>, options: CheckOptions = {}): ReadonlyArray<DesignIssue> => {
  const issues: DesignIssue[] = []
  const add = (severity: DesignIssue["severity"], code: string, element: El | undefined, message: string) =>
    issues.push({ severity, code, ...(element?.id !== undefined ? { elementId: String(element.id) } : {}), message })
  const tolerance = options.tolerance
  const ids = new Set(elements.map((e) => String(e.id)))
  const boxes: Array<{ readonly e: El; readonly b: NonNullable<ReturnType<NonNullable<CheckOptions["boundsOf"]>>> }> = []
  const seen = new Map<string, El>()

  for (const e of elements) {
    const type = String(e.type)
    for (const [field, value] of Object.entries(e)) {
      if (typeof value === "number" && !Number.isFinite(value)) add("error", "NON_FINITE", e, `${type}.${field} is not a finite number`)
    }
    for (const field of SIZE_KEYS) {
      const value = num(e[field])
      if (value === undefined) continue
      if (value <= 0) add("error", "NON_POSITIVE_SIZE", e, `${type}.${field} is ${value}: a size must be positive`)
      else if (value > TOO_LARGE) add("warning", "SUSPECT_SCALE", e, `${type}.${field} is ${value} mm (${(value / 1000).toFixed(1)} m): is a unit mixed up?`)
      else if (tolerance !== undefined && value < tolerance && field !== "thickness") add("warning", "BELOW_TOLERANCE", e, `${type}.${field} (${value} mm) is smaller than the drawing tolerance (${tolerance} mm)`)
    }
    const rotation = e["rotation"]
    if (rotation !== undefined) {
      if (typeof rotation !== "object" || rotation === null) add("error", "BAD_ROTATION", e, "rotation must be {x, y, z} in degrees")
      else {
        for (const axis of ["x", "y", "z"] as const) {
          const v = num((rotation as Record<string, unknown>)[axis])
          if (v !== undefined && v !== 0 && Math.abs(v) <= 6.3 && RADIAN_LOOKALIKES.some((r) => Math.abs(Math.abs(v) - r) < 0.005)) {
            add("warning", "ROTATION_IN_RADIANS", e, `rotation.${axis} is ${v}: rotation is in DEGREES, so this is almost no turn. Did you mean ${Math.round((v * 180) / Math.PI)}?`)
          }
        }
      }
    }
    if (BOOLEANS.has(type)) {
      const operands = Array.isArray(e["operands"]) ? (e["operands"] as unknown[]) : []
      if (operands.length < 2) add("error", "BOOLEAN_OPERANDS", e, `${type} needs at least two operands`)
      for (const operand of operands) if (typeof operand === "string" && !ids.has(operand)) add("error", "BOOLEAN_OPERANDS", e, `${type} refers to "${operand}", which is not in the drawing`)
    }
    if (type === "revolution" && Array.isArray(e["profile"])) {
      const profile = e["profile"] as Array<{ x?: unknown }>
      if (profile.some((p) => (num(p.x) ?? 0) < 0)) add("warning", "REVOLUTION_NEGATIVE_RADIUS", e, "revolution profile has negative x: x is the radius, so the profile folds over the axis")
    }
    if (type === "circle" || type === "cylinder" || type === "sphere" || type === "cone") {
      const r = num(e["radius"])
      const segments = num(e["segments"])
      const own = num(e["tolerance"])
      if (r !== undefined && tolerance !== undefined && segments !== undefined && own === undefined) {
        const error = chordError(r, segments)
        if (error > tolerance * 1.001) add("info", "COARSE_MESH", e, `${segments} segments deviate ${error.toFixed(4)} mm; ${segmentsFor(r, tolerance)} would meet the ${tolerance} mm tolerance`)
      }
    }
    const bounds = options.boundsOf?.(e)
    if (bounds !== undefined && SOLIDS.has(type)) boxes.push({ e, b: bounds })
    if (bounds !== undefined && options.stock !== undefined) {
      const s = options.stock
      if (bounds.min.x < s.minX - 1e-6 || bounds.max.x > s.maxX + 1e-6 || bounds.min.y < s.minY - 1e-6 || bounds.max.y > s.maxY + 1e-6) {
        add("warning", "OUTSIDE_STOCK", e, `${type} leaves the stock / plate (X ${bounds.min.x.toFixed(1)}..${bounds.max.x.toFixed(1)}, Y ${bounds.min.y.toFixed(1)}..${bounds.max.y.toFixed(1)})`)
      }
    }
    const signature = key(e, bounds)
    const twin = seen.get(signature)
    if (twin !== undefined) add("warning", "DUPLICATE", e, `${type} is identical to ${String(twin.id)}: two overlapping copies`)
    else seen.set(signature, e)
  }

  // A part that touches nothing, in a model of several, usually has a wrong position (a wheel floating beside a body).
  if (boxes.length > 1) {
    const gap = Math.max(tolerance ?? 0, 1e-6)
    for (const { e, b } of boxes) {
      const touches = boxes.some((other) => other.e !== e &&
        b.min.x <= other.b.max.x + gap && b.max.x >= other.b.min.x - gap &&
        b.min.y <= other.b.max.y + gap && b.max.y >= other.b.min.y - gap &&
        b.min.z <= other.b.max.z + gap && b.max.z >= other.b.min.z - gap)
      if (!touches) add("info", "FLOATING", e, `${String(e.type)} touches no other solid: check its x, y, z (placed by its centre)`)
    }
  }
  return issues
}
