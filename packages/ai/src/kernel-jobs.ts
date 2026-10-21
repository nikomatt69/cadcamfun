/**
 * The pure kernel work a job may run (AI-11 Step 10): the same functions inline and in the worker, so the two paths cannot
 * drift. Inputs and outputs are plain data (structured-clone safe); histories are decoded here, at the job's own boundary.
 */
import { acceptPart, type AcceptanceCheck, type AcceptanceReport } from "./acceptance.ts"
import { cam } from "@cadcamfun/core"
import { parametricReport, parseHistory } from "./parametric.ts"

export interface KernelJobs {
  readonly acceptance: { readonly input: { readonly history: unknown; readonly checks: ReadonlyArray<AcceptanceCheck>; readonly budgetMs?: number }; readonly output: AcceptanceReport }
  readonly "parametric-report": { readonly input: { readonly history: unknown }; readonly output: ReturnType<typeof parametricReport> }
  /** The CAM kernel on a whole job (spec 29): NC plus evidence; progress is reported before each operation and stage. */
  readonly "cam-manufacture": { readonly input: cam.kernel.ManufacturingJob; readonly output: ReturnType<typeof cam.kernel.runJob> }
  readonly "cam-plan": { readonly input: cam.kernel.ManufacturingJob; readonly output: ReturnType<typeof cam.kernel.planOnly> }
}

/** Progress a job may report while it runs (only the CAM kernel does). */
export type KernelJobProgress = cam.kernel.KernelProgress

export type KernelJobName = keyof KernelJobs

export const KERNEL_JOBS: { readonly [K in KernelJobName]: (input: KernelJobs[K]["input"], report?: (progress: KernelJobProgress) => void) => KernelJobs[K]["output"] } = {
  acceptance: (input) => acceptPart(parseHistory(input.history), input.checks, input.budgetMs === undefined ? {} : { budgetMs: input.budgetMs }),
  "parametric-report": (input) => parametricReport(parseHistory(input.history)),
  "cam-manufacture": (input, report) => cam.kernel.runJob(input, report === undefined ? {} : { onProgress: report }),
  "cam-plan": (input) => cam.kernel.planOnly(input)
}
