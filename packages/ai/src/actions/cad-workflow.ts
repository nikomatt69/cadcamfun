/**
 * `cad.workflow`: constrained sketches, assemblies with mates, drawing sheets as vector PDF and mesh exchange, computed in process
 * from the values the model sends (see the input schema in `@cadcamfun/api`, the playbook in the skill `cad-workflow`). Nothing is
 * stored in the document: a solved sketch goes into a history through `cad_edit`, a file is returned as base64 up to a size cap.
 * Every refusal names what is wrong; no silent fallback.
 */
import type { CadWorkflowInput } from "@cadcamfun/api"
import { assembly, brep, drawing, exchange, meshTopology, rebuildExact, createSketchSession, solveSketch, sketchProfiles, polygonArea, SketchError, type Constraint, type History, type SketchEntity } from "@cadcamfun/core"
import { EXACT_ACTION_BUDGET_MS, decodeHistory } from "../parametric.ts"
import { KernelJobError, runKernelJob } from "../kernel-job.ts"
import { getAttachment, attachmentNames } from "../attachments.ts"
import type { ActionContext } from "./action.ts"
import { closedMesh } from "./export.ts"

type Rec = Record<string, unknown>
const RAD = Math.PI / 180
const round = (x: number, d = 6): number => Math.round(x * 10 ** d) / 10 ** d
/** Files larger than this are described but not returned inline (the answer would swamp the context). */
const MAX_INLINE_BYTES = 600_000

const fail = (op: CadWorkflowInput["op"], error: string, extra: Rec = {}) => ({ ok: false, op, error, ...extra })
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64")

// ---------------------------------------------------------------- sketch

/** The fields each constraint type needs: ids are strings, values numbers. */
const REQUIRED: Readonly<Record<string, ReadonlyArray<readonly [string, "id" | "number"]>>> = {
  fixed: [["point", "id"]], coincident: [["a", "id"], ["b", "id"]], horizontal: [["line", "id"]], vertical: [["line", "id"]],
  horizontalPoints: [["a", "id"], ["b", "id"]], verticalPoints: [["a", "id"], ["b", "id"]],
  distance: [["a", "id"], ["b", "id"], ["value", "number"]], distanceX: [["a", "id"], ["b", "id"], ["value", "number"]], distanceY: [["a", "id"], ["b", "id"], ["value", "number"]],
  length: [["line", "id"], ["value", "number"]], parallel: [["a", "id"], ["b", "id"]], perpendicular: [["a", "id"], ["b", "id"]], equalLength: [["a", "id"], ["b", "id"]],
  equalRadius: [["a", "id"], ["b", "id"]], radius: [["circle", "id"], ["value", "number"]], diameter: [["circle", "id"], ["value", "number"]],
  angle: [["a", "id"], ["b", "id"], ["value", "number"]], pointOnLine: [["point", "id"], ["line", "id"]], pointOnCircle: [["point", "id"], ["circle", "id"]],
  midpoint: [["point", "id"], ["line", "id"]], symmetric: [["a", "id"], ["b", "id"], ["line", "id"]], tangentLineCircle: [["line", "id"], ["circle", "id"]],
  tangentCircles: [["a", "id"], ["b", "id"]], concentric: [["a", "id"], ["b", "id"]], ellipseSize: [["ellipse", "id"], ["radiusX", "number"], ["radiusY", "number"]],
  pointOnEllipse: [["point", "id"], ["ellipse", "id"]], collinear: [["a", "id"], ["b", "id"]]
}

const constraintProblem = (c: Rec, index: number): string | undefined => {
  const need = REQUIRED[c["type"] as string]
  if (need === undefined) return `constraints[${index}]: unknown type '${String(c["type"])}'`
  for (const [key, kind] of need) {
    const v = c[key]
    if (kind === "id" ? typeof v !== "string" || v === "" : !isNum(v)) return `constraints[${index}] (${String(c["type"])}): '${key}' must be ${kind === "id" ? "an entity id" : "a number"}`
  }
  return undefined
}

