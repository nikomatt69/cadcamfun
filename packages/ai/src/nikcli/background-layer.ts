/// <reference path="./sdk-next.d.ts" />
import { Effect, Layer } from "effect"
import { AiBackground, AiHost } from "../service.ts"
import { BackgroundToolsRunner } from "./background-tools-runner.ts"
import { backgroundToolContributions } from "./background-tools.ts"
import { BackgroundTaskManager } from "./background-tasks.ts"

/**
 * Build the runtime-wide `AiBackground` service. `AiHost.scheduler` already
 * holds the manager, so the worker runner closes over the same instance and
 * the `agent` tool's actions handed to the host's `toolsFor` see every task the
 * runner creates.
 *
 * The returned layer's `R` is exactly `AiHost` (the worker needs the runtime
 * to spawn sessions). Compose it after the host is in scope — the sidecar
 * merges it into `AiLive`.
 */
export const makeAiBackgroundLayer = Layer.effect(
  AiBackground,
  Effect.gen(function*() {
    const host = yield* AiHost
    const manager = host.scheduler
    const runner = new BackgroundToolsRunner(host.runtime, { manager })
    void backgroundToolContributions(runner.manager)
    yield* Effect.addFinalizer(() => Effect.promise(() => runner.dispose()))
    // Tasks a previous process left behind: readers run again, editors are reported for reconciliation, undelivered
    // outcomes reach their parent. Runner and completion hook are installed above, so nothing recovered is stranded.
    yield* Effect.promise(() => manager.recover().catch(() => undefined))
    return AiBackground.of({
      runner,
      cancelForParent: (owner) =>
        Effect.promise(async () => runner.cancelForParent(owner)),
      dispose: () => Effect.promise(() => runner.dispose())
    })
  })
)

/** The contributions the caller passes to `buildTools` so the `agent` tool's four actions can run. */
export const backgroundToolContributionsFor = (manager: BackgroundTaskManager) => backgroundToolContributions(manager)