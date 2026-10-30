/**
 * The JSON form of a `Brep` (spec 72 step 2.2: an imported STEP body that survives the API, the store and the desktop).
 *
 * A `Brep` is plain index tables (see `topology.ts`), so its JSON form is the tables themselves plus a version tag:
 *
 *   { version: 1, vertices, edges, faces, shells }
 *
 * Nothing is rounded or re-derived: a JavaScript number is written and read back bit for bit by `JSON.stringify` /
 * `JSON.parse`, so the volume, the topology counts and every tolerance of a decoded body equal those of the encoded one. What
 * is left out is only what is not part of the body: the derivation record of `provenance.ts` (a `WeakMap` keyed by object
 * identity) and any property the tables do not declare.
 *
 * `brepFromJson` is the checked way in. It reads untrusted data (an API payload, a stored element, a file) and answers either the
 * body or a list of problems, each with the path of the field (`faces[3].loops[0].coedges[2].edge`). It checks the shape of every
 * curve and surface kind, that numbers are finite, that every index points at something, and a size limit (`BrepLimits`) so a
 * history cannot be made to carry an unbounded body. It does not judge geometry: `validateBrep` does that (closed, manifold,
 * watertight), and the import runs it before a body becomes a base.
 */
import type { Brep } from "./topology.ts"

/** The version of the JSON form this module writes and reads. A reader refuses any other. */
export const BREP_JSON_VERSION = 1 as const

/** A `Brep` as it is stored: the tables with the version tag. Structurally a `Brep`, so a kernel that is handed it needs no conversion. */
export type BrepJson = Brep & { readonly version: typeof BREP_JSON_VERSION }

/** What one stored body may weigh. Declared once; the import refuses and the schema checks with the same numbers. */
export interface BrepLimits {
  /** Faces of one body. */
  readonly faces: number
  /** Characters of the body's JSON text (about its bytes: the text is ASCII digits and punctuation). */
  readonly bytes: number
}

/** 4 000 faces and 4 MB per base body; a history carries at most `MAX_BASES` of them within `MAX_BASES_BYTES` altogether. */
export const BREP_LIMITS: BrepLimits = { faces: 4_000, bytes: 4_000_000 }
export const MAX_BASES = 8
export const MAX_BASES_BYTES = 12_000_000