const runSketch = (input: CadWorkflowInput) => {
  if (input.entities === undefined) return fail("sketch", "sketch needs entities.")
  const raw = (input.constraints ?? []) as unknown as Rec[]
  for (const [i, c] of raw.entries()) { const problem = constraintProblem(c, i); if (problem !== undefined) return fail("sketch", problem) }
  // The API speaks degrees; the solver radians.
  const constraints = raw.map((c) => (c["type"] === "angle" ? { ...c, value: (c["value"] as number) * RAD } : c)) as unknown as Constraint[]
  const sketch = { entities: input.entities as unknown as SketchEntity[], constraints }
  try {
    let solved = solveSketch(sketch)
    let dragReport: Rec | undefined
    if (input.drag !== undefined) {
      if (solved.status === "conflicting" || solved.status === "failed") return fail("sketch", `The sketch has no solution to drag from (${solved.status}).`, { conflicts: solved.diagnostics?.conflictSet ?? solved.conflicts })
      const session = createSketchSession(solved.sketch)
      const moved = session.drag(input.drag.entity, input.drag.to)
      solved = session.solve()
      dragReport = {
        reached: moved.reached, fraction: round(moved.fraction, 4), blockedBy: moved.blockedBy,
        moved: Object.fromEntries(Object.entries(moved.moved).map(([id, p]) => [id, [round(p.x), round(p.y)]]))
      }
    }
    const points: Record<string, [number, number]> = {}
    const radii: Record<string, number | [number, number]> = {}
    for (const e of solved.sketch.entities) {
      if (e.kind === "point") points[e.id] = [round(e.x), round(e.y)]
      else if (e.kind === "circle") radii[e.id] = round(e.radius)
      else if (e.kind === "ellipse") radii[e.id] = [round(e.radiusX), round(e.radiusY)]
    }
    let profiles: Rec | undefined
    try {
      const p = sketchProfiles(solved.sketch)
      profiles = { closed: p.loops.length, open: p.open.length, areas: p.loops.map((l) => round(Math.abs(polygonArea(l)), 4)) }
    } catch { /* an unfinished sketch has no profiles */ }
    const d = solved.diagnostics
    return {
      ok: solved.status !== "conflicting" && solved.status !== "failed", op: "sketch" as const, status: solved.status, dof: solved.dof, residual: solved.residual,
      free: solved.free, ...(solved.redundant > 0 ? { redundantEquations: solved.redundant } : {}),
      ...(d !== undefined ? { redundant: d.redundant, conflictSet: d.conflictSet, minimalConflict: d.minimal, freedom: d.freedom } : {}),
      ...(solved.message !== undefined ? { error: solved.message } : {}), points, radii,
      ...(solved.driven !== undefined ? { driven: solved.driven.map((x) => ({ id: x.id, type: x.type, value: round(x.type === "angle" ? x.value / RAD : x.value) })) } : {}),
      ...(profiles !== undefined ? { profiles } : {}), ...(dragReport !== undefined ? { drag: dragReport } : {})
    }
  } catch (e) {
    if (e instanceof SketchError) return fail("sketch", e.message)
    throw e
  }
}

// ---------------------------------------------------------------- assembly

