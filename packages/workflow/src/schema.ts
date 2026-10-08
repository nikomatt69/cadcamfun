/**
 * Workflow files live in the project repository at `.cadcamfun/workflows/<name>.yml`, versioned with
 * the model they act on. The shape deliberately mirrors GitHub Actions (`on`, `jobs`, `needs`, `steps`,
 * `uses`, `with`) so it is familiar, but `uses` names a CadCamFun step (`cam/verify`, `ai/prompt`…),
 * never a Docker image or a shell: workflows cannot run arbitrary code.
 */
import { Data, Effect, Schema } from "effect"

const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const Id = Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/))

export const StepSchema = Schema.Struct({
  id: Schema.optional(Id),
  name: Schema.optional(Name),
  /** Registered step identifier, e.g. `cam/verify`. */
  uses: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)+$/)),
  with: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  if: Schema.optional(Schema.Literals(["success", "always", "failure"])),
  continueOnError: Schema.optional(Schema.Boolean),
})
export type Step = typeof StepSchema.Type

export const JobSchema = Schema.Struct({
  name: Schema.optional(Name),
  needs: Schema.optional(Schema.Array(Id)),
  steps: Schema.Array(StepSchema).check(Schema.isMinLength(1)),
})
export type Job = typeof JobSchema.Type

const Globs = Schema.optional(Schema.Array(Schema.String))

export const TriggersSchema = Schema.Struct({
  push: Schema.optional(Schema.Struct({ branches: Globs, paths: Globs })),
  /** Run from the UI or the mobile companion on request. */
  manual: Schema.optional(Schema.Unknown),
  /** Run when a merge/pull request into one of `branches` is opened. */
  pullRequest: Schema.optional(Schema.Struct({ branches: Globs })),
})
export type Triggers = typeof TriggersSchema.Type

export const WorkflowSchema = Schema.Struct({
  name: Name,
  on: TriggersSchema,
  jobs: Schema.Record(Id, JobSchema),
})
export type Workflow = typeof WorkflowSchema.Type

export class WorkflowError extends Data.TaggedError("WorkflowError")<{
  readonly code: "yaml" | "schema" | "needs" | "cycle" | "duplicate-step-id"
  readonly message: string
}> {}

/** Parses and validates a workflow file; also rejects unknown `needs`, cycles and duplicate step ids. */
export const parseWorkflow = (source: string): Effect.Effect<Workflow, WorkflowError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => Bun.YAML.parse(source) as unknown,
      catch: (e) => new WorkflowError({ code: "yaml", message: `Invalid YAML: ${String(e)}` }),
    })
    const workflow = yield* Schema.decodeUnknownEffect(WorkflowSchema)(raw).pipe(
      Effect.mapError((e) => new WorkflowError({ code: "schema", message: String(e) })),
    )
    yield* validateGraph(workflow)
    return workflow
  })

const validateGraph = (w: Workflow): Effect.Effect<void, WorkflowError> =>
  Effect.gen(function* () {
    const names = new Set(Object.keys(w.jobs))
    for (const [jobId, job] of Object.entries(w.jobs)) {
      for (const need of job.needs ?? []) {
        if (!names.has(need)) return yield* new WorkflowError({ code: "needs", message: `Job ${jobId} needs unknown job ${need}` })
      }
    }
    const ids = Object.values(w.jobs).flatMap((j) => j.steps.flatMap((s) => (s.id ? [s.id] : [])))
    if (new Set(ids).size !== ids.length) return yield* new WorkflowError({ code: "duplicate-step-id", message: "Step ids must be unique across the workflow" })
    // Kahn's algorithm: anything left over is part of a cycle.
    yield* Effect.try({
      try: () => void jobLevels(w),
      catch: (e) => new WorkflowError({ code: "cycle", message: (e as Error).message }),
    })
  })

/** Groups jobs into dependency levels; jobs in one level are independent. Throws on cycles. */
export const jobLevels = (w: Workflow): string[][] => {
  const remaining = new Map(Object.entries(w.jobs).map(([id, j]) => [id, new Set(j.needs ?? [])]))
  const levels: string[][] = []
  while (remaining.size > 0) {
    const ready = [...remaining].filter(([, deps]) => deps.size === 0).map(([id]) => id)
    if (ready.length === 0) throw new Error(`Workflow jobs form a cycle: ${[...remaining.keys()].join(", ")}`)
    levels.push(ready)
    for (const id of ready) remaining.delete(id)
    for (const deps of remaining.values()) for (const id of ready) deps.delete(id)
  }
  return levels
}