export interface BrepProblem {
  /** Path of the refused field inside the body, e.g. `["faces", 3, "surface", "radius"]`. */
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

export type BrepDecoded = { readonly ok: true; readonly brep: Brep; readonly bytes: number } | { readonly ok: false; readonly problems: ReadonlyArray<BrepProblem> }

/** The body as its JSON form. Throws a `RangeError` naming the path when a number is not finite (JSON would turn it into `null`). */
export const brepToJson = (brep: Brep): BrepJson => {
  const bad = firstNonFinite(brep, [])
  if (bad !== undefined) throw new RangeError(`brepToJson: ${formatPath(bad)} is not a finite number`)
  return { version: BREP_JSON_VERSION, vertices: brep.vertices, edges: brep.edges, faces: brep.faces, shells: brep.shells }
}

/** The text of the body's JSON form. */
export const brepToText = (brep: Brep): string => JSON.stringify(brepToJson(brep))

/** The body of a JSON form, or why it is refused. `limits` defaults to `BREP_LIMITS`. */
export const brepFromJson = (value: unknown, limits: BrepLimits = BREP_LIMITS): BrepDecoded => {
  const problems: BrepProblem[] = []
  const add = (path: ReadonlyArray<string | number>, message: string): void => { if (problems.length < 40) problems.push({ path, message }) }
  if (!isRecord(value)) return { ok: false, problems: [{ path: [], message: "a body is an object { version, vertices, edges, faces, shells }" }] }
  if (value["version"] !== BREP_JSON_VERSION) return { ok: false, problems: [{ path: ["version"], message: `the body's JSON version must be ${BREP_JSON_VERSION}${value["version"] === undefined ? " (missing)" : ` (got ${JSON.stringify(value["version"])})`}` }] }
  for (const key of ["vertices", "edges", "faces", "shells"] as const) if (!Array.isArray(value[key])) add([key], "must be an array")
  if (problems.length > 0) return { ok: false, problems }
  const vertices = value["vertices"] as ReadonlyArray<unknown>, edges = value["edges"] as ReadonlyArray<unknown>
  const faces = value["faces"] as ReadonlyArray<unknown>, shells = value["shells"] as ReadonlyArray<unknown>
  if (faces.length === 0) add(["faces"], "a body needs at least one face")
  if (faces.length > limits.faces) add(["faces"], `${faces.length} faces is above the limit of ${limits.faces} faces per body`)
  if (problems.length > 0) return { ok: false, problems }

  const num = (path: ReadonlyArray<string | number>, v: unknown): void => { if (typeof v !== "number" || !Number.isFinite(v)) add(path, "must be a finite number") }
  const positive = (path: ReadonlyArray<string | number>, v: unknown): void => { if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) add(path, "must be a number above zero") }
  const index = (path: ReadonlyArray<string | number>, v: unknown, count: number, what: string): void => {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= count) add(path, `must be a ${what} index in 0..${count - 1}${typeof v === "number" ? ` (got ${v})` : ""}`)
  }
  const vec = (path: ReadonlyArray<string | number>, v: unknown): void => {
    if (!isRecord(v)) return add(path, "must be a point { x, y, z }")
    for (const k of ["x", "y", "z"]) num([...path, k], v[k])
  }
  const vec2 = (path: ReadonlyArray<string | number>, v: unknown): void => {
    if (!isRecord(v)) return add(path, "must be a point { x, y }")
    for (const k of ["x", "y"]) num([...path, k], v[k])
  }
  const frame = (path: ReadonlyArray<string | number>, v: unknown): void => {
    if (!isRecord(v)) return add(path, "must be a frame { origin, x, y, z }")
    for (const k of ["origin", "x", "y", "z"]) vec([...path, k], v[k])
  }
  const numbers = (path: ReadonlyArray<string | number>, v: unknown, min = 0): void => {
    if (!Array.isArray(v) || v.length < min) return add(path, `must be an array of at least ${min} numbers`)
    v.forEach((x, i) => num([...path, i], x))
  }
  const nurbsCurve = (path: ReadonlyArray<string | number>, d: unknown): void => {
    if (!isRecord(d)) return add(path, "must be NURBS curve data { degree, knots, points, weights? }")
    if (!Number.isInteger(d["degree"]) || (d["degree"] as number) < 1) add([...path, "degree"], "must be an integer of at least 1")
    numbers([...path, "knots"], d["knots"], 2)
    const pts = d["points"]
    if (!Array.isArray(pts) || pts.length < 2) add([...path, "points"], "must be an array of at least 2 control points")
    else pts.forEach((p, i) => numbers([...path, "points", i], p, 2))
    if (d["weights"] !== undefined) numbers([...path, "weights"], d["weights"], 1)
    if (Array.isArray(pts) && Array.isArray(d["knots"]) && Number.isInteger(d["degree"]) && d["knots"].length !== pts.length + (d["degree"] as number) + 1) add([...path, "knots"], `a degree ${d["degree"]} curve with ${pts.length} points needs ${pts.length + (d["degree"] as number) + 1} knots, got ${d["knots"].length}`)
    if (Array.isArray(pts) && Array.isArray(d["weights"]) && d["weights"].length !== pts.length) add([...path, "weights"], "needs one weight per control point")
  }
  const nurbsSurface = (path: ReadonlyArray<string | number>, d: unknown): void => {
    if (!isRecord(d)) return add(path, "must be NURBS surface data { degreeU, degreeV, knotsU, knotsV, points, weights? }")
    for (const k of ["degreeU", "degreeV"]) if (!Number.isInteger(d[k]) || (d[k] as number) < 1) add([...path, k], "must be an integer of at least 1")
    numbers([...path, "knotsU"], d["knotsU"], 2)
    numbers([...path, "knotsV"], d["knotsV"], 2)
    const rows = d["points"]
    if (!Array.isArray(rows) || rows.length < 2) return add([...path, "points"], "must be a grid of at least 2 x 2 control points")
    rows.forEach((row, i) => {
      if (!Array.isArray(row) || row.length < 2) return add([...path, "points", i], "must be a row of at least 2 control points")
      row.forEach((p, j) => numbers([...path, "points", i, j], p, 3))
    })
    const nu = rows.length, nv = Array.isArray(rows[0]) ? rows[0].length : 0
    if (Array.isArray(d["knotsU"]) && Number.isInteger(d["degreeU"]) && d["knotsU"].length !== nu + (d["degreeU"] as number) + 1) add([...path, "knotsU"], `needs ${nu + (d["degreeU"] as number) + 1} knots for ${nu} rows at degree ${d["degreeU"]}, got ${d["knotsU"].length}`)
    if (Array.isArray(d["knotsV"]) && Number.isInteger(d["degreeV"]) && d["knotsV"].length !== nv + (d["degreeV"] as number) + 1) add([...path, "knotsV"], `needs ${nv + (d["degreeV"] as number) + 1} knots for ${nv} columns at degree ${d["degreeV"]}, got ${d["knotsV"].length}`)
    if (d["weights"] !== undefined) {
      const w = d["weights"]
      if (!Array.isArray(w) || w.length !== nu) add([...path, "weights"], "needs one row of weights per row of control points")
      else w.forEach((row, i) => { if (!Array.isArray(row) || row.length !== nv) add([...path, "weights", i], "needs one weight per control point of the row"); else numbers([...path, "weights", i], row) })
    }
  }
  const curve3 = (path: ReadonlyArray<string | number>, c: unknown): void => {
    if (!isRecord(c)) return add(path, "must be a curve { kind, ... }")
    switch (c["kind"]) {
      case "line": vec([...path, "origin"], c["origin"]); vec([...path, "dir"], c["dir"]); return
      case "circle": frame([...path, "frame"], c["frame"]); positive([...path, "radius"], c["radius"]); return
      case "ellipse": frame([...path, "frame"], c["frame"]); positive([...path, "a"], c["a"]); positive([...path, "b"], c["b"]); return
      case "nurbs": nurbsCurve([...path, "data"], c["data"]); return
      default: add([...path, "kind"], `unknown curve kind ${JSON.stringify(c["kind"])} (line, circle, ellipse, nurbs)`)
    }
  }
  const curve2 = (path: ReadonlyArray<string | number>, c: unknown): void => {
    if (!isRecord(c)) return add(path, "must be a parameter-space curve { kind, ... }")
    switch (c["kind"]) {
      case "line2": vec2([...path, "origin"], c["origin"]); vec2([...path, "dir"], c["dir"]); return
      case "circle2": vec2([...path, "center"], c["center"]); positive([...path, "radius"], c["radius"]); return
      case "nurbs2": nurbsCurve([...path, "data"], c["data"]); return
      case "poly2": {
        const pts = c["points"], params = c["params"]
        if (!Array.isArray(pts) || pts.length < 2) add([...path, "points"], "must be an array of at least 2 points")
        else pts.forEach((p, i) => vec2([...path, "points", i], p))
        numbers([...path, "params"], params, 2)
        if (Array.isArray(pts) && Array.isArray(params) && pts.length !== params.length) add([...path, "params"], "needs one parameter per point")
        return
      }
      default: add([...path, "kind"], `unknown parameter-space curve kind ${JSON.stringify(c["kind"])} (line2, circle2, nurbs2, poly2)`)
    }
  }
  const surface = (path: ReadonlyArray<string | number>, s: unknown): void => {
    if (!isRecord(s)) return add(path, "must be a surface { kind, ... }")
    switch (s["kind"]) {
      case "plane": frame([...path, "frame"], s["frame"]); return
      case "cylinder": frame([...path, "frame"], s["frame"]); positive([...path, "radius"], s["radius"]); return
      case "cone": frame([...path, "frame"], s["frame"]); num([...path, "radius"], s["radius"]); num([...path, "semiAngle"], s["semiAngle"]); return
      case "sphere": frame([...path, "frame"], s["frame"]); positive([...path, "radius"], s["radius"]); return
      case "torus": frame([...path, "frame"], s["frame"]); positive([...path, "major"], s["major"]); positive([...path, "minor"], s["minor"]); return
      case "nurbs": nurbsSurface([...path, "data"], s["data"]); return
      case "revolution": curve3([...path, "curve"], s["curve"]); vec([...path, "origin"], s["origin"]); vec([...path, "axis"], s["axis"]); return
      case "extrusion": curve3([...path, "curve"], s["curve"]); vec([...path, "dir"], s["dir"]); return
      default: add([...path, "kind"], `unknown surface kind ${JSON.stringify(s["kind"])} (plane, cylinder, cone, sphere, torus, nurbs, revolution, extrusion)`)
    }
  }

  vertices.forEach((v, i) => {
    if (!isRecord(v)) return add(["vertices", i], "must be { point, tol }")
    vec(["vertices", i, "point"], v["point"])
    num(["vertices", i, "tol"], v["tol"])
    if (typeof v["tol"] === "number" && v["tol"] < 0) add(["vertices", i, "tol"], "a tolerance cannot be negative")
  })
  edges.forEach((e, i) => {
    if (!isRecord(e)) return add(["edges", i], "must be { curve, t0, t1, v0, v1, tol }")
    curve3(["edges", i, "curve"], e["curve"])
    num(["edges", i, "t0"], e["t0"]); num(["edges", i, "t1"], e["t1"]); num(["edges", i, "tol"], e["tol"])
    if (typeof e["t0"] === "number" && typeof e["t1"] === "number" && !(e["t1"] > e["t0"])) add(["edges", i, "t1"], `the edge range must increase (${e["t0"]} .. ${e["t1"]})`)
    if (typeof e["tol"] === "number" && e["tol"] < 0) add(["edges", i, "tol"], "a tolerance cannot be negative")
    index(["edges", i, "v0"], e["v0"], vertices.length, "vertex"); index(["edges", i, "v1"], e["v1"], vertices.length, "vertex")
  })
  faces.forEach((f, i) => {
    if (!isRecord(f)) return add(["faces", i], "must be { surface, reversed, loops }")
    surface(["faces", i, "surface"], f["surface"])
    if (typeof f["reversed"] !== "boolean") add(["faces", i, "reversed"], "must be true or false")
    if (f["name"] !== undefined && typeof f["name"] !== "string") add(["faces", i, "name"], "must be text")
    if (f["loose"] !== undefined && f["loose"] !== true) add(["faces", i, "loose"], "must be true when present")
    const loops = f["loops"]
    if (!Array.isArray(loops) || loops.length === 0) return add(["faces", i, "loops"], "a face needs at least one loop")
    loops.forEach((l, li) => {
      const coedges = isRecord(l) ? l["coedges"] : undefined
      if (!Array.isArray(coedges) || coedges.length === 0) return add(["faces", i, "loops", li, "coedges"], "a loop needs at least one coedge")
      coedges.forEach((c, ci) => {
        const path = ["faces", i, "loops", li, "coedges", ci] as const
        if (!isRecord(c)) return add(path, "must be { edge, reversed, pcurve? }")
        index([...path, "edge"], c["edge"], edges.length, "edge")
        if (typeof c["reversed"] !== "boolean") add([...path, "reversed"], "must be true or false")
        if (c["pcurve"] !== undefined) curve2([...path, "pcurve"], c["pcurve"])
      })
    })
  })
  shells.forEach((s, i) => {
    if (!isRecord(s)) return add(["shells", i], "must be { faces, closed }")
    if (typeof s["closed"] !== "boolean") add(["shells", i, "closed"], "must be true or false")
    if (!Array.isArray(s["faces"]) || s["faces"].length === 0) return add(["shells", i, "faces"], "a shell needs at least one face")
    s["faces"].forEach((x, k) => index(["shells", i, "faces", k], x, faces.length, "face"))
  })
  if (shells.length === 0) add(["shells"], "a body needs at least one shell")
  if (problems.length > 0) return { ok: false, problems }

  const bytes = JSON.stringify(value).length
  if (bytes > limits.bytes) return { ok: false, problems: [{ path: [], message: `the body's JSON is ${bytes} characters, above the limit of ${limits.bytes} per body` }] }
  // Rebuilt from the declared tables only: the version tag and any property the tables do not declare stay behind.
  return { ok: true, bytes, brep: { vertices: vertices as Brep["vertices"], edges: edges as Brep["edges"], faces: faces as Brep["faces"], shells: shells as Brep["shells"] } }
}

/** `path` as text: `faces[3].loops[0].coedges[2].edge`. */
export const formatPath = (path: ReadonlyArray<string | number>): string =>
  path.length === 0 ? "the body" : path.reduce<string>((text, part) => (typeof part === "number" ? `${text}[${part}]` : text === "" ? part : `${text}.${part}`), "")

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** The path of the first number in `value` that is not finite (one shared path stack: no copy per node). */
const firstNonFinite = (value: unknown, path: Array<string | number>): ReadonlyArray<string | number> | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? undefined : [...path]
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      path.push(i)
      const bad = firstNonFinite(value[i], path)
      path.pop()
      if (bad !== undefined) return bad
    }
    return undefined
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      path.push(key)
      const bad = firstNonFinite(value[key], path)
      path.pop()
      if (bad !== undefined) return bad
    }
  }
  return undefined
}
