/**
 * The simulation timeline under the CAM preview (spec 32 §4.8): one band per operation in its colour and length of time,
 * tool changes as ticks, set-up findings (collisions) as red markers, the playhead; click to seek, step by move or by
 * operation, and the playback speed on a log scale.
 */
import { For, Show, type JSX } from "solid-js"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"
import { colorHex } from "../../../viewport/view3d/playback.ts"

export interface SimulationTimelineProps {
  readonly duration: number
  readonly seconds: number
  readonly spans: ReadonlyArray<cam.viewer.OperationSpan>
  /** Colour and name of each toolpath (operation) by its index. */
  readonly colors: ReadonlyArray<number>
  readonly names: ReadonlyArray<string>
  readonly toolChanges: ReadonlyArray<number>
  readonly markers: ReadonlyArray<{ readonly seconds: number; readonly severity: string; readonly message: string }>
  readonly rate: number
  readonly onRate: (rate: number) => void
  readonly onSeek: (seconds: number) => void
  readonly onStepMove: (dir: 1 | -1) => void
  readonly onStepOperation: (dir: 1 | -1) => void
  readonly autoResume?: boolean
  readonly onAutoResumeChange?: (enabled: boolean) => void
}

const RATES = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 100, 1000]
const pct = (seconds: number, duration: number): string => `${duration > 0 ? Math.max(0, Math.min(100, (seconds / duration) * 100)) : 0}%`

export function SimulationTimeline(props: SimulationTimelineProps): JSX.Element {
  let track: HTMLDivElement | undefined
  const seekAt = (event: PointerEvent): void => {
    if (!track || props.duration <= 0) return
    const box = track.getBoundingClientRect()
    props.onSeek(Math.max(0, Math.min(1, (event.clientX - box.left) / Math.max(1, box.width))) * props.duration)
  }
  const button = (label: string, icon: JSX.Element, onClick: () => void, testId: string): JSX.Element => (
    <button type="button" class="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white" title={label} aria-label={label} data-testid={testId} onClick={onClick}>{icon}</button>
  )
  return (
    <div class="flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1.5 backdrop-blur pointer-events-auto" data-testid="simulation-timeline" role="group" aria-label={t("cam.timeline.label")}>
      {button(t("cam.timeline.prevOperation"), <ChevronsLeft size={14} />, () => props.onStepOperation(-1), "timeline-prev-op")}
      {button(t("cam.timeline.prevMove"), <ChevronLeft size={14} />, () => props.onStepMove(-1), "timeline-prev-move")}
      <div
        ref={track}
        class="relative h-6 flex-1 cursor-pointer overflow-hidden rounded bg-white/10"
        role="slider" aria-label={t("cam.timeline.seek")} aria-valuemin={0} aria-valuemax={props.duration} aria-valuenow={props.seconds} tabIndex={0}
        onPointerDown={(event) => { (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId); seekAt(event) }}
        onPointerMove={(event) => { if (event.buttons & 1) seekAt(event) }}
      >
        <For each={props.spans}>{(span) => (
          <div
            class="absolute top-0 bottom-0 border-r border-black/40 opacity-70"
            data-testid="timeline-band"
            title={`${props.names[span.path] ?? `#${span.path + 1}`} · ${Math.round(span.end - span.start)} s`}
            style={{ left: pct(span.start, props.duration), width: pct(span.end - span.start, props.duration), background: colorHex(props.colors[span.path] ?? 0x38bdf8) }}
          />
        )}</For>
        <For each={props.toolChanges}>{(at) => <div class="absolute top-0 bottom-0 w-0.5 bg-white" data-testid="timeline-tool-change" title={t("cam.timeline.toolChange")} style={{ left: pct(at, props.duration) }} />}</For>
        <For each={props.markers}>{(m) => <div class={`absolute top-0 h-2 w-1.5 rounded-b ${m.severity === "error" ? "bg-red-500" : "bg-amber-400"}`} data-testid="timeline-marker" title={m.message} style={{ left: pct(m.seconds, props.duration) }} />}</For>
        <div class="absolute top-0 bottom-0 w-0.5 bg-yellow-300 shadow" data-testid="timeline-playhead" style={{ left: pct(props.seconds, props.duration) }} />
      </div>
      {button(t("cam.timeline.nextMove"), <ChevronRight size={14} />, () => props.onStepMove(1), "timeline-next-move")}
      {button(t("cam.timeline.nextOperation"), <ChevronsRight size={14} />, () => props.onStepOperation(1), "timeline-next-op")}
      <Show when={props.onAutoResumeChange}>{(change) => (
        <label class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] text-white/80" title={t("cam.timeline.autoResumeHint")}>
          <input type="checkbox" class="h-3.5 w-3.5 accent-blue-400" data-testid="timeline-auto-resume" aria-label={t("cam.timeline.autoResumeHint")}
            checked={props.autoResume === true} onChange={(event) => change()(event.currentTarget.checked)} />
          <span>{t("cam.timeline.autoResume")}</span>
        </label>
      )}</Show>
      <label class="flex items-center gap-1 text-[11px] text-white/80">
        <span>{t("cam.timeline.speed")}</span>
        <select aria-label={t("cam.timeline.speed")} class="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-white" value={String(props.rate)} onChange={(event) => props.onRate(Number(event.currentTarget.value))} data-testid="timeline-speed">
          <For each={RATES}>{(r) => <option value={String(r)}>{r}×</option>}</For>
        </select>
      </label>
      <Show when={props.duration > 0}>
        <output class="min-w-[4.5rem] text-right text-[11px] tabular-nums text-white/80">{Math.floor(props.seconds / 60)}:{String(Math.floor(props.seconds % 60)).padStart(2, "0")} / {Math.floor(props.duration / 60)}:{String(Math.floor(props.duration % 60)).padStart(2, "0")}</output>
      </Show>
    </div>
  )
}
