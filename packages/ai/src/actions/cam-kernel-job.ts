/**
 * `cam.job`: a multi-setup machining job planned or run in process by the kernel (spec 69 C1-C5, spec 72 0.5). The part is inline,
 * so no project handler is needed; a heavy job should go through `cam manufacture` (the host's worker queue), this action is for the
 * plan-and-verify loop of a job the assistant is composing: setups, fixtures, stock, five-axis operations, then the claims.
 *
 * The answer never hides a verdict: every claim comes back with its status and its detail, the failed ones are listed again with their
 * reason, the tolerance budget is returned term by term (the declared bounds), and a refusal carries the kernel's own issues.
 */
import type { CamJobInput } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import type { ActionContext } from "./action.ts"

type Setup = CamJobInput["setups"][number]

const round = (x: number, d = 3): number => Math.round(x * 10 ** d) / 10 ** d

const issueWire = (i: cam.kernel.CamIssue) => ({
  severity: i.severity, tag: i.tag, stage: i.stage, message: i.message,
  ...(i.operationId !== undefined ? { operationId: i.operationId } : {}), ...(i.line !== undefined ? { line: i.line } : {})
})

/** The kernel's job for the request: records the schema already validated, with the optional fields spread only when present. */
const jobOf = (input: CamJobInput): { readonly job: cam.kernel.MultiSetupJob } | { readonly error: string } => {
  const machine = input.machine === undefined ? undefined : cam.kernel.findMachine(input.machine)
  if (input.machine !== undefined && machine === undefined) return { error: `Unknown machine preset '${input.machine}'. Known: ${cam.kernel.MACHINE_CATALOGUE.map((m) => m.id).join(", ")}` }
  const part: cam.kernel.PartSource = input.part.elements !== undefined
    ? { kind: "elements", elements: input.part.elements }
    : { kind: "meshes", meshes: input.part.meshes! }
  const q = input.quality
  return {
    job: {
      schemaVersion: 1, id: "assistant-job", name: "Assistant job", material: input.material, part,
      ...(machine !== undefined ? { machine } : {}),
      ...(input.tools !== undefined ? { tools: input.tools as unknown as ReadonlyArray<cam.kernel.Cutter> } : {}),
      ...(q !== undefined ? { quality: { ...(q.resolution !== undefined ? { resolution: q.resolution } : {}), ...(q.tolerance !== undefined ? { tolerance: q.tolerance } : {}), ...(q.finishAllowance !== undefined ? { finishAllowance: q.finishAllowance } : {}), ...(q.scallop !== undefined ? { scallop: q.scallop } : {}), ...(q.enforceTolerance !== undefined ? { enforceTolerance: q.enforceTolerance } : {}) } } : {}),
      setups: input.setups.map((s: Setup) => ({
        id: s.id,
        ...(s.name !== undefined ? { name: s.name } : {}), ...(s.orientation !== undefined ? { orientation: s.orientation } : {}), ...(s.origin !== undefined ? { origin: s.origin } : {}),
        ...(s.workOffset !== undefined ? { workOffset: s.workOffset } : {}), ...(s.stock !== undefined ? { stock: s.stock } : {}),
        ...(s.stockModel !== undefined ? { stockModel: s.stockModel as unknown as cam.kernel.StockModel } : {}),
        ...(s.fixtures !== undefined ? { fixtures: s.fixtures } : {}), ...(s.operations !== undefined ? { operations: s.operations as unknown as ReadonlyArray<cam.kernel.OperationSpec> } : {})
      }))
    }
  }
}

