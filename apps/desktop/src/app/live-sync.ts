import { Effect, Stream } from "effect"
import type { LiveEvent } from "@cadcamfun/api"
import type { AppState } from "../shared/state/context.ts"
import { captureEditorOwner, reconcileCoalesced } from "../features/ai/index.ts"
import { reconcileSavedProgram } from "../features/cam/lib/saved-program.ts"
import { useCamStore } from "../features/cam/store/camStore.ts"
import { isTauri } from "./sidecar.ts"

/** Renew the native App Nap lease during quiet phases of a long kernel run. */
const JOB_ACTIVITY_RENEW_MS = 30_000

/** One host stream, like nikcli's global SDK. A greeting always reloads state lost while disconnected. */
export function startLiveSync(app: AppState): () => void {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let reconcile = false
  const nativeRuns = new Map<string, ReturnType<typeof setInterval>>()
  let nativeWindow: Promise<typeof import("@tauri-apps/api/window")> | undefined
  let nativeProgressVisible = false
  let nativeProgressTransition = Promise.resolve()
  const nativeInvoke = async (command: "begin_job_activity" | "end_job_activity", runId: string): Promise<void> => {
    if (!isTauri()) return
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke(command, { runId })
  }
  const updateNativeProgress = (): void => {
    if (!isTauri()) return
    const visible = nativeRuns.size > 0
    if (visible === nativeProgressVisible) return
    nativeProgressVisible = visible
    nativeProgressTransition = nativeProgressTransition.then(async () => {
      nativeWindow ??= import("@tauri-apps/api/window")
      const { getCurrentWindow, ProgressBarStatus } = await nativeWindow
      await getCurrentWindow().setProgressBar({ status: visible ? ProgressBarStatus.Indeterminate : ProgressBarStatus.None })
    }).catch(() => undefined)
  }
  const trackNativeJob = (event: Extract<LiveEvent, { type: "cam.progress" }>): void => {
    if (!isTauri()) return
    if (event.phase === "running") {
      if (!nativeRuns.has(event.runId)) {
        void nativeInvoke("begin_job_activity", event.runId).catch(() => undefined)
        const renewal = setInterval(() => { void nativeInvoke("begin_job_activity", event.runId).catch(() => undefined) }, JOB_ACTIVITY_RENEW_MS)
        nativeRuns.set(event.runId, renewal)
      }
    } else {
      const renewal = nativeRuns.get(event.runId)
      if (renewal !== undefined) clearInterval(renewal)
      nativeRuns.delete(event.runId)
      void nativeInvoke("end_job_activity", event.runId).catch(() => undefined)
    }
    updateNativeProgress()
  }
  const refresh = (event: LiveEvent) => {
    // A keep-alive proves the pipe is alive; it never means data changed.
    if (event.type === "server.heartbeat") return
    // Kernel progress only moves a label: it must not reload the project the way a saved change does.
    if (event.type === "cam.progress") { useCamStore.getState().setKernelProgress(event); trackNativeJob(event); return }
    app.notifications.handleLiveEvent(event)
    if (event.type === "server.connected") void app.notifications.refresh()
    if (event.type === "organizations.changed") app.cache.invalidate()
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
  return () => {
    controller.abort()
    clearTimeout(timer)
    for (const [runId, renewal] of nativeRuns) {
      clearInterval(renewal)
      void nativeInvoke("end_job_activity", runId).catch(() => undefined)
    }
    nativeRuns.clear()
    updateNativeProgress()
  }
}
