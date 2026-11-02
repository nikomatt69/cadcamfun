/**
 * `cam.lathe`: the lathe plan, its NC and the replay of that NC against the revolved stock. The replay is a raster over the whole bar,
 * seconds on a long part, so the action runs this through the `cam-lathe` kernel job (scoped worker, deadline, cancellation).
 */
import { cam } from "@cadcamfun/core"
import type { Schema } from "effect"
import type { CAM_ACTION_INPUTS } from "@cadcamfun/api"

export type CamLatheInput = Schema.Schema.Type<(typeof CAM_ACTION_INPUTS)["cam.lathe"]>

export const camLathe = (input: CamLatheInput) => {
  const { stock: bar, contour, bore, tools, operations, material, post } = input
  const { faceAllowance, ...stock } = bar
  const plan = cam.turning.planLathe({
    stock: { ...stock }, ...(faceAllowance !== undefined ? { faceAllowance } : {}),
    ...(contour !== undefined ? { contour: contour.map((p) => ({ ...p })) } : {}), ...(bore !== undefined ? { bore: bore.map((p) => ({ ...p })) } : {}),
    tools: tools.map((t) => ({ ...t })), operations: operations.map((o) => ({ ...o })) as never, ...(material !== undefined ? { material } : {})
  })
  if (plan.issues.length > 0) return { ok: false, error: plan.issues.join("; "), issues: plan.issues }
  const dialect = post ?? "fanuc"
  const nc = cam.turning.emitLathe(plan, { dialect })
  const verification = cam.turning.verifyLathe(plan, nc.nc)
  const lines = nc.nc.split("\n")
  return {
    ok: true, post: dialect, release: "preview",
    operations: plan.operations.map((o) => ({ id: o.id, name: o.name, kind: o.kind, tool: o.tool.id, moves: o.moves.length, notes: [...o.notes] })),
    warnings: [...plan.warnings], analytic: plan.analytic, cycles: [...nc.cycles], explicit: nc.explicit.map((e) => ({ ...e })),
    lines: lines.length, preview: lines.slice(0, 80).join("\n"),
    verification: {
      ...verification,
      // The verdict in words: what the replay of the NC against the revolved stock found, bounded by the raster cell.
      verdict: verification.ok && verification.gougeVolume <= verification.volumeBound && verification.leftVolume <= verification.volumeBound ? "matches" : "differs",
      note: "Raster of the revolved stock (cell in mm); volumes are within volumeBound. The insert body behind the nose is swept for turning and boring tools; threads are checked for lead and depth, not removed. Not qualified on a controller."
    }
  }
}
