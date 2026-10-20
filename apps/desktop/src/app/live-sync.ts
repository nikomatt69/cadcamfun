import { Effect, Stream } from "effect"
import type { LiveEvent } from "@cadcamfun/api"
import type { AppState } from "../shared/state/context.ts"
import { captureEditorOwner, reconcileCoalesced } from "../features/ai/lib/editor-sync.ts"
import { reconcileSavedProgram } from "../features/cam/lib/saved-program.ts"
import { useCamStore } from "../features/cam/store/camStore.ts"

/** One host stream, like nikcli's global SDK. A greeting always reloads state lost while disconnected. */
export function startLiveSync(app: AppState): () => void {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let reconcile = false
  const refresh = (event: LiveEvent) => {
    const owner = captureEditorOwner()
    reconcile ||= event.type === "server.connected" || "projectId" in event &&
      (event.projectId === owner.projectId || event.projectId === useCamStore.getState().savedProgram?.projectId)
    if (timer !== undefined) return
    // A burst of tool results should cause one refresh, not one request per result.
    timer = setTimeout(() => {
      timer = undefined
      app.cache.invalidate()
      if (reconcile) {
        const owner = captureEditorOwner()
        const current = () => !controller.signal.aborted && owner.current()
        void reconcileCoalesced(app, { ...owner, current }).catch(() => undefined)
        void reconcileSavedProgram(app, current).catch(() => undefined)
      }
      reconcile = false
    }, 16)
  }
  void (async () => {
    let delay = 1000
    while (!controller.signal.aborted) {
      try {
        await app.runtime.run(Effect.flatMap(app.client.events.subscribeAll(), (stream) =>
          Stream.runForEach(stream, (event) => Effect.sync(() => { delay = 1000; refresh(event) })),
        ), { signal: controller.signal })
      } catch { /* A reconnect greeting repairs missed events; writes are never retried. */ }
      if (controller.signal.aborted) break
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(pause); controller.signal.removeEventListener("abort", finish); resolve() }
        const pause = setTimeout(finish, delay)
        controller.signal.addEventListener("abort", finish, { once: true })
        if (controller.signal.aborted) finish()
      })
      delay = Math.min(delay * 2, 30_000)
    }
  })()
  return () => { controller.abort(); clearTimeout(timer) }
}
