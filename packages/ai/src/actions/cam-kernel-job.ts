/**
 * `cam.job` (spec 69 C1-C5, spec 72 0.5): the action half. The computation itself is `camJob` (`../cam-job.ts`); it runs in the
 * kernel job queue under the invocation's signal, so cancelling the turn ends the worker and a repeat of the same job is served from
 * the result cache.
 */
import type { CamJobInput } from "@cadcamfun/api"
import { runKernelJob } from "../kernel-job.ts"
import type { ActionContext } from "./action.ts"

export const runCamJob = (input: CamJobInput, context: ActionContext) =>
  runKernelJob("cam-job", input, context.signal !== undefined ? { signal: context.signal } : {})
