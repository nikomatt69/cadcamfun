/**
 * The turning job of the kernel (spec 69 I1): a bar, a finished profile and the operations (facing, OD/ID roughing and finishing with
 * nose-radius compensation, grooving, threading, parting) become NC for a lathe post, replayed on a turned stock, with the same claims
 * and release levels as a milling job. The milling `runJob` keeps refusing a lathe; the turning job is its own entry because its stock is a
 * solid of revolution (diameter X, axial Z), not a height field.
 *
 * What the replay proves: the stock removed equals the closed-form volume of the profile within the raster bound, no part material is
 * cut (gouge), no rapid runs into material, and the NC was readable by the independent interpreter. A concave corner keeps the nose-radius
 * residue by construction; it is reported as `leftVolume`, not hidden.
 */
import { emitLathe, type LatheDialect } from "../turning/post.ts"
import { planLathe, type LatheJob, type LathePlan } from "../turning/plan.ts"
import { verifyLathe, type LatheVerification } from "../turning/verify.ts"
import type { CamIssue, CamResult, Claim, ReleaseLevel } from "./contracts.ts"
import { digestOf, sha256 } from "./identity.ts"

export interface TurningJobRequest {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly lathe: LatheJob
  /** The lathe control the NC is written for. Default `fanuc`. */
  readonly dialect?: LatheDialect
  /** Write canned cycles (`G71 G70 G75 G76`) where the plan has them. Default true on Fanuc. */
  readonly cycles?: boolean
  /** Replay raster cell, mm. Default 0.05. */
  readonly cell?: number
}

export interface TurningArtifact {
  readonly schemaVersion: 1
  readonly jobId: string
  readonly dialect: LatheDialect
  readonly nc: string
  readonly plan: LathePlan
  readonly verification: LatheVerification
  /** Canned cycles written, and operations that fell back to explicit moves with the reason. */
  readonly cycles: ReadonlyArray<string>
  readonly explicit: ReadonlyArray<{ readonly operation: string; readonly reason: string }>
  readonly claims: ReadonlyArray<Claim>
  readonly issues: ReadonlyArray<CamIssue>
  readonly release: ReleaseLevel
  readonly identity: { readonly job: string; readonly nc: string }
}

const issue = (tag: CamIssue["tag"], stage: CamIssue["stage"], message: string, severity: CamIssue["severity"] = "error"): CamIssue => ({ tag, severity, stage, message })

export const runTurningJob = (req: TurningJobRequest): CamResult<TurningArtifact> => {
  const dialect = req.dialect ?? "fanuc"
  let plan: LathePlan
  try {
    plan = planLathe(req.lathe)
  } catch (error) {
    return { status: "failed", issues: [issue("InvalidInput", "prepare", error instanceof Error ? error.message : String(error))] }
  }
  const issues: CamIssue[] = [
    ...plan.issues.map((m) => issue("GenerationFailed", "plan", m)),
    ...plan.warnings.map((m) => issue("GenerationFailed", "plan", m, "warning"))
  ]
  if (plan.operations.length === 0) {
    return { status: "failed", issues: issues.length > 0 ? issues : [issue("EmptyToolpath", "plan", "The turning plan has no operation")] }
  }
  const written = emitLathe(plan, { dialect, ...(req.cycles !== undefined ? { cycles: req.cycles } : {}), name: req.name })
  const v = verifyLathe(plan, written.nc, req.cell !== undefined ? { cell: req.cell } : {})
  const claims: Claim[] = [
    { id: "operations-complete", status: plan.issues.length === 0 ? "passed" : "failed", detail: plan.issues.length === 0 ? `${plan.operations.length} operations planned` : plan.issues.join("; ") },
    { id: "nc-replay", status: v.ok && v.errors.length === 0 ? "passed" : "failed", detail: v.errors.length === 0 ? "The independent interpreter replayed every block" : v.errors.slice(0, 3).join("; ") },
    { id: "no-gouge", status: v.gougeVolume <= v.volumeBound ? "passed" : "failed", detail: `${v.gougeVolume.toFixed(1)} mm³ of part material cut; the raster bound is ${v.volumeBound.toFixed(1)} mm³` },
    { id: "no-rapid-in-stock", status: v.rapidCollisions === 0 ? "passed" : "failed", detail: v.rapidCollisions === 0 ? "No rapid runs into material" : `${v.rapidCollisions} rapid moves run into material (NC lines ${v.collisionLines.slice(0, 5).join(", ")})` },
    {
      id: "material-removed", status: Math.abs(v.removedVolume - v.expectedRemoved) <= v.volumeBound ? "passed" : "failed",
      detail: `${v.removedVolume.toFixed(0)} mm³ removed against ${v.expectedRemoved.toFixed(0)} mm³ from the profile (bound ${v.volumeBound.toFixed(1)}); ${v.leftVolume.toFixed(1)} mm³ of nose-radius residue and unreached corners remain`
    }
  ]
  const blocked = issues.some((i) => i.severity === "error") || written.nc === ""
  const release: ReleaseLevel = blocked ? "blocked" : claims.every((c) => c.status === "passed") ? "verified-program" : "preview"
  return {
    status: "ok",
    value: {
      schemaVersion: 1, jobId: req.id, dialect, nc: written.nc, plan, verification: v, cycles: written.cycles, explicit: written.explicit, claims, issues, release,
      identity: { job: digestOf("cam-kernel/turning-job@1", req), nc: sha256(written.nc) }
    }
  }
}
