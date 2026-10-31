/**
 * A manufacturing job with several setups (spec 69 C1, C5): one part, one machine, one material, and a list of setups, each with its
 * own orientation (the CAD direction facing the spindle), work offset, fixtures, stock and operations. Every setup is run by the
 * kernel as its own job (its own NC, its own claims); this module only adds what no single setup can say:
 *
 *   work offsets   every setup gets its own (G54, G55, ...) unless it names one; two setups on the same offset are refused
 *   coverage       `part-coverage` of the whole job: the part's surface area that FACES the spindle (or stands vertical) in at least one
 *                  setup, against the area that faces away in all of them. Facing is a necessary condition, not a proof of reach:
 *                  occlusion and undercuts are decided by each setup's own replay (and its `part-coverage` text), never here
 *   release        the job is `verified-program` only when every setup is and the coverage is complete; a blocked setup blocks the job
 *
 * Not modelled (stated in `notes`, never implied): the stock of a later setup is the raw stock again, not what the earlier setup left;
 * the machining of one setup is not subtracted from the next one's removal figures.
 */
import { applyPoint } from "../../cad/brep/math.ts"
import type { WorkOffset } from "../ir.ts"
import { setupTransform, type SetupOrientation } from "../setup.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import { partMeshes } from "../model/model.ts"
import type { CadElement } from "../generator/schema.ts"
import type { CamArtifact, CamIssue, CamResult, Claim, FixtureBody, ManufacturingJob, OperationSpec, ReleaseLevel, StockBox, StockModel, WorkOrigin } from "./contracts.ts"
import { runJob, type RunOptions } from "./execute.ts"

/** One setup of a multi-setup job: everything that can differ between the fixings of the same part. */
export interface JobSetup {
  readonly id: string
  readonly name?: string
  /** CAD direction facing the spindle (default `+Z`). */
  readonly orientation?: SetupOrientation
  readonly origin?: WorkOrigin
  readonly workOffset?: WorkOffset
  readonly stock?: StockBox
  readonly stockModel?: StockModel
  readonly fixtures?: ReadonlyArray<FixtureBody>
  /** Operations of this setup in its oriented coordinates; planned from the part when absent. */
  readonly operations?: ReadonlyArray<OperationSpec>
}

export interface MultiSetupJob extends Omit<ManufacturingJob, "setupOrientation" | "origin" | "workOffset" | "stock" | "stockModel" | "fixtures" | "operations"> {
  readonly setups: ReadonlyArray<JobSetup>
}

export interface SetupRun {
  readonly id: string
  readonly orientation: SetupOrientation
  readonly workOffset: WorkOffset
  readonly artifact: CamArtifact
}

export interface Coverage {
  /** Part surface area, mm². */
  readonly total: number
  /** Area that faces the spindle (or stands vertical) in at least one setup. */
  readonly covered: number
  readonly uncovered: number
  /** The first setup that sees each part of the surface, by setup id: area per setup. */
  readonly bySetup: Readonly<Record<string, number>>
}

export interface SetupsArtifact {
  readonly jobId: string
  readonly setups: ReadonlyArray<SetupRun>
  /** All claims of all setups (id prefixed with the setup, `setup-1/no-gouge`), minus the per-setup part-coverage, plus the job's own. */
  readonly claims: ReadonlyArray<Claim & { readonly setup?: string }>
  readonly coverage: Coverage
  readonly release: ReleaseLevel
  readonly issues: ReadonlyArray<CamIssue>
  readonly notes: ReadonlyArray<string>
  readonly cycleTimeSeconds: number
}

const WORK_OFFSETS: ReadonlyArray<WorkOffset> = ["G54", "G55", "G56", "G57", "G58", "G59"]

/** Facing the spindle: a triangle whose normal, in the setup's frame, points up or stands vertical (|nz| below the tolerance). */
const VERTICAL = 1e-3

/**
 * Part surface area that some setup faces, by first setup, over the triangles of `meshes` (CAD world coordinates). A triangle of zero
 * area is ignored. Exact in the area sums; the "faces the spindle" test is the normal's sign in each setup's frame.
 */
export const coverageOf = (meshes: ReadonlyArray<Mesh64>, setups: ReadonlyArray<{ readonly id: string; readonly orientation: SetupOrientation }>): Coverage => {
  const frames = setups.map((s) => setupTransform(s.orientation))
  const by: Record<string, number> = Object.fromEntries(setups.map((s) => [s.id, 0]))
  let total = 0, covered = 0
  for (const m of meshes) {
    const P = m.positions, I = m.indices
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = I[f]! * 3, b = I[f + 1]! * 3, c = I[f + 2]! * 3
      const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-18) continue
      const area = len / 2
      total += area
      for (let k = 0; k < setups.length; k++) {
        const n = applyPoint(frames[k]!, { x: nx / len, y: ny / len, z: nz / len })
        if (n.z > -VERTICAL) { by[setups[k]!.id] = by[setups[k]!.id]! + area; covered += area; break }
      }
    }
  }
  return { total, covered, uncovered: total - covered, bySetup: by }
}

const failed = (message: string, tag: CamIssue["tag"] = "InvalidInput"): CamResult<never> =>
  ({ status: "failed", issues: [{ tag, severity: "error", stage: "prepare", message }] })

const rank: Readonly<Record<ReleaseLevel, number>> = { blocked: 0, preview: 1, "verified-program": 2 }

