/**
 * The CAM-workspace page frame shared by the list-style pages (toolpaths, resources, projects, plugins, ...): a
 * glass toolbar capsule with the title and the page actions, an optional left filter rail, and a central stage.
 * It is the markup of `ToolpathsScreen` lifted into one place, so every page has the same chrome.
 */
import { Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { ArrowLeft } from "lucide-solid"
import { Motion } from "solid-motionone"
import "./workstation.css"

export const TOOLBAR_BUTTON = "workstation-toolbar-button inline-flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:border-slate-300/70 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:border-slate-600/50 disabled:opacity-50"
export const TOOLBAR_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 disabled:opacity-50"
export const FIELD = "w-full rounded-md border border-slate-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
export const INPUT = "w-full rounded-md border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-white"
export const LABEL = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
export const ICON_BUTTON = "rounded-md p-1.5 text-slate-500 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
/** Card surface — theme-coherent with `ui-card ui-card-default` from `styles/ui.css`. */
export const CARD = "ui-card ui-card-default group flex flex-col overflow-hidden !p-0 transition-all duration-200 hover:shadow-lg dark:hover:border-blue-400/40"
/** Panel surface — theme-coherent with `ui-card ui-card-default`. */
export const PANEL = "ui-card ui-card-default"
export const RAIL_LABEL = "mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
export const BADGE = "rounded-full bg-blue-100/80 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
export const DANGER_BUTTON = "rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
export const CANCEL_BUTTON = "rounded-md border border-slate-200/70 bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-sm backdrop-blur-sm hover:bg-white/90 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800/70"
export const SUBMIT_BUTTON = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"

export interface WorkspacePageProps {
  readonly title: string
  /** Buttons on the right of the toolbar. */
  readonly actions?: JSX.Element
  /** The left filter rail; omitted for pages without filters. */
  readonly rail?: JSX.Element
  readonly children: JSX.Element
  /** Modals and dialogs; rendered at the page root (outside the animated stage) so `fixed` overlays cover the page. */
  readonly overlays?: JSX.Element
}

export function WorkspacePage(props: WorkspacePageProps): JSX.Element {
  return (
    <Motion.div
      class="cam-workspace h-full w-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div class="cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div
          class="workstation-toolbar w-full flex flex-wrap items-center justify-between gap-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div class="ui-card ui-card-light flex w-max items-center !p-2">
            <h1 class="px-2 text-base font-semibold text-slate-900 dark:text-white">{props.title}</h1>
          </div>
          <Show when={props.actions !== undefined}><div class="flex flex-wrap items-center gap-2">{props.actions}</div></Show>
        </Motion.div>

        <div class="cam-workspace__body flex flex-1 overflow-hidden w-full">
          <Show when={props.rail !== undefined}>
            <aside class="cam-workspace__sidebar flex-shrink-0 mr-2 h-full flex flex-col" data-open="true" aria-label="Filters">
              <div class="ui-card ui-card-light flex flex-col gap-3 !p-3 overflow-y-auto">{props.rail}</div>
            </aside>
          </Show>
          <Motion.div class="cam-workspace__stage ui-card ui-card-default flex-1 min-w-0 overflow-y-auto !p-4" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.6 }}>
            {props.children}
          </Motion.div>
        </div>
      </div>
      {props.overlays}
    </Motion.div>
  )
}

/** The stage's loading line. */
export function StageLoading(props: { readonly label: string }): JSX.Element {
  return <p class="p-8 text-center text-sm text-slate-500 dark:text-slate-400" role="status">{props.label}</p>
}

/** The stage's error box, with an optional retry. */
export function StageError(props: { readonly message: string; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-red-200/70 bg-red-50/80 p-4 text-sm text-red-800 backdrop-blur-sm dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300" role="alert">
      <span class="min-w-0 break-words">{props.message}</span>
      <Show when={props.onRetry !== undefined}><button type="button" class={TOOLBAR_BUTTON} onClick={() => props.onRetry?.()}>Retry</button></Show>
    </div>
  )
}

/** The stage's empty card: an icon, a heading, a hint and optional actions. */
export function StageEmpty(props: { readonly icon: JSX.Element; readonly title: string; readonly hint: string; readonly children?: JSX.Element }): JSX.Element {
  return (
    <div class="ui-card ui-card-default mx-auto mt-10 max-w-md !p-10 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">{props.icon}</div>
      <h3 class="mb-2 text-lg font-medium text-slate-900 dark:text-white">{props.title}</h3>
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">{props.hint}</p>
      <Show when={props.children !== undefined}><div class="flex flex-wrap justify-center gap-2">{props.children}</div></Show>
    </div>
  )
}

/** The gradient banner at the top of a card, with the icon tile and optional corner badges. */
export function CardBanner(props: { readonly icon: JSX.Element; readonly badge?: string; readonly leftBadge?: string }): JSX.Element {
  return (
    <div class="relative flex h-20 items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 dark:from-blue-950/40 dark:via-sky-950/40 dark:to-cyan-950/40">
      <div class="ui-card ui-card-light flex !p-2.5 text-blue-600 dark:!bg-white/10 dark:text-blue-300">{props.icon}</div>
      <Show when={props.badge}><span class={`absolute right-2 top-2 backdrop-blur-sm ${BADGE}`}>{props.badge}</span></Show>
      <Show when={props.leftBadge}><span class="absolute left-2 top-2 rounded-full bg-emerald-100/80 px-2 py-0.5 text-xs font-semibold text-emerald-800 backdrop-blur-sm dark:bg-emerald-900/50 dark:text-emerald-300">{props.leftBadge}</span></Show>
    </div>
  )
}

export interface WorkspaceDetailProps {
  readonly title: string
  readonly subtitle?: string
  readonly backHref: string
  readonly backLabel: string
  /** Buttons on the right of the toolbar. */
  readonly actions?: JSX.Element
  readonly children: JSX.Element
  readonly overlays?: JSX.Element
  readonly testId?: string
}

/** The detail-page frame of the toolpaths detail: a toolbar with back, title and actions over a scrolling body. */
export function WorkspaceDetail(props: WorkspaceDetailProps): JSX.Element {
  return (
    <Motion.div class="cam-workspace h-full w-full flex flex-col overflow-hidden" data-testid={props.testId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div class="cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div class="workstation-toolbar w-full flex flex-wrap items-center justify-between gap-2" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
          <div class="flex min-w-0 items-center gap-3">
            <A href={props.backHref} class="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800/60" aria-label={props.backLabel}><ArrowLeft size={18} aria-hidden="true" /></A>
            <div class="min-w-0">
              <h1 class="truncate text-base font-semibold text-gray-900 dark:text-white">{props.title}</h1>
              <Show when={props.subtitle}><p class="text-xs text-gray-500 dark:text-gray-400">{props.subtitle}</p></Show>
            </div>
          </div>
          <Show when={props.actions !== undefined}><div class="flex flex-wrap items-center gap-2">{props.actions}</div></Show>
        </Motion.div>
        <div class="flex flex-1 min-h-0 flex-col overflow-y-auto p-4">{props.children}</div>
      </div>
      {props.overlays}
    </Motion.div>
  )
}