export const runCamJob = (input: CamJobInput, context: ActionContext) => {
  const built = jobOf(input)
  if ("error" in built) return { ok: false, op: input.op, error: built.error }
  const { job } = built
  const signal = context.signal
  const options = signal !== undefined ? { signal } : {}

  if (input.op === "plan") {
    const plans = [] as Array<Record<string, unknown>>
    const issues: unknown[] = []
    for (const [k, setup] of job.setups.entries()) {
      const { setups: _s, ...base } = job
      const one: cam.kernel.ManufacturingJob = {
        ...base, id: `${job.id}/${setup.id}`, setupOrientation: setup.orientation ?? "+Z",
        ...(setup.origin !== undefined ? { origin: setup.origin } : {}), ...(setup.stock !== undefined ? { stock: setup.stock } : {}), ...(setup.stockModel !== undefined ? { stockModel: setup.stockModel } : {}),
        ...(setup.operations !== undefined ? { operations: setup.operations } : {})
      }
      const planned = cam.kernel.planOnly(one)
      if (planned.status === "failed") return { ok: false, op: "plan", error: `Setup ${setup.id}: ${planned.issues.map((i) => i.message).join("; ")}`, issues: planned.issues.map(issueWire) }
      plans.push({
        id: setup.id, index: k, orientation: setup.orientation ?? "+Z",
        operations: planned.value.operations.map((o) => ({ id: o.id, strategy: o.strategy, tool: o.tool, ...("mode" in o && o.mode !== undefined ? { mode: o.mode } : {}) })),
        unmachined: planned.value.unmachined, notes: planned.value.notes
      })
    }
    // Coverage of the orientations, from the part alone.
    const meshes = job.part.kind === "meshes"
      ? job.part.meshes.map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
      : [...(cam.model.partMeshes((job.part.elements as ReadonlyArray<Record<string, unknown>>).filter((e) => e["type"] !== "workpiece") as never, { tolerance: 0.01 })?.meshes ?? [])]
    const coverage = cam.kernel.coverageOf(meshes, job.setups.map((s) => ({ id: s.id, orientation: s.orientation ?? "+Z" })))
    return {
      ok: true, op: "plan", setups: plans, issues,
      coverage: { totalMm2: round(coverage.total, 1), uncoveredMm2: round(coverage.uncovered, 1), bySetupMm2: Object.fromEntries(Object.entries(coverage.bySetup).map(([k, v]) => [k, round(v, 1)])) },
      notes: coverage.uncovered > coverage.total * 1e-6 ? [`${round(coverage.uncovered, 1)} mm2 of the part surface faces away from the spindle in every setup: add a setup that sees it`] : ["Every part of the surface faces the spindle, or stands vertical, in at least one setup (occlusion is decided by each setup's replay)."]
    }
  }

  const ran = cam.kernel.runSetups(job, options)
  if (ran.status === "failed") return { ok: false, op: "run", error: ran.issues.map((i) => i.message).join("; "), issues: ran.issues.map(issueWire) }
  const a = ran.value
  const wireClaims = a.claims.map((c) => ({ ...(c.setup !== undefined ? { setup: c.setup } : {}), id: c.id, status: c.status, detail: c.detail }))
  const lines = input.nc ?? 0
  return {
    ok: true, op: "run", release: a.release,
    setups: a.setups.map((r) => {
      const t = r.artifact.tolerance
      return {
        id: r.id, orientation: r.orientation, workOffset: r.workOffset, release: r.artifact.release,
        operations: r.artifact.operations.map((o) => ({ id: o.id, strategy: o.strategy, tool: o.toolId, status: o.status, removedVolumeMm3: o.removedVolume })),
        tools: r.artifact.tools.map((x) => ({ id: x.id, number: x.number, diameter: x.diameter })),
        ncLines: r.artifact.nc === "" ? 0 : r.artifact.nc.split("\n").length, ncHash: r.artifact.identity.nc, cycleTimeSeconds: r.artifact.cycleTimeSeconds,
        stock: { initialMm3: r.artifact.stock.initialVolume, finalMm3: r.artifact.stock.finalVolume, partMm3: r.artifact.stock.partVolume, cellMm: r.artifact.stock.cellSize },
        ...(t !== undefined ? { tolerance: { requestedMm: t.requested, achievedMm: t.achieved, met: t.met, unbounded: t.unbounded, terms: t.terms.map((x) => ({ id: x.id, mm: x.mm, basis: x.basis })) } } : {}),
        ...(lines > 0 ? { nc: r.artifact.nc.split("\n").slice(0, lines).join("\n") } : {})
      }
    }),
    claims: wireClaims,
    // The reasons first: what failed, then what could not be decided, each with the kernel's own detail.
    failed: wireClaims.filter((c) => c.status === "failed"),
    unresolved: wireClaims.filter((c) => c.status === "unresolved"),
    coverage: { totalMm2: round(a.coverage.total, 1), uncoveredMm2: round(a.coverage.uncovered, 1), bySetupMm2: Object.fromEntries(Object.entries(a.coverage.bySetup).map(([k, v]) => [k, round(v, 1)])) },
    notes: a.notes, issues: a.issues.map(issueWire), cycleTimeSeconds: a.cycleTimeSeconds
  }
}
