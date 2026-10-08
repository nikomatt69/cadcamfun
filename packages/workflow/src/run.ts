import { Data, Effect, Exit } from "effect"
import { jobLevels, type Step, type Workflow } from "./schema.ts"

export type Outputs = Readonly<Record<string, unknown>>

export class StepError extends Data.TaggedError("StepError")<{ readonly message: string }> {}

export interface StepInput<Ctx> {
  readonly with: Readonly<Record<string, unknown>>
  readonly ctx: Ctx
}

/** Implementation of one `uses:` identifier. Provided by the sidecar (cam/verify, cam/gcode, ai/prompt, vcs/commit…). */
export type StepHandler<Ctx> = (input: StepInput<Ctx>) => Effect.Effect<Outputs | void, StepError>
export type StepRegistry<Ctx> = Readonly<Record<string, StepHandler<Ctx>>>

export type RunStatus = "success" | "failure" | "skipped"

export type RunEvent =
  | { readonly type: "job-start"; readonly job: string }
  | { readonly type: "step"; readonly job: string; readonly index: number; readonly uses: string; readonly status: RunStatus; readonly message?: string; readonly outputs?: Outputs }
  | { readonly type: "job-end"; readonly job: string; readonly status: RunStatus }

export interface RunResult {
  readonly status: "success" | "failure"
  readonly jobs: Readonly<Record<string, RunStatus>>
}

export interface RunOptions<Ctx> {
  readonly registry: StepRegistry<Ctx>
  readonly ctx: Ctx
  /** Streamed to the UI and to the mobile companion while the run progresses. */
  readonly onEvent?: (event: RunEvent) => void
}

const EXPR = /\$\{\{\s*steps\.([A-Za-z][\w-]*)\.outputs\.([\w-]+)\s*\}\}/g

/** Replaces `${{ steps.<id>.outputs.<key> }}` in strings, recursively. A string that is exactly one expression keeps the value's type. */
export const interpolate = (value: unknown, outputs: ReadonlyMap<string, Outputs>): unknown => {
  if (typeof value === "string") {
    const whole = /^\$\{\{\s*steps\.([A-Za-z][\w-]*)\.outputs\.([\w-]+)\s*\}\}$/.exec(value)
    if (whole) return outputs.get(whole[1]!)?.[whole[2]!]
    return value.replace(EXPR, (_, id: string, key: string) => String(outputs.get(id)?.[key] ?? ""))
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, outputs))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, outputs)]))
  return value
}

/** Unknown `uses` fail the workflow before anything runs, so a typo never half-applies a change. */
export const missingSteps = <Ctx>(w: Workflow, registry: StepRegistry<Ctx>): string[] =>
  [...new Set(Object.values(w.jobs).flatMap((j) => j.steps.map((s) => s.uses)))].filter((u) => !(u in registry))

// Step ids are unique per workflow, so outputs are shared run-wide: a job reads what the jobs it `needs` produced.
const runJob = <Ctx>(id: string, steps: readonly Step[], o: RunOptions<Ctx>, outputs: Map<string, Outputs>): Effect.Effect<RunStatus> =>
  Effect.gen(function* () {
    o.onEvent?.({ type: "job-start", job: id })
    let failed = false
    for (const [index, step] of steps.entries()) {
      const mode = step.if ?? "success"
      const skip = mode === "success" ? failed : mode === "failure" ? !failed : false
      if (skip) {
        o.onEvent?.({ type: "step", job: id, index, uses: step.uses, status: "skipped" })
        continue
      }
      const handler = o.registry[step.uses]!
      const exit = yield* Effect.exit(handler({ with: interpolate(step.with ?? {}, outputs) as Record<string, unknown>, ctx: o.ctx }))
      if (Exit.isSuccess(exit)) {
        const out = exit.value ?? {}
        if (step.id) outputs.set(step.id, out)
        o.onEvent?.({ type: "step", job: id, index, uses: step.uses, status: "success", outputs: out })
      } else {
        o.onEvent?.({ type: "step", job: id, index, uses: step.uses, status: "failure", message: String(exit.cause) })
        if (!step.continueOnError) failed = true
      }
    }
    const status: RunStatus = failed ? "failure" : "success"
    o.onEvent?.({ type: "job-end", job: id, status })
    return status
  })

/** Runs jobs level by level (independent jobs concurrently); jobs whose `needs` failed are skipped. */
export const runWorkflow = <Ctx>(w: Workflow, o: RunOptions<Ctx>): Effect.Effect<RunResult, StepError> =>
  Effect.gen(function* () {
    const missing = missingSteps(w, o.registry)
    if (missing.length > 0) return yield* new StepError({ message: `Unknown step(s): ${missing.join(", ")}` })
    const results: Record<string, RunStatus> = {}
    const outputs = new Map<string, Outputs>()
    for (const level of jobLevels(w)) {
      const statuses = yield* Effect.forEach(
        level,
        (id) => {
          const job = w.jobs[id]!
          if ((job.needs ?? []).some((n) => results[n] !== "success")) {
            o.onEvent?.({ type: "job-end", job: id, status: "skipped" })
            return Effect.succeed("skipped" as RunStatus)
          }
          return runJob(id, job.steps, o, outputs)
        },
        { concurrency: "unbounded" },
      )
      level.forEach((id, i) => {
        results[id] = statuses[i]!
      })
    }
    return { status: Object.values(results).every((s) => s === "success") ? "success" : "failure", jobs: results }
  })
