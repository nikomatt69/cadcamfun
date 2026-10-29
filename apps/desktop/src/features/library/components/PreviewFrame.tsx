import { t } from "../../../i18n/index.ts"
import { Show, type JSX } from "solid-js"
import { Maximize2 } from "lucide-solid"

/** The frame every resource 3D preview sits in: a heading, its actions, the stage and the orbit hint. */
export function PreviewFrame(props: {
  readonly title: string
  readonly testId?: string
  readonly onFit?: () => void
  readonly fitLabel?: string
  readonly actions?: JSX.Element
  readonly hint?: string
  readonly children: JSX.Element
}): JSX.Element {
  return <div data-testid={props.testId} class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-xs font-semibold text-slate-900 dark:text-white">{props.title}</h3>
      <div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        {props.actions}
        <Show when={props.onFit}>
          <button type="button" class="workstation-toolbar-button inline-flex h-7 items-center gap-1 rounded-[5px] border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => props.onFit?.()}>
            <Maximize2 size={12} aria-hidden="true" />{props.fitLabel ?? t("cam.resource.fit")}
          </button>
        </Show>
      </div>
    </div>
    {props.children}
    <Show when={props.hint}><p class="text-[10.5px] text-slate-500 dark:text-slate-400">{props.hint}</p></Show>
  </div>
}

/** The stage class shared by the previews: dark, rounded, bordered like the panels. */
export const PREVIEW_STAGE = "relative overflow-hidden rounded-[5px] border border-slate-200 bg-[#1b232c] dark:border-slate-700"

/** A message laid over the stage (no WebGL, empty geometry, partial geometry). */
export const stageNote = (tone: "info" | "warn"): string =>
  tone === "warn"
    ? "pointer-events-none absolute inset-x-4 bottom-4 rounded-[5px] border border-amber-500/40 bg-slate-900/90 p-2.5 text-center text-[11px] text-amber-200"
    : "pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-slate-300"
