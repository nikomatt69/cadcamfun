import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { filesToSnapshot, Repository, toText } from "@cadcamfun/vcs"
import { matchesTrigger, parseWorkflow, runWorkflow, StepError, type RunEvent, type StepRegistry, type TriggerEvent } from "@cadcamfun/workflow"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { ProjectVcsRepo } from "../repos/project-vcs-repo.ts"

/** What a step sees: the commit being checked, never the live database. */
export interface StepContext {
  readonly projectId: string
  readonly ref: string
  readonly sha: string
  readonly files: Readonly<Record<string, Uint8Array>>
}

const WORKFLOW_DIR = ".cadcamfun/workflows/"

/**
 * Built-in steps. CAM/AI steps (`cam/verify`, `cam/gcode`, `ai/prompt`) register here as their services
 * are exposed to workflows; a workflow naming an unregistered step fails before anything runs.
 */
export const builtinSteps: StepRegistry<StepContext> = {
  /** Every entity file must be valid JSON with an `id` matching its file name and a `name`. */
  "project/validate": ({ ctx }) =>
    Effect.gen(function*() {
      const issues: string[] = []
      for (const [path, bytes] of Object.entries(ctx.files)) {
        if (!path.endsWith(".json")) continue
        const parsed = yield* Effect.try({ try: () => JSON.parse(toText(bytes)) as Record<string, unknown>, catch: () => new StepError({ message: `${path} is not valid JSON` }) })
        const m = /^(drawings|components|toolpaths)\/(.+)\.json$/.exec(path)
        if (m && parsed.id !== m[2]) issues.push(`${path}: id does not match file name`)
        if (m && typeof parsed.name !== "string") issues.push(`${path}: missing name`)
      }
      if (issues.length > 0) return yield* new StepError({ message: issues.join("; ") })
      return { issues: 0, drawings: filesToSnapshot(ctx.files).drawings.length }
    }),
  /** Fails when the commit contains G-code for a toolpath that has none stored, i.e. a stale export. */
  "project/require-gcode": ({ ctx }) =>
    Effect.gen(function*() {
      const missing = filesToSnapshot(ctx.files).toolpaths.filter((t) => !t.gcode).map((t) => t.id)
      if (missing.length > 0) return yield* new StepError({ message: `Toolpaths without G-code: ${missing.join(", ")}` })
      return { toolpaths: filesToSnapshot(ctx.files).toolpaths.length }
    }),
}

export type RunRow = typeof schema.workflowRunTable.$inferSelect

export class WorkflowRunner extends Context.Service<WorkflowRunner, {
  /** Workflow files present in the tree of `ref`. */
  list(projectId: string, ref: string): Effect.Effect<string[]>
  /** Runs every workflow of `ref` that the event triggers; each run is persisted with its streamed events. */
  trigger(projectId: string, ref: string, event: TriggerEvent, onEvent?: (workflow: string, e: RunEvent) => void): Effect.Effect<RunRow[], DatabaseError>
  runs(projectId: string, limit?: number): Effect.Effect<RunRow[], DatabaseError>
}>()("cadcamfun/WorkflowRunner") {
  static readonly layer = (registry: StepRegistry<StepContext> = builtinSteps) =>
    Layer.effect(
      WorkflowRunner,
      Effect.gen(function*() {
        const { query } = yield* Database
        const store = yield* ProjectVcsRepo
        const load = (projectId: string, ref: string) => {
          const repo = new Repository(store.backend(projectId))
          const sha = repo.resolve(ref)
          return { sha, files: repo.readFiles(repo.readCommit(sha).tree) }
        }
        const names = (files: Readonly<Record<string, unknown>>) => Object.keys(files).filter((p) => p.startsWith(WORKFLOW_DIR) && /\.ya?ml$/.test(p)).sort()
        return WorkflowRunner.of({
          list: (projectId, ref) => Effect.sync(() => names(load(projectId, ref).files).map((p) => p.slice(WORKFLOW_DIR.length))).pipe(Effect.orElseSucceed(() => [])),
          trigger: (projectId, ref, event, onEvent) =>
            Effect.gen(function*() {
              const { sha, files } = load(projectId, ref)
              const out: RunRow[] = []
              for (const path of names(files)) {
                const name = path.slice(WORKFLOW_DIR.length)
                const parsed = yield* parseWorkflow(toText(files[path]!)).pipe(Effect.result)
                if (parsed._tag === "Failure") {
                  out.push(yield* query("workflow.run.invalid", (db) => db.insert(schema.workflowRunTable).values({ projectId, workflow: name, event: event.type, ref, sha, status: "failure", events: [{ type: "invalid", message: parsed.failure.message }], finishedAt: new Date() }).returning().get()))
                  continue
                }
                if (!matchesTrigger(parsed.success, event)) continue
                const run = yield* query("workflow.run.start", (db) => db.insert(schema.workflowRunTable).values({ projectId, workflow: name, event: event.type, ref, sha, status: "running" }).returning().get())
                const events: RunEvent[] = []
                const result = yield* runWorkflow(parsed.success, { registry, ctx: { projectId, ref, sha, files }, onEvent: (e) => { events.push(e); onEvent?.(name, e) } }).pipe(Effect.result)
                const status = result._tag === "Success" ? result.success.status : "failure"
                if (result._tag === "Failure") events.push({ type: "step", job: "-", index: 0, uses: "-", status: "failure", message: result.failure.message })
                out.push(yield* query("workflow.run.finish", (db) => db.update(schema.workflowRunTable).set({ status, events, finishedAt: new Date() }).where(eq(schema.workflowRunTable.id, run.id)).returning().get()).pipe(Effect.map((r) => r!)))
              }
              return out
            }),
          runs: (projectId, limit = 50) =>
            query("workflow.runs", (db) => db.select().from(schema.workflowRunTable).where(eq(schema.workflowRunTable.projectId, projectId)).orderBy(desc(schema.workflowRunTable.startedAt)).limit(limit).all()),
        })
      }),
    )
}