const unit3 = (v: Rec | undefined, what: string): { x: number; y: number; z: number } => {
  if (v === undefined || !isNum(v["x"]) || !isNum(v["y"]) || !isNum(v["z"])) throw new Error(`${what} must be {x,y,z}`)
  return { x: v["x"], y: v["y"], z: v["z"] }
}
const normalised = (v: { x: number; y: number; z: number }, what: string) => {
  const l = Math.hypot(v.x, v.y, v.z)
  if (!(l > 1e-12)) throw new Error(`${what} must not be the zero vector`)
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

const featureOf = (raw: Rec, what: string): assembly.Feature => {
  switch (raw["kind"]) {
    case "point": return { kind: "point", p: unit3(raw["p"] as Rec, `${what}.p`) }
    case "axis": return { kind: "axis", origin: unit3(raw["origin"] as Rec, `${what}.origin`), dir: normalised(unit3(raw["dir"] as Rec, `${what}.dir`), `${what}.dir`), ...(isNum(raw["radius"]) ? { radius: raw["radius"] } : {}) }
    case "plane": return { kind: "plane", origin: unit3(raw["origin"] as Rec, `${what}.origin`), normal: normalised(unit3(raw["normal"] as Rec, `${what}.normal`), `${what}.normal`) }
    default: throw new Error(`${what}.kind must be point, axis or plane`)
  }
}

const MATE_VALUES: Readonly<Record<string, ReadonlyArray<string>>> = {
  distance: ["value"], angle: ["value"]
}

const runAssembly = (input: CadWorkflowInput) => {
  if (input.definitions === undefined || input.occurrences === undefined) return fail("assembly", "assembly needs definitions and occurrences.")
  try {
    const defs: assembly.PartDefinition[] = input.definitions.map((d) => {
      const s = d.shape
      const common = { id: d.id, name: d.name ?? d.id, ...(d.density !== undefined ? { density: d.density } : {}), ...(d.material !== undefined ? { material: d.material } : {}), ...(d.designation !== undefined ? { designation: d.designation } : {}) }
      if (s.kind === "box") return { ...common, brep: brep.makeBox(s.x, s.y, s.z) }
      if (s.kind === "cylinder") return { ...common, brep: brep.makeCylinder(s.radius, s.height) }
      return { ...common, history: s.history as unknown as History }
    })
    const known = new Set(defs.map((d) => d.id))
    const subIds = new Set((input.subAssemblies ?? []).map((sub) => sub.id))
    const clash = [...subIds].find((sid) => known.has(sid))
    if (clash !== undefined) throw new Error(`The sub-assembly '${clash}' has the id of a part definition; give it its own id.`)
    const placeOccurrence = (o: NonNullable<CadWorkflowInput["occurrences"]>[number], where: string): assembly.Occurrence => {
      if (!known.has(o.definition) && !subIds.has(o.definition)) {
        throw new Error(`${where} '${o.id}' uses the unknown definition '${o.definition}' (defined: ${[...known, ...subIds].join(", ")})`)
      }
      const rot = o.rotate === undefined ? brep.IDENTITY : brep.rotation(normalised(o.rotate.axis, `${where} '${o.id}' rotate.axis`), o.rotate.degrees * RAD)
      return {
        id: o.id, definition: o.definition, transform: brep.compose(rot, brep.translation(o.at ?? { x: 0, y: 0, z: 0 })),
        ...(o.grounded === true ? { grounded: true } : {}), ...(o.suppressed === true ? { suppressed: true } : {}),
        ...(o.overrides !== undefined ? { overrides: o.overrides } : {})
      }
    }
    const occurrences: assembly.Occurrence[] = input.occurrences.map((o) => placeOccurrence(o, "Occurrence"))
    const subAssemblies = (input.subAssemblies ?? []).map((sub) => ({ id: sub.id, name: sub.name ?? sub.id, occurrences: sub.occurrences.map((o) => placeOccurrence(o, `Sub-assembly '${sub.id}' occurrence`)) }))
    if (input.configurations !== undefined && input.designTable !== undefined) throw new Error("Send configurations or designTable, not both.")
    const configurations: assembly.Configuration[] = input.designTable !== undefined
      ? assembly.configurationsFromTable({ columns: input.designTable.columns, rows: input.designTable.rows })
      : (input.configurations ?? []).map((c) => ({ name: c.name, ...(c.parameters !== undefined ? { parameters: c.parameters } : {}), ...(c.suppressed !== undefined ? { suppressed: c.suppressed } : {}), ...(c.hidden !== undefined ? { hidden: c.hidden } : {}) }))
    const active = input.configuration
    if (active !== undefined && !configurations.some((c) => c.name === active)) {
      throw new Error(`There is no configuration '${active}'${configurations.length > 0 ? ` (defined: ${configurations.map((c) => c.name).join(", ")})` : "; define configurations or a designTable first"}.`)
    }
    const model: assembly.Assembly = {
      definitions: defs, occurrences,
      ...(subAssemblies.length > 0 ? { subAssemblies } : {}),
      ...(configurations.length > 0 ? { configurations } : {})
    }
    // Mates name leaf occurrences by path (`gearbox/bolt2` inside a sub-assembly); a suppressed one is not there.
    const ids = new Set(assembly.flattenAssembly(model, active).map((f) => f.path))
    // The poses a solve found, written onto the leaf occurrences (sub-assemblies expanded), so the checks see the solved model.
    const placedModel = (transforms: ReadonlyMap<string, brep.Transform>): assembly.Assembly => ({
      definitions: defs, ...(configurations.length > 0 ? { configurations } : {}),
      occurrences: assembly.flattenAssembly(model, active).map((f) => ({ id: f.path, definition: f.definition, transform: transforms.get(f.path) ?? f.transform, overrides: f.overrides }))
    })
    const mates: assembly.Mate[] = ((input.mates ?? []) as unknown as Rec[]).map((m, i) => {
      const where = `mates[${i}] (${String(m["kind"])})`
      const operand = (key: string): assembly.Operand => {
        const raw = m[key] as Rec | undefined
        if (raw === undefined || typeof raw["occurrence"] !== "string") throw new Error(`${where}: '${key}' must be {occurrence, feature}`)
        const occId = raw["occurrence"]
        if (!ids.has(occId)) throw new Error(`${where}: '${key}' refers to the unknown occurrence '${occId}' (occurrences: ${[...ids].join(", ")})`)
        if (raw["face"] !== undefined) {
          const def = defs.find((d) => d.id === assembly.flattenAssembly(model, active).find((f) => f.path === occId)!.definition)!
          return { occurrence: occId, feature: assembly.featureOfFace(assembly.definitionBrep(def), Number(raw["face"])) }
        }
        return { occurrence: occId, feature: featureOf(raw["feature"] as Rec, `${where} ${key}.feature`) }
      }
      for (const key of MATE_VALUES[m["kind"] as string] ?? []) if (!isNum(m[key])) throw new Error(`${where}: '${key}' must be a number`)
      if (m["kind"] === "lock") {
        if (typeof m["a"] !== "string" || typeof m["b"] !== "string") throw new Error(`${where}: a and b must be occurrence ids`)
        return { kind: "lock", a: m["a"], b: m["b"], ...(typeof m["id"] === "string" ? { id: m["id"] } : {}) }
      }
      const { kind: _k, a: _a, b: _b, ...rest } = m
      return { ...rest, kind: m["kind"], a: operand("a"), b: operand("b") } as unknown as assembly.Mate
    })
    const checks = new Set(input.checks ?? [])
    const solveOptions: assembly.SolveAssemblyOptions = active !== undefined ? { configuration: active } : {}
    return brep.withBudget(EXACT_ACTION_BUDGET_MS, () => {
      const present = (solution: assembly.AssemblySolution) => ({
        status: solution.status, dof: solution.dof, residual: solution.residual, freedom: solution.freedom, redundantMates: solution.redundantMates,
        ...(solution.conflictSet.length > 0 ? { conflictSet: solution.conflictSet, minimalConflict: solution.minimal } : {}),
        joints: solution.joints.map((j) => ({ ...j, ...(j.angle !== undefined ? { angle: round(j.angle, 4) } : {}), ...(j.slide !== undefined ? { slide: round(j.slide, 4) } : {}) }))
      })
      const placements = (solution: assembly.AssemblySolution): Rec =>
        Object.fromEntries([...solution.transforms].map(([path, t]) => [path, { t: [round(t.t.x, 4), round(t.t.y, 4), round(t.t.z, 4)], m: t.m.map((v) => round(v, 6)) }]))
      const interference = (placed: assembly.Assembly) => {
        const r = assembly.interferenceOf(placed, { ...(active !== undefined ? { configuration: active } : {}) })
        return {
          clashes: r.interferences.map((i) => ({ a: i.a, b: i.b, volumeMm3: round(i.volume, 4), kind: i.kind })), touching: r.touching.length,
          ...(r.undetermined.length > 0 ? { undetermined: r.undetermined } : {}), pairsChecked: r.checked
        }
      }
      if (input.drive !== undefined) {
        const d = input.drive
        const values = Array.from({ length: d.steps }, (_, k) => d.from + ((d.to - d.from) * k) / (d.steps - 1))
        const frames = assembly.sweepJoint(model, mates, d.joint, values, solveOptions)
        const wantClash = checks.has("interference")
        if (wantClash && frames.length > 60) return fail("assembly", "interference during a drive is limited to 60 steps.")
        let firstClash: Rec | undefined
        const out = frames.map(({ value, solution }) => {
          let clashes: number | undefined
          if (wantClash && solution.residual <= 1e-6) {
            const found = interference(placedModel(solution.transforms)).clashes
            clashes = found.length
            if (found.length > 0 && firstClash === undefined) firstClash = { value: round(value, 4), clashes: found }
          }
          return { value: round(value, 4), status: solution.status, residual: solution.residual, joints: solution.joints.map((j) => ({ id: j.id, ...(j.angle !== undefined ? { angle: round(j.angle, 4) } : {}), ...(j.slide !== undefined ? { slide: round(j.slide, 4) } : {}), ...(j.violation !== undefined ? { violation: j.violation } : {}) })), ...(clashes !== undefined ? { clashes } : {}) }
        })
        const last = frames[frames.length - 1]!.solution
        const stopped = frames.length < values.length
        return {
          ok: !stopped && last.residual <= 1e-6, op: "assembly" as const, status: last.status, frames: out, ...(firstClash !== undefined ? { firstClash } : {}),
          ...(stopped ? { error: `The drive stopped at step ${frames.length} of ${values.length}: the mates cannot be satisfied there.` } : {}), placements: placements(last)
        }
      }
      const solution = assembly.solveAssembly(model, mates, solveOptions)
      const placed = placedModel(solution.transforms)
      const solved = solution.status !== "conflicting" && solution.status !== "failed"
      return {
        ok: solved, op: "assembly" as const, ...(active !== undefined ? { configuration: active } : {}), ...(configurations.length > 0 ? { configurations: configurations.map((c) => c.name) } : {}), leaves: [...ids], ...present(solution), ...(solution.message !== undefined ? { error: solution.message } : {}), placements: placements(solution),
        ...(solved && checks.has("interference") ? { interference: interference(placed) } : {}),
        ...(solved && checks.has("mass") ? { mass: (() => { const m = assembly.assemblyMass(placed, active); return { volumeMm3: round(m.volume, 3), massG: round(m.mass, 4), centroid: { x: round(m.centroid.x, 4), y: round(m.centroid.y, 4), z: round(m.centroid.z, 4) }, inertiaGmm2: m.inertia.map((v) => round(v, 3)), unweighted: m.unweighted } })() } : {}),
        ...(solved && checks.has("bom") ? { bom: assembly.bomOf(placed, active).map((r) => ({ item: r.item, name: r.name, quantity: r.quantity, ...(r.designation !== undefined ? { designation: r.designation } : {}), ...(r.mass !== undefined ? { massG: round(r.mass, 4) } : {}) })) } : {}),
        ...(solved && checks.has("clearance") ? { clearance: assembly.clearanceOf(placed, 5, active).slice(0, 30).map((c) => ({ a: c.a, b: c.b, distance: round(c.distance, 4), overlap: c.overlap })) } : {})
      }
    })
  } catch (e) {
    return fail("assembly", e instanceof Error ? e.message : String(e))
  }
}

// ---------------------------------------------------------------- history sources

const historyOf = async (input: CadWorkflowInput, op: CadWorkflowInput["op"], context: ActionContext): Promise<{ readonly history: History } | { readonly error: Rec }> => {
  if ((input.elementId === undefined) === (input.history === undefined)) return { error: fail(op, "Send exactly one of elementId (an existing parametric part) or history.") }
  if (input.history !== undefined) return { history: input.history as unknown as History }
  if (context.handlers.parametric === undefined) return { error: fail(op, "Parametric project tools are unavailable in this host.") }
  const inspected = await context.handlers.parametric(context.projectId, { action: "inspect", elementId: input.elementId! }, context.signal) as Rec | undefined
  context.signal?.throwIfAborted()
  if (inspected === undefined || inspected["ok"] === false) return { error: (inspected as Rec | undefined) ?? fail(op, "The part could not be read.") }
  const decoded = decodeHistory(inspected["history"])
  return decoded.success ? { history: decoded.data } : { error: fail(op, "The part has no readable parametric history.") }
}

// ---------------------------------------------------------------- sheet

const runSheet = async (input: CadWorkflowInput, context: ActionContext) => {
  const got = await historyOf(input, "sheet", context)
  if ("error" in got) return got.error
  const format = input.format ?? "pdf"
  if (format !== "pdf" && format !== "svg") return fail("sheet", "sheet writes pdf or svg.")
  try {
    const sheet = await runKernelJob("cad-sheet", { history: got.history, options: (input.options ?? {}) as drawing.SheetOptions }, { signal: context.signal })
    const common = {
      ok: true, op: "sheet" as const, format, size: sheet.size, scale: sheet.scale, edgeSource: sheet.edgeSource, views: sheet.views.map((v) => ({ name: v.name, label: v.label, scale: v.scale, kind: v.kind })),
      dimensions: sheet.dimensions.slice(0, 60).map((d) => ({ view: d.view, kind: d.kind, text: d.text, ...(d.value !== undefined ? { value: d.value } : {}) })), callouts: sheet.callouts, warnings: sheet.warnings
    }
    if (format === "svg") {
      const fits = sheet.svg.length <= MAX_INLINE_BYTES
      return { ...common, bytes: sheet.svg.length, ...(fits ? { svg: sheet.svg } : { truncated: true }) }
    }
    const pdf = drawing.sheetToPdf(sheet, { title: typeof input.options?.["title"] === "string" ? input.options["title"] : "Drawing" })
    const fits = pdf.bytes.length <= MAX_INLINE_BYTES
    return { ...common, vector: true, bytes: pdf.bytes.length, pages: pdf.pages, drawn: pdf.drawn, substitutedCharacters: pdf.substituted, ...(fits ? { data: base64(pdf.bytes), mime: "application/pdf" } : { truncated: true }) }
  } catch (cause) {
    return fail("sheet", cause instanceof KernelJobError && cause.explained ? cause.message : cause instanceof Error ? cause.message : "The sheet could not be generated.")
  }
}

// ---------------------------------------------------------------- mesh

const bboxOf = (m: exchange.MeshData) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k]!, m.positions[i]!); hi[k] = Math.max(hi[k]!, m.positions[i]!) }
  return { min: lo.map((v) => round(v, 4)), max: hi.map((v) => round(v, 4)) }
}

const runMeshImport = (input: CadWorkflowInput, context: ActionContext) => {
  let bytes: Uint8Array
  if (input.data !== undefined) bytes = new Uint8Array(Buffer.from(input.data, "base64"))
  else if (input.attachment !== undefined) {
    const text = getAttachment(context.projectId, input.attachment)
    if (text === undefined) {
      const names = attachmentNames(context.projectId)
      return fail("mesh_import", `No attached file called "${input.attachment}".${names.length > 0 ? ` Attached: ${names.join(", ")}.` : " Nothing is attached."} Binary files (3MF, binary STL) must be sent as data (base64).`)
    }
    bytes = new TextEncoder().encode(text)
  } else return fail("mesh_import", "Give the file as attachment (a text file: OBJ, ASCII STL) or as data (base64 bytes).")
  const format = input.format === "stl" || input.format === "obj" || input.format === "3mf" ? input.format : undefined
  const result = exchange.importMesh(bytes, {
    ...(format !== undefined ? { format } : {}), ...(input.unit !== undefined ? { unit: input.unit } : {}), ...(input.requireSolid === true ? { requireSolid: true } : {}),
    ...(input.repair?.tolerance !== undefined ? { tolerance: input.repair.tolerance } : {}), ...(input.repair?.maxHoleEdges !== undefined ? { maxHoleEdges: input.repair.maxHoleEdges } : {}),
    ...(input.repair?.maxHoleDiameter !== undefined ? { maxHoleDiameter: input.repair.maxHoleDiameter } : {}), ...(input.repair?.orient !== undefined ? { orient: input.repair.orient } : {})
  })
  if (!result.ok) return fail("mesh_import", result.error, { ...(result.format !== undefined ? { format: result.format } : {}), defects: result.defects })
  return {
    ok: true, op: "mesh_import" as const, format: result.format, stored: false, unitsMm: true,
    meshes: result.meshes.map((m) => ({
      name: m.name, solid: m.solid, vertices: m.mesh.positions.length / 3, triangles: m.mesh.indices.length / 3, volumeMm3: round(m.report.after.volume, 4), areaMm2: round(m.report.after.area, 4),
      bounds: bboxOf(m.mesh), shells: m.report.after.shells, ...(m.report.after.genus !== undefined ? { throughHoles: m.report.after.genus } : {}), repaired: m.report.defects, remaining: m.report.remaining
    })),
    warnings: result.meshes.some((m) => !m.solid) ? ["At least one mesh is not a closed manifold: it cannot be machined or printed as a solid until the remaining defects are fixed."] : []
  }
}

