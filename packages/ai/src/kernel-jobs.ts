/**
 * The pure kernel work a job may run (AI-11 Step 10): the same functions inline and in the worker, so the two paths cannot
 * drift. Inputs and outputs are plain data (structured-clone safe); histories are decoded here, at the job's own boundary.
 */
import { acceptPart, type AcceptanceCheck, type AcceptanceReport } from "./acceptance.ts"
import { parametricReport, parseHistory } from "./parametric.ts"

export interface KernelJobs {
  readonly acceptance: { readonly input: { readonly history: unknown; readonly checks: ReadonlyArray<AcceptanceCheck>; readonly budgetMs?: number }; readonly output: AcceptanceReport }
  readonly "parametric-report": { readonly input: { readonly history: unknown }; readonly output: ReturnType<typeof parametricReport> }
}

export type KernelJobName = keyof KernelJobs

export const KERNEL_JOBS: { readonly [K in KernelJobName]: (input: KernelJobs[K]["input"]) => KernelJobs[K]["output"] } = {
  acceptance: (input) => acceptPart(parseHistory(input.history), input.checks, input.budgetMs === undefined ? {} : { budgetMs: input.budgetMs }),
  "parametric-report": (input) => parametricReport(parseHistory(input.history))
}
