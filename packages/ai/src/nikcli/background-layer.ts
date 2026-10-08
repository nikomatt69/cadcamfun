/// <reference path="./sdk-next.d.ts" />
import { Effect, Layer } from "effect"
import { AiBackground, AiHost } from "../service.ts"
import { BackgroundToolsRunner } from "./background-tools-runner.ts"
import { backgroundTools } from "./background-tools.ts"
import { BackgroundTaskManager } from "./background-tasks.ts"

/**
 * Build the runtime-wide `AiBackground` service. `AiHost.scheduler` already
 * holds the manager, so the worker runner closes over the same instance and
 * the four `agent_task*` tool specs handed to the host's `toolsFor` see every
 * task the runner creates.
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
    const runner = new BackgroundToolsRunner(host.runtime, "__shared__", { manager })
    void backgroundTools(runner.manager)
    yield* Effect.addFinalizer(() => Effect.promise(() => runner.dispose()))
    return AiBackground.of({
      runner,
      cancelForParent: (parentSessionId) =>
        Effect.promise(async () => runner.cancelForParent(parentSessionId)),
      dispose: () => Effect.promise(() => runner.dispose())
    })
  })
)

/** Tool specs the caller appends to `toolsFor(projectId)` so the host advertises the four `agent_task*` tools. */
export const backgroundToolSpecs = (manager: BackgroundTaskManager) => backgroundTools(manager)