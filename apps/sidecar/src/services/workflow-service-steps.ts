/**
 * Workflow steps that need a service rather than just the commit. They are not in `builtinSteps`:
 * `vcs/commit` writes to the repository, `notify/push` writes a row for the person watching, and
 * `ai/prompt` needs the assistant — which is built *above* the workflow runner (its own tools use it),
 * so none of them can be a layer dependency of the runner. Each is registered with
 * `WorkflowRunner.register` by the layer that owns the service.
 *
 * They all act as `ctx.actor`, the account that triggered the run, so history and notifications are
 * attributed to whoever dispatched it rather than to the local profile.
 */
import type { AiService, ModelSelector } from "@cadcamfun/ai"
import { filesToSnapshot } from "@cadcamfun/vcs"
import { Effect } from "effect"
import { StepError, type StepRegistry } from "@cadcamfun/workflow"
import type { NotificationService } from "./notifications.ts"
import type { ProjectVcs } from "./project-vcs.ts"
import type { StepContext } from "./workflow-steps.ts"

type Step = StepRegistry<StepContext>[string]

const str = (w: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const v = w[key]
  return typeof v === "string" && v.trim() !== "" ? v : undefined
}

/** Only non-model paths, exactly as the commit API enforces: a workflow may amend CI, never the model. */
const SAFE_PATH = /^\.cadcamfun\/[A-Za-z0-9._/-]+\.(ya?ml|md|json|txt)$/

/**
 * `vcs/commit` — records files produced by earlier steps as a new commit on the branch being checked, so
 * a workflow can publish an artefact into history (a verification report, a regenerated program).
 * Fails when the working copy is dirty: an automated commit must never swallow someone's unfinished
 * edits, and the commit uses the acting user’s Git identity on the checked-out branch, including `main`.
 */
export const vcsCommitStep = (deps: { readonly vcs: ProjectVcs["Service"] }): Step =>
  ({ ctx, with: w }) => {
    const message = str(w, "message")
    if (message === undefined) return Effect.fail(new StepError({ message: "vcs/commit needs a message" }))
    const files: Record<string, string> = {}
    const raw = w.files
    if (raw !== null && typeof raw === "object") {
      for (const [path, content] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof content !== "string") continue
        if (!SAFE_PATH.test(path)) return Effect.fail(new StepError({ message: `vcs/commit may only write .cadcamfun/** text files; refused ${path}` }))
        files[path] = content
      }
    }
    return deps.vcs.commit(ctx.projectId, { message }, ctx.actor, files).pipe(
      Effect.map((oid) => ({ commit: oid, files: Object.keys(files).length })),
      Effect.mapError((e) => new StepError({ message: e.message })),
    )
  }

/**
 * `notify/push` — leaves a notification for the account that dispatched the run, which is how a failure
 * the person is not watching reaches them (the phone's list, the desktop's bell).
 * `with: { title?, body?, outcome? }`, where `outcome` is `success` (default) or `failure`.
 */
export const notifyPushStep = (deps: { readonly notifications: NotificationService["Service"] }): Step =>
  ({ ctx, with: w }) => {
    const outcome = str(w, "outcome") === "failure" ? "failure" : "success"
    const title = str(w, "title") ?? `Workflow on ${ctx.ref} ${outcome === "failure" ? "failed" : "passed"}`
    const snapshot = filesToSnapshot(ctx.files)
    const content = [
      str(w, "body"),
      `${snapshot.drawings.length} drawing(s), ${snapshot.toolpaths.length} toolpath(s), commit ${ctx.sha.slice(0, 7)}`,
    ].filter((s): s is string => s !== undefined).join(" — ")
    return deps.notifications.create({
      type: outcome === "failure" ? "WORKFLOW_FAILED" : "WORKFLOW_PASSED",
      title,
      content,
      userId: ctx.actor.userId,
      projectId: ctx.projectId,
      linkUrl: `/projects/${ctx.projectId}/history`,
    }).pipe(Effect.as({ notified: outcome === "failure" ? "WORKFLOW_FAILED" : "WORKFLOW_PASSED" }), Effect.orDie)
  }

/**
 * `ai/prompt` — asks the assistant one question about the commit and returns its answer as an output, so
 * later steps can interpolate it (`${{ steps.review.outputs.text }}`). The prompt may reference files of
 * the commit with `${{ files.<path> }}`, which keeps workflows from having to inline a whole program.
 *
 * A missing or failing model fails only this step: a run that validated the geometry and then could not
 * reach the assistant is a failure of the assistant, not of the part.
 */
export const aiPromptStep = (deps: { readonly ai: AiService["Service"] }): Step =>
  ({ ctx, with: w }) => {
    const prompt = str(w, "prompt")
    if (prompt === undefined) return Effect.fail(new StepError({ message: "ai/prompt needs a prompt" }))
    const system = str(w, "system")
    const model = str(w, "model")
    const selector: ModelSelector | undefined = model === undefined ? undefined : { model }
    const expanded = prompt.replace(/\$\{\{\s*files\.([^}\s]+)\s*\}\}/g, (_, path: string) => {
      const file = ctx.files[path]
      return file === undefined ? "" : new TextDecoder().decode(file)
    })
    return deps.ai.complete({ prompt: expanded, ...(system !== undefined ? { system } : {}), ...(selector !== undefined ? { model: selector } : {}) }).pipe(
      Effect.map((r) => ({ text: r.text, model: r.model })),
      Effect.mapError((e) => new StepError({ message: `ai/prompt failed: ${e.message}` })),
    )
  }