/** Validated boundary for the existing feature-history engine; no second modeller. */
import { ParametricDimension, ParametricHistory, ParametricParameters } from "@cadcamfun/api"
import { brep, cam, cleanMesh, describeTopology, dimensionValue, exactSummary, flatPatternDxf, meshTopology, rebuild, rebuildExact, meshVolume, type History } from "@cadcamfun/core"
import { schemaDecoder } from "./tool-validation.ts"

/** The history schema is declared once in Effect (`ParametricHistory` in `@cadcamfun/api`); these are its decoders. */
export { ParametricDimension as dimensionSchema, ParametricHistory as historySchema, ParametricParameters as parameterSchema }

/** A stored or sent history, decoded and checked; `problems` names each refused field. */
export const decodeHistory = schemaDecoder(ParametricHistory) as (value: unknown) =>
  { readonly success: true; readonly data: History } | { readonly success: false; readonly problems: ReadonlyArray<string> }

/** The decoded history; throws an `Error` naming the problems. For values already validated at the boundary. */
export const parseHistory = (value: unknown): History => {
  const decoded = decodeHistory(value)
  if (!decoded.success) throw new Error(`Invalid parametric history: ${decoded.problems.join("; ")}`)
  return decoded.data
}

/**
 * A history to start an import from: like `decodeHistory`, but a history with no feature and no body yet (the empty timeline an
 * imported solid is added to) is accepted too. Its other fields are checked through a throw-away sketch standing in for the missing
 * feature, which is dropped again.
 */
export const decodeStartHistory = (value: unknown): ReturnType<typeof decodeHistory> => {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
  if (record === undefined || !Array.isArray(record["features"]) || record["features"].length > 0 || (Array.isArray(record["bases"]) && record["bases"].length > 0)) return decodeHistory(value)
  const probe = decodeHistory({ ...record, features: [{ id: "start-probe", type: "sketch", plane: "XY", sketch: { entities: [{ id: "p", kind: "point", x: 0, y: 0 }], constraints: [] } }] })
  return probe.success ? { success: true, data: { ...probe.data, features: [] } } : probe
}

/** Time the exact view may add to every validation report (the assistant's hot path, on the sidecar's thread). */
export const REPORT_EXACT_BUDGET_MS = 1_500
/** Time `parametric_exact`, which the assistant asks for on purpose, may take. */
export const EXACT_ACTION_BUDGET_MS = 60_000

/**
 * The exact (B-rep) view of each body, from the same rebuild: exact volume and area, genus, face count and surface kinds, or the
 * reason a body has only its mesh. Never throws; a failure is reported as the body's reason. The exact work stops after
 * `budgetMs` (the bodies then say so), so a heavy history never holds the thread that serves every other tool.
 */
export const exactReport = (history: History, result: ReturnType<typeof rebuild>, budgetMs = REPORT_EXACT_BUDGET_MS) => {
  const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d
  let warnings: ReadonlyArray<string> = []
  try {
    const exact = brep.withBudget(budgetMs, () => {
      const replay = rebuildExact(history, result)
      warnings = [...new Set(replay.warnings)]
      return exactSummary(replay)
    })
    const bodies = exact.map((b) =>
      b.exact
        ? {
            id: b.id, exact: true, valid: b.valid, volumeMm3: round(b.volume!), areaMm2: round(b.area!),
            centroid: { x: round(b.centroid!.x), y: round(b.centroid!.y), z: round(b.centroid!.z) },
            ...(b.genus === undefined ? {} : { throughHoles: b.genus }), faces: b.faces, edges: b.edges, surfaces: b.surfaces
          }
        : { id: b.id, exact: false, reason: b.reason }
    )
    return { bodies, warnings }
  } catch (error) {
    return { bodies: result.bodies.map((b) => ({ id: b.id, exact: false, reason: `exact model failed: ${error instanceof Error ? error.message : String(error)}` })), warnings }
  }
}

