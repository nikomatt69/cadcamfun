/**
 * Screenshots and videos of the live viewport, for the person (not for the assistant's vision tool).
 *
 * Both read the newest on-screen viewport of a mode (`cad` canvas, `cam` toolpath preview) through the
 * same registry the vision tool uses, so a button in either screen captures exactly what is shown.
 *
 * - **Screenshot**: one fresh frame at the canvas's own resolution, as PNG. The CAM program sheet
 *   stands in when the preview is not on screen (the G-code tab), so the button still answers.
 * - **Video**: a 2D canvas is fed from the viewport at a fixed rate and recorded with `MediaRecorder`.
 *   The intermediate canvas keeps the video independent of `preserveDrawingBuffer` and of the render
 *   loop going idle (a still scene would otherwise produce no frames at all).
 */
import { visibleFrame } from "../features/ai/lib/viewport-capture.ts"

export type CaptureMode = "cad" | "cam"

/** The longest edge of a recorded frame: keeps the encoder and the file size in check. */
export const MAX_VIDEO_EDGE = 1920
export const VIDEO_FPS = 30
const VIDEO_BITS_PER_SECOND = 8_000_000

/** Preferred containers, best first; the webview supports a subset (WebKit: mp4, Chromium: webm). */
const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"] as const

export class CaptureError extends Error {
  constructor(readonly code: "unavailable" | "unsupported" | "failed", message: string) {
    super(message)
    this.name = "CaptureError"
  }
}

export interface Capture {
  readonly blob: Blob
  readonly name: string
  readonly mime: string
}

/** `cad-2026-11-02-141530.png`: sortable, no characters a file dialog dislikes. */
export const captureName = (mode: CaptureMode, extension: string, now: Date = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, "0")
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${mode}-${day}-${time}.${extension}`
}

/** The container to record with: the first of the preferred list the webview can encode. */
export const pickVideoType = (supported: (type: string) => boolean): string | undefined => VIDEO_TYPES.find(supported)

export const extensionOf = (mime: string): string => (mime.startsWith("video/mp4") ? "mp4" : "webm")

/** Even dimensions (encoders reject odd ones), longest edge capped. */
export const videoSize = (width: number, height: number): { readonly width: number; readonly height: number } => {
  const scale = Math.min(1, MAX_VIDEO_EDGE / Math.max(width, height, 1))
  const even = (value: number): number => Math.max(2, Math.round((value * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob === null ? reject(new CaptureError("failed", "The canvas produced no image.")) : resolve(blob)), type))

/** One PNG of the viewport as it is right now. */
export const takeScreenshot = async (mode: CaptureMode): Promise<Capture> => {
  const frame = visibleFrame(mode, { sheet: mode === "cam" })
  if (frame === undefined) throw new CaptureError("unavailable", "No viewport is on screen.")
  // The pixels of a WebGL canvas are only valid in the task that rendered them: copy before any await.
  const copy = document.createElement("canvas")
  copy.width = frame.canvas.width
  copy.height = frame.canvas.height
  const ctx = copy.getContext("2d")
  if (ctx === null) throw new CaptureError("failed", "Could not create an image buffer.")
  ctx.drawImage(frame.canvas, 0, 0)
  return { blob: await toBlob(copy, "image/png"), name: captureName(mode, "png"), mime: "image/png" }
}

export interface Recording {
  /** Ends the recording and answers with the finished file. */
  readonly stop: () => Promise<Capture>
  /** Throws the recording away. */
  readonly cancel: () => void
}

/** True when this webview can record a canvas at all. */
export const canRecord = (): boolean =>
  typeof MediaRecorder !== "undefined" && typeof document !== "undefined" && typeof document.createElement("canvas").captureStream === "function" &&
  pickVideoType((type) => MediaRecorder.isTypeSupported(type)) !== undefined

export const startRecording = (mode: CaptureMode): Recording => {
  if (!canRecord()) throw new CaptureError("unsupported", "This webview cannot record video.")
  const first = visibleFrame(mode)
  if (first === undefined) throw new CaptureError("unavailable", "No viewport is on screen.")
  const mime = pickVideoType((type) => MediaRecorder.isTypeSupported(type))!
  const size = videoSize(first.canvas.width, first.canvas.height)
  const target = document.createElement("canvas")
  target.width = size.width
  target.height = size.height
  const ctx = target.getContext("2d", { alpha: false })
  if (ctx === null) throw new CaptureError("failed", "Could not create a video buffer.")
  const draw = (): void => {
    const frame = visibleFrame(mode)
    // A hidden viewport keeps the last frame instead of tearing the recording down.
    if (frame === undefined) return
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(0, 0, size.width, size.height)
    // Keep the aspect if the panel was resized mid-recording; letterbox instead of stretching.
    const fit = Math.min(size.width / frame.canvas.width, size.height / frame.canvas.height)
    const w = frame.canvas.width * fit
    const h = frame.canvas.height * fit
    ctx.drawImage(frame.canvas, (size.width - w) / 2, (size.height - h) / 2, w, h)
  }
  draw()
  const stream = target.captureStream(VIDEO_FPS)
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS_PER_SECOND })
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
  const timer = setInterval(draw, 1000 / VIDEO_FPS)
  let closed = false
  const release = (): void => {
    if (closed) return
    closed = true
    clearInterval(timer)
    for (const track of stream.getTracks()) track.stop()
  }
  recorder.start(1000)
  return {
    stop: () => new Promise<Capture>((resolve, reject) => {
      if (recorder.state === "inactive") { release(); reject(new CaptureError("failed", "The recording had already ended.")); return }
      recorder.onerror = () => { release(); reject(new CaptureError("failed", "The recorder failed.")) }
      recorder.onstop = () => {
        release()
        const type = mime.split(";")[0]!
        const blob = new Blob(chunks, { type })
        if (blob.size === 0) reject(new CaptureError("failed", "The recording is empty."))
        else resolve({ blob, name: captureName(mode, extensionOf(mime)), mime: type })
      }
      draw()
      recorder.stop()
    }),
    cancel: () => {
      recorder.onstop = null
      recorder.ondataavailable = null
      if (recorder.state !== "inactive") recorder.stop()
      release()
    }
  }
}
