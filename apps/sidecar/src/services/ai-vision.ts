import { sceneGeometryText } from "@cadcamfun/core"
import { createHash } from "node:crypto"
import { visionCaptureSchema, type VisionCapture } from "@cadcamfun/ai"

interface VisionExchange {
  set(key: string, value: unknown): Promise<unknown>
  get(key: string): Promise<unknown>
  delete(key: string): Promise<unknown>
}

/** Short-lived request/reply over the workspace KV channel, correlated by a unique request id. */
export const captureViewport = async (exchange: VisionExchange, input: { projectId: string; mode: "cad" | "cam"; focus?: string; signal?: AbortSignal }, evidence: (capture: VisionCapture) => Promise<{ elements: ReadonlyArray<unknown>; drawing: unknown; operations: unknown; programRevision?: string; programError?: string }>) => {
  const requestId = crypto.randomUUID()
  const requestedAt = Date.now()
  const requestKey = `ai.vision.request.${input.projectId}.${requestId}`
  const replyKey = `ai.vision.reply.${input.projectId}.${requestId}`
  try {
    await exchange.set(requestKey, { requestId, projectId: input.projectId, mode: input.mode, requestedAt, focus: input.focus ?? "" })
    while (Date.now() - requestedAt < 12_000) {
      if (input.signal?.aborted) return { ok: false as const, error: "Viewport capture cancelled." }
      const raw = await exchange.get(replyKey)
      if (raw !== undefined) {
        const failure = raw as { error?: unknown; requestId?: unknown }
        if (failure.requestId === requestId && typeof failure.error === "string") return { ok: false as const, error: failure.error.slice(0, 300) }
        const decoded = visionCaptureSchema.safeParse(raw)
        if (!decoded.success) return { ok: false as const, error: "The desktop returned an invalid viewport capture." }
        const capture = decoded.data
        if (capture.requestId !== requestId || capture.projectId !== input.projectId || capture.mode !== input.mode || capture.capturedAt < requestedAt || capture.capturedAt > Date.now() + 1000) return { ok: false as const, error: "Viewport capture does not match this request." }
        const current = await evidence(capture)
        const revision = createHash("sha256").update(sceneGeometryText(current.elements)).digest("hex")
        if (capture.sceneRevision !== revision) return { ok: false as const, error: "The displayed geometry differs from the stored drawing. Synchronize the workspace and capture again." }
        if (current.programError) return { ok: false as const, error: current.programError }
        if (current.programRevision && capture.programRevision !== current.programRevision) return { ok: false as const, error: "The rendered toolpath differs from the selected saved operation. Generate or synchronize the CAM preview and capture again." }
        return { ok: true as const, capture, evidence: { ok: true, requestId, capturedAt: new Date(capture.capturedAt).toISOString(), sceneRevision: revision, image: { width: capture.width, height: capture.height, mime: capture.mime }, camera: capture.camera ?? null, spatial: capture.spatial ?? null, focus: input.focus ?? null, workspace: capture.context, drawing: current.drawing, operations: current.operations, note: "Inspect the attached actual viewport image. Numeric checks require CAD/CAM verification tools." } }
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return { ok: false as const, error: "No matching desktop viewport responded within 12 seconds. Open the requested CAD/CAM viewport and retry." }
  } finally {
    await Promise.allSettled([exchange.delete(requestKey), exchange.delete(replyKey)])
  }
}
