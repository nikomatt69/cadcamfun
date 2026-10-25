import { KernelJobError, runKernelJobEffect, type KernelJobName, type KernelJobs } from "@cadcamfun/ai"
import { BadRequest, InternalError } from "@cadcamfun/api"
import { Effect } from "effect"

/**
 * What a failed kernel job is to the caller. A job that passed its deadline, found the queue full, was cancelled or was killed for
 * memory is the request's size or the host's state, not a fault: the caller gets the reason (and, for a size, how to cut it down).
 * Anything else is logged and answered as a server fault, without the worker's internals.
 */
export const explainKernelFailure = (label: string) => (cause: unknown): Effect.Effect<never, BadRequest | InternalError> => {
  if (cause instanceof KernelJobError && cause.explained) {
    const hint = cause.reason === "deadline" || cause.reason === "crashed" ? " Reduce the part, the layer height or the stepover, or split the job." : ""
    return Effect.fail(new BadRequest({ message: `${cause.message}${hint}` }))
  }
  return Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label }))))
}

/** A kernel job as the handlers run it: in a worker behind the queue, interrupted with the request, a failure explained to the caller. */
export const kernelRun = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], label: string) =>
  runKernelJobEffect(name, input).pipe(Effect.catch(explainKernelFailure(label)))