const runMeshExport = async (input: CadWorkflowInput, context: ActionContext) => {
  const got = await historyOf(input, "mesh_export", context)
  if ("error" in got) return got.error
  const format = input.format ?? "3mf"
  if (format !== "stl" && format !== "obj" && format !== "3mf") return fail("mesh_export", "mesh_export writes stl, obj or 3mf.")
  try {
    return brep.withBudget(EXACT_ACTION_BUDGET_MS, () => {
      const exact = rebuildExact(got.history)
      const bodies = exact.bodies.filter((b) => b.brep !== undefined).map((b) => ({ name: b.id, brep: b.brep! }))
      const missing = exact.bodies.filter((b) => b.brep === undefined).map((b) => b.id)
      if (bodies.length === 0) return fail("mesh_export", "No body of the part has an exact model to export.", { reasons: missing })
      const meshes = bodies.map((b) => ({ name: b.name, mesh: closedMesh(b.brep).mesh }))
      let bytes: Uint8Array
      if (format === "3mf") bytes = exchange.write3mf(meshes, { unit: input.unit ?? "millimeter" })
      else if (format === "obj") bytes = new TextEncoder().encode(exchange.writeObj(meshes))
      else {
        const positions: number[] = [], indices: number[] = []
        for (const { mesh } of meshes) { const base = positions.length / 3; positions.push(...mesh.positions); for (const i of mesh.indices) indices.push(i + base) }
        bytes = exchange.writeStl({ positions: Float64Array.from(positions), indices: Uint32Array.from(indices) }, bodies.length === 1 ? bodies[0]!.name : "bodies")
      }
      const stats = meshes.map(({ name, mesh }) => { const t = meshTopology(mesh); return { name, triangles: t.triangles, solid: t.solid, volumeMm3: round(t.volume, 3) } })
      return {
        ok: true, op: "mesh_export" as const, format, ...(format === "3mf" ? { unit: input.unit ?? "millimeter" } : { unit: "millimeter" }), bodies: stats, bytes: bytes.length,
        ...(bytes.length <= MAX_INLINE_BYTES ? { data: base64(bytes) } : { truncated: true }), ...(missing.length > 0 ? { warnings: [`Bodies without an exact model were left out: ${missing.join(", ")}.`] } : {})
      }
    })
  } catch (cause) {
    return fail("mesh_export", cause instanceof Error ? cause.message : String(cause))
  }
}

export const runCadWorkflow = async (input: CadWorkflowInput, context: ActionContext): Promise<unknown> => {
  switch (input.op) {
    case "sketch": return runSketch(input)
    case "assembly": return runAssembly(input)
    case "sheet": return runSheet(input, context)
    case "mesh_import": return runMeshImport(input, context)
    case "mesh_export": return runMeshExport(input, context)
  }
}
