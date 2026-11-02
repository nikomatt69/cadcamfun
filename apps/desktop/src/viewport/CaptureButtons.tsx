import { Show, createSignal, onCleanup, type JSX } from "solid-js"
import { Camera, Square, Video } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { saveFile } from "../shared/lib/save-file.ts"
import { toast } from "../shared/ui/toast.tsx"
import { CaptureError, canRecord, startRecording, takeScreenshot, type Capture, type CaptureMode, type Recording } from "./media-capture.ts"

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

const failure = (cause: unknown): string => {
  if (cause instanceof CaptureError && cause.code === "unavailable") return t("viewport.capture.unavailable")
  if (cause instanceof CaptureError && cause.code === "unsupported") return t("viewport.capture.unsupported")
  return t("viewport.capture.failed", { reason: cause instanceof Error ? cause.message : String(cause) })
}

/**
 * The screenshot and video buttons of a viewport: one for a picture of what is on screen, one that
 * starts a recording and, pressed again, stops it and saves the file (native save dialog on desktop).
 * Used by the CAD canvas and by the CAM toolpath preview, so both capture the same way.
 */
export function CaptureButtons(props: { readonly mode: CaptureMode; readonly class?: string; readonly iconSize?: number }): JSX.Element {
  const [recording, setRecording] = createSignal<Recording | undefined>()
  const [elapsed, setElapsed] = createSignal(0)
  let ticker: ReturnType<typeof setInterval> | undefined
  const size = () => props.iconSize ?? 18
  const klass = () => props.class ?? "panel-icon-btn"

  const save = async (capture: Capture): Promise<void> => {
    try {
      if (await saveFile({ name: capture.name, data: capture.blob, mime: capture.mime })) toast.success(t("viewport.capture.saved", { name: capture.name }))
    } catch (cause) { toast.error(failure(cause)) }
  }

  const shoot = async (): Promise<void> => {
    try { await save(await takeScreenshot(props.mode)) } catch (cause) { toast.error(failure(cause)) }
  }

  const toggle = async (): Promise<void> => {
    const active = recording()
    if (active === undefined) {
      try {
        setRecording(startRecording(props.mode))
        setElapsed(0)
        ticker = setInterval(() => setElapsed((value) => value + 1), 1000)
      } catch (cause) { toast.error(failure(cause)) }
      return
    }
    clearInterval(ticker)
    setRecording(undefined)
    try { await save(await active.stop()) } catch (cause) { toast.error(failure(cause)) }
  }

  // Leaving the screen mid-recording drops the take instead of leaking the timer and the stream.
  onCleanup(() => { clearInterval(ticker); recording()?.cancel() })

  return <>
    <button type="button" class={klass()} data-testid={`capture-screenshot-${props.mode}`} title={t("viewport.capture.screenshot")} aria-label={t("viewport.capture.screenshot")} disabled={recording() !== undefined} onClick={() => { void shoot() }}>
      <Camera size={size()} />
    </button>
    <button type="button" class={klass()} data-testid={`capture-record-${props.mode}`} aria-pressed={recording() !== undefined}
      disabled={recording() === undefined && !canRecord()}
      title={recording() !== undefined ? t("viewport.capture.stop", { time: clock(elapsed()) }) : t("viewport.capture.record")}
      aria-label={recording() !== undefined ? t("viewport.capture.stop", { time: clock(elapsed()) }) : t("viewport.capture.record")}
      classList={{ "text-red-500": recording() !== undefined }}
      onClick={() => { void toggle() }}>
      <Show when={recording() !== undefined} fallback={<Video size={size()} />}><Square size={size()} fill="currentColor" /></Show>
      <Show when={recording() !== undefined}><span class="ml-1 text-[11px] tabular-nums">{clock(elapsed())}</span></Show>
    </button>
  </>
}