/** Runs every setup and states what the whole job guarantees. See the module note. */
export const runSetups = (job: MultiSetupJob, options: RunOptions = {}): CamResult<SetupsArtifact> => {
  if (job.setups.length === 0) return failed("A multi-setup job needs at least one setup")
  const ids = new Set<string>()
  for (const s of job.setups) {
    if (ids.has(s.id)) return failed(`Duplicate setup id '${s.id}'`)
    ids.add(s.id)
  }
  const offsets: WorkOffset[] = []
  const used = new Set<WorkOffset>(job.setups.flatMap((s) => (s.workOffset !== undefined ? [s.workOffset] : [])))
  const named = job.setups.filter((s) => s.workOffset !== undefined).map((s) => s.workOffset!)
  if (new Set(named).size !== named.length) return failed("Two setups name the same work offset: each fixing needs its own datum")
  for (const s of job.setups) {
    if (s.workOffset !== undefined) { offsets.push(s.workOffset); continue }
    const free = WORK_OFFSETS.find((w) => !used.has(w))
    if (free === undefined) return failed(`More than ${WORK_OFFSETS.length} setups: the control has no further work offset`)
    used.add(free)
    offsets.push(free)
  }
  const runs: SetupRun[] = []
  const issues: CamIssue[] = []
  const { setups: _setups, ...base } = job
  for (let k = 0; k < job.setups.length; k++) {
    const s = job.setups[k]!
    const orientation = s.orientation ?? "+Z"
    const one: ManufacturingJob = {
      ...base, id: `${job.id}/${s.id}`, name: s.name ?? `${job.name} - ${s.id}`, setupOrientation: orientation, workOffset: offsets[k]!,
      ...(s.origin !== undefined ? { origin: s.origin } : {}), ...(s.stock !== undefined ? { stock: s.stock } : {}), ...(s.stockModel !== undefined ? { stockModel: s.stockModel } : {}),
      ...(s.fixtures !== undefined ? { fixtures: s.fixtures } : {}), ...(s.operations !== undefined ? { operations: s.operations } : {})
    }
    const r = runJob(one, options)
    if (r.status === "failed") return { status: "failed", issues: r.issues.map((i) => ({ ...i, message: `Setup ${s.id}: ${i.message}` })) }
    runs.push({ id: s.id, orientation, workOffset: offsets[k]!, artifact: r.value })
    issues.push(...r.value.issues.map((i) => ({ ...i, message: `Setup ${s.id}: ${i.message}` })))
  }

  // The part in CAD world coordinates, for the coverage.
  let meshes: Mesh64[] = []
  if (job.part.kind === "elements") {
    const built = partMeshes((job.part.elements as ReadonlyArray<CadElement>).filter((e) => e["type"] !== "workpiece") as never, { tolerance: job.quality?.tolerance ?? 0.01 })
    if (built !== undefined) meshes = [...built.meshes]
  } else meshes = job.part.meshes.map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
  const coverage = coverageOf(meshes, runs.map((r) => ({ id: r.id, orientation: r.orientation })))
  const complete = coverage.total > 0 && coverage.uncovered <= coverage.total * 1e-6
  const pct = (x: number): string => `${((100 * x) / Math.max(coverage.total, 1e-12)).toFixed(1)} %`

  const claims: Array<Claim & { setup?: string }> = []
  for (const r of runs) for (const c of r.artifact.claims) if (c.id !== "part-coverage") claims.push({ ...c, setup: r.id })
  // A setup's own part-coverage that reports skipped five-axis samples is a finding about reach, not about the other fixings: keep it.
  for (const r of runs) for (const c of r.artifact.claims) if (c.id === "part-coverage" && /required multiaxis contact samples/.test(c.detail)) claims.push({ ...c, setup: r.id })
  claims.push({
    id: "part-coverage", status: complete ? "passed" : "unresolved",
    detail: complete
      ? `Every part of the surface faces the spindle, or stands vertical, in at least one of ${runs.length} setups (${runs.map((r) => `${r.id}: ${pct(coverage.bySetup[r.id]!)}`).join(", ")}); occlusion and undercuts are decided by each setup's own replay, not by this facing test`
      : `${coverage.uncovered.toFixed(1)} mm² (${pct(coverage.uncovered)}) of the part surface faces away from the spindle in every setup (${runs.map((r) => r.orientation).join(", ")}): add a setup that sees it, or a rotary process`
  })
  const own = runs.reduce<ReleaseLevel>((low, r) => (rank[r.artifact.release] < rank[low] ? r.artifact.release : low), "verified-program")
  const release: ReleaseLevel = own === "blocked" ? "blocked" : own === "verified-program" && complete && claims.every((c) => c.status === "passed" || (c.status === "unsupported" && c.id === "machine-travel")) ? "verified-program" : "preview"
  return {
    status: "ok",
    value: {
      jobId: job.id, setups: runs, claims, coverage, release, issues,
      notes: [
        "The stock of every setup is its own raw stock: what an earlier setup removed is not carried into the next one, so the removal figures of the setups are not additive.",
        ...(runs.length > 1 ? [`Work offsets: ${runs.map((r) => `${r.id} ${r.workOffset}`).join(", ")}; each setup is its own program (refixture and touch off between them).`] : [])
      ],
      cycleTimeSeconds: runs.reduce((s, r) => s + r.artifact.cycleTimeSeconds, 0)
    }
  }
}
