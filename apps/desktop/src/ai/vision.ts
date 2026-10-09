import { sceneGeometryText } from "@cadcamfun/core"
import type { AppState } from "../state/context.ts"
import { useDocumentStore } from "../cad/store/documentStore.ts"
import { useElementsStore } from "../cad/store/elementsStore.ts"
import { toJsonSafe } from "../state/json-safe.ts"
import { currentDrawingContext } from "./drawing-context.ts"
import { captureVisibleViewport } from "./viewport-capture.ts"

/** Service active capture requests only for the document currently displayed on this desktop. */
export const startVisionBridge = (app: AppState): (() => void) => {
  let disposed = false, busy = false
  const completed = new Set<string>()
  const poll = async () => {
    const projectId = useDocumentStore.getState().projectId
    if (disposed || busy || !projectId) return
    busy = true
    try {
      const result = await app.runtime.run(app.client.kv.list({ query: { prefix: `ai.vision.request.${projectId}.` } })) as { entries: ReadonlyArray<{ key: string; value: unknown }> }
      for (const entry of result.entries) {
        const request = entry.value as { requestId?: unknown; projectId?: unknown; mode?: unknown; requestedAt?: unknown }
        if (disposed || completed.has(entry.key) || request.projectId !== projectId || typeof request.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(request.requestId) || (request.mode !== "cad" && request.mode !== "cam") || typeof request.requestedAt !== "number" || Date.now() - request.requestedAt > 12_000) continue
        completed.add(entry.key)
        // Effects have applied the preceding tool result before the actual rendered frame is read.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        let value: unknown
        try {
          if (useDocumentStore.getState().projectId !== projectId) throw new Error("The desktop switched projects before capture.")
          const elements = toJsonSafe(useElementsStore.getState().elements)
          const context = toJsonSafe(currentDrawingContext(app))
          const { programText, ...capture } = captureVisibleViewport(request.mode)
          const capturedAt = Date.now()
          const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sceneGeometryText(elements as ReadonlyArray<unknown>)))
          const sceneRevision = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")
          const programHash = programText !== undefined ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(programText)) : undefined
          const programRevision = programHash ? [...new Uint8Array(programHash)].map((b) => b.toString(16).padStart(2, "0")).join("") : undefined
          value = { ...capture, requestId: request.requestId, projectId, mode: request.mode, capturedAt, sceneRevision, ...(programRevision ? { programRevision } : {}), mime: "image/png", context }
        } catch (error) { value = { requestId: request.requestId, error: error instanceof Error ? error.message : "Viewport capture failed." } }
        if (!disposed) await app.runtime.run(app.client.kv.set({ params: { key: `ai.vision.reply.${projectId}.${request.requestId}` }, payload: { value } }))
      }
      if (completed.size > 200) completed.clear()
    } catch { /* A disconnected sidecar retries on the next poll; the tool owns its timeout. */ }
    finally { busy = false }
  }
  const timer = setInterval(() => { void poll() }, 700)
  return () => { disposed = true; clearInterval(timer); completed.clear() }
}