const computeParametricReport = (history: History) => {
  const result = rebuild(history)
  let volume = 0
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const body of result.bodies) {
    volume += Math.abs(meshVolume(body.mesh))
    const p = body.mesh.positions
    for (let i = 0; i < p.length; i += 3) for (const [axis, offset] of [["x", 0], ["y", 1], ["z", 2]] as const) {
      min[axis] = Math.min(min[axis], p[i + offset]!); max[axis] = Math.max(max[axis], p[i + offset]!)
    }
  }
  const finite = Number.isFinite(volume) && (result.bodies.length === 0 || Object.values({ ...min, maxX: max.x, maxY: max.y, maxZ: max.z }).every(Number.isFinite))
  const exact = exactReport(history, result)
  return {
    exact: exact.bodies,
    warnings: exact.warnings,
    ok: finite && result.bodies.length > 0 && volume > 0 && !result.issues.some((i) => i.severity === "error"),
    parameters: result.parameters, bodyCount: result.bodies.length, volumeMm3: finite ? volume : null,
    bounds: result.bodies.length > 0 && finite ? { min, max } : null,
    issues: result.issues.slice(0, 40), omittedIssues: Math.max(0, result.issues.length - 40),
    flatPatterns: Object.fromEntries(Object.entries(result.flatPatterns).map(([id, d]) => [id, { straightMm: d.straight, bends: d.bends.length, lengthMm: d.length }])),
    flatPatternDxf: Object.fromEntries(history.features.flatMap((f) => {
      if (f.type !== "sheet") return []
      const developed = result.flatPatterns[f.id]
      if (developed === undefined) return []
      try { return [[f.id, flatPatternDxf(developed, dimensionValue(f.width, result.parameters), f.id)] as const] } catch { return [] }
    })),
    sketches: Object.entries(result.sketches).map(([id, s]) => ({ id, status: s.solve.status, degreesOfFreedom: s.solve.dof, residual: s.solve.residual })),
    // The features that are kept but not built (spec 58), so the assistant knows what the person left out; absent when all are built.
    ...(() => {
      const left = Object.entries(result.states).filter(([, state]) => state.state !== "ok" && state.state !== "failed")
      return left.length === 0 && history.rollback === undefined ? {} : {
        timeline: {
          ...(history.rollback !== undefined ? { rollback: history.rollback } : {}),
          notBuilt: left.map(([id, state]) => ({ id, state: state.state, ...(state.state === "suppressed-by" || state.state === "skipped" ? { by: state.by } : {}) }))
        }
      }
    })(),
    // What each body is as a solid (welded first): closed or with open/non-manifold edges, its shells and through holes (genus), so a
    // defect the CAM or an STL export would trip on is reported, and the hole count can be checked against what was asked.
    solids: result.bodies.map((b) => {
      const t = meshTopology(cleanMesh(b.mesh, { mergeCoplanar: false }))
      return { id: b.id, closedSolid: t.solid, shells: t.shells, throughHoles: t.genus ?? null, triangles: t.triangles, summary: describeTopology(t) }
    })
  }
}

const reports = new Map<string, ReturnType<typeof computeParametricReport>>()

/** Validate/create/inspect cross the same geometry interface; unchanged histories reuse all checks, never partial evidence. */
export const parametricReport = (history: History): ReturnType<typeof computeParametricReport> => {
  let key: string
  try { key = cam.kernel.canonicalJson(history) } catch { return computeParametricReport(history) }
  let report = reports.get(key)
  if (report === undefined) {
    report = computeParametricReport(history)
    if (reports.size >= 16) {
      const oldest = reports.keys().next().value
      if (oldest !== undefined) reports.delete(oldest)
    }
  } else reports.delete(key)
  reports.set(key, report)
  // Reports contain only summaries. No caller can alter another invocation's cached evidence.
  return structuredClone(report)
}
