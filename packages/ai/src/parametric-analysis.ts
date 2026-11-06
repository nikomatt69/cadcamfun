/** Promise adapter for native host tools; the shared scoped Effect worker owns expensive report and diagnosis computation. */
import type { History } from "@cadcamfun/core"
import { runKernelJob } from "./kernel-job.ts"
import { verificationOf, type VerificationMaterial } from "./parametric-verification.ts"

/** Validate/create/inspect share one complete content-keyed report, while callers retain independent evidence. */
export const analyzeParametric = async (history: History, signal?: AbortSignal, material?: VerificationMaterial) => {
  const report = structuredClone(await runKernelJob("parametric-report", { history }, { signal }))
  const diagnosis = report.ok ? undefined : structuredClone(await runKernelJob("parametric-diagnosis", { history, report }, { signal }))
  return { verification: verificationOf(history, report, material), ...(diagnosis !== undefined ? { diagnosis } : {}), ...report }
}
