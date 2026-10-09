/**
 * Registers the workflow steps that write rather than check: `vcs/commit` (record a file produced by an
 * earlier step) and `notify/push` (tell the person watching that a run finished).
 *
 * Both act as `ctx.actor`, the account that triggered the run, so this layer needs nothing but the two
 * services — no `ActingUser` cell to keep in step with the one the assistant uses.
 */
import { Effect, Layer } from "effect"
import { NotificationService } from "./notifications.ts"
import { ProjectVcs } from "./project-vcs.ts"
import { WorkflowRunner } from "./workflow-runner.ts"
import { notifyPushStep, vcsCommitStep } from "./workflow-service-steps.ts"

export const WorkflowServiceStepsLive = Layer.effectDiscard(
  Effect.gen(function*() {
    const runner = yield* WorkflowRunner
    const vcs = yield* ProjectVcs
    const notifications = yield* NotificationService
    yield* runner.register({
      "vcs/commit": vcsCommitStep({ vcs }),
      "notify/push": notifyPushStep({ notifications }),
    })
  }),
)