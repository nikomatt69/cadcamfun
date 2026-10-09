import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { Repository, toText } from "@cadcamfun/vcs"
import { matchesTrigger, parseWorkflow, runWorkflow, type RunEvent, type StepRegistry, type TriggerEvent } from "@cadcamfun/workflow"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Ref } from "effect"
import { ProjectVcsRepo } from "../repos/project-vcs-repo.ts"
import { LocalProfile } from "./local-profile.ts"
import { VcsFailure, type Actor } from "./project-vcs.ts"
import { builtinSteps, type StepContext } from "./workflow-steps.ts"

/** Steps that need only the commit, plus the context every step receives. Re-exported for convenience. */
export { builtinSteps }
export type { StepContext }

const WORKFLOW_DIR = ".cadcamfun/workflows/"

export type RunRow = typeof schema.workflowRunTable.$inferSelect

export interface TriggerOptions {
  /** Live progress, streamed to the UI and to the mobile companion while the run progresses. */
  readonly onEvent?: (workflow: string, e: RunEvent) => void
  /** Who is running it. Defaults to the local profile; an HTTP caller passes the signed-in account. */
  readonly actor?: Actor
}

export class WorkflowRunner extends Context.Service<WorkflowRunner, {
  /** Workflow files present in the tree of `ref`. */
  list(projectId: string, ref: string): Effect.Effect<string[]>
  /**
   * Every workflow file of `ref` with its YAML and, when it does not parse, why. Reads the commit,
   * not the working copy, so what the editor shows is what a run would actually execute.
   */
  files(projectId: string, ref: string): Effect.Effect<ReadonlyArray<{ name: string; path: string; content: string; problem?: string }>>
  /** One workflow file by name (with or without the `.yml` suffix). */
  file(projectId: string, ref: string, name: string): Effect.Effect<{ name: string; path: string; content: string; problem?: string }, VcsFailure>
  /** Runs every workflow of `ref` that the event triggers; each run is persisted with its streamed events. */
  trigger(projectId: string, ref: string, event: TriggerEvent, options?: TriggerOptions): Effect.Effect<RunRow[], DatabaseError>
  runs(projectId: string, limit?: number): Effect.Effect<RunRow[], DatabaseError>
  /**
   * Adds steps whose service is built after the runner (the assistant sits above it, so `ai/prompt`
   * cannot be a dependency). A workflow naming a step that was never registered fails before anything
   * runs, exactly as one naming a typo does — never silently skipped.
   */
  register(steps: StepRegistry<StepContext>): Effect.Effect<void>
  /** Every step a workflow may `uses:` right now, for the workflow editor and for error messages. */
  steps(): Effect.Effect<ReadonlyArray<string>>
}>()("cadcamfun/WorkflowRunner") {
  static readonly layer = (extra: StepRegistry<StepContext> = {}) =>
    Layer.effect(
      WorkflowRunner,
      Effect.gen(function*() {
        const { query } = yield* Database
        const store = yield* ProjectVcsRepo
        const { user: local } = yield* LocalProfile
        // Read at run time: `register` may have added steps since the layer was built.
        const registry = yield* Ref.make<StepRegistry<StepContext>>({ ...builtinSteps, ...extra })
        const load = (projectId: string, ref: string) => {
          const repo = new Repository(store.backend(projectId))
          const sha = repo.resolve(ref)
          return { sha, files: repo.readFiles(repo.readCommit(sha).tree) }
        }
        const names = (files: Readonly<Record<string, unknown>>) => Object.keys(files).filter((p) => p.startsWith(WORKFLOW_DIR) && /\.ya?ml$/.test(p)).sort()
        /** A file that does not parse is still returned, with the reason: the editor has to show it to be fixed. */
        const describe = (path: string, source: string) => {
          // `parseWorkflow` is pure over the text, so it is run synchronously here rather than adding
          // an Effect to a function that only builds a response object.
          const parsed = Effect.runSync(Effect.result(parseWorkflow(source)))
          return parsed._tag === "Success"
            ? { name: path.slice(WORKFLOW_DIR.length), path, content: source }
            : { name: path.slice(WORKFLOW_DIR.length), path, content: source, problem: parsed.failure.message }
        }
        const readAll = (projectId: string, ref: string) =>
          Effect.sync(() => {
            const files = load(projectId, ref).files;
            return names(files).map((path) => describe(path, toText(files[path]!)));
          })
        return WorkflowRunner.of({
          list: (projectId, ref) => Effect.sync(() => names(load(projectId, ref).files).map((p) => p.slice(WORKFLOW_DIR.length))).pipe(Effect.orElseSucceed(() => [])),
          files: (projectId, ref) => readAll(projectId, ref).pipe(Effect.orElseSucceed(() => [])),
          file: (projectId, ref, name) =>
            Effect.gen(function*() {
              const wanted = name.startsWith(WORKFLOW_DIR) ? name : `${WORKFLOW_DIR}${name.endsWith(".yml") || name.endsWith(".yaml") ? name : `${name}.yml`}`
              const files = load(projectId, ref).files
              if (files[wanted] === undefined) return yield* new VcsFailure({ code: "not-found", message: `No workflow named ${name}` })
              return describe(wanted, toText(files[wanted]!))
            }),
          trigger: (projectId, ref, event, options) =>
            Effect.gen(function*() {
              const { sha, files } = load(projectId, ref)
              const actor = options?.actor ?? { userId: local.id, name: local.name ?? local.email ?? "User", email: local.email ?? "unknown@cadcamfun.local" }
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
                const result = yield* runWorkflow(parsed.success, {
                  registry: yield* Ref.get(registry),
                  ctx: { projectId, ref, sha, files, actor },
                  onEvent: (e) => { events.push(e); options?.onEvent?.(name, e) },
                }).pipe(Effect.result)
                const status = result._tag === "Success" ? result.success.status : "failure"
                if (result._tag === "Failure") events.push({ type: "step", job: "-", index: 0, uses: "-", status: "failure", message: result.failure.message })
                out.push(yield* query("workflow.run.finish", (db) => db.update(schema.workflowRunTable).set({ status, events, finishedAt: new Date() }).where(eq(schema.workflowRunTable.id, run.id)).returning().get()).pipe(Effect.map((r) => r!)))
              }
              return out
            }),
          runs: (projectId, limit = 50) =>
            query("workflow.runs", (db) => db.select().from(schema.workflowRunTable).where(eq(schema.workflowRunTable.projectId, projectId)).orderBy(desc(schema.workflowRunTable.startedAt)).limit(limit).all()),
          register: (steps) => Ref.update(registry, (current) => ({ ...current, ...steps })),
          steps: () => Ref.get(registry).pipe(Effect.map((r) => Object.keys(r).sort())),
        })
      }),
    )
}