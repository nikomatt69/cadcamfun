/**
 * The CAM-workspace page frame shared by the list-style pages (toolpaths, resources, projects, plugins, ...): a
 * compact toolbar with the title and the page actions, an optional left filter rail, and a central stage.
 * It is the markup of `ToolpathsScreen` lifted into one place, so every page has the same chrome.
 *
 * These pages are not the CAD or CAM editor: the `.workspace-page` marker scopes
 * `styles/workspace-page.css`, the flat workstation language of surfaces, type and
 * controls, while the editors keep their own panel / ribbon styling.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { ArrowLeft } from "lucide-solid"
import { Motion } from "solid-motionone"
import { prefersReducedMotion } from "../ui/animated-section.tsx"
import "../../styles/workstation.css"
import "../../styles/workspace-page.css"

/** Page entry motion — deliberately short: a workspace that eases in for a
 *  full second feels slow every time you navigate back to it. Motion runs on
 *  the Web Animations API, which the global CSS reduced-motion rule cannot
 *  reach, so the user preference is honoured here instead. */
const ENTER_DURATION = 0.22
const ENTER_DURATION_REDUCED = 0.12

/** Spread helper for the y-based entrances (page container, toolbars). */
const enter = (y: number, delay: number) =>
  prefersReducedMotion()
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: ENTER_DURATION_REDUCED, delay: 0 } }
    : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: ENTER_DURATION, delay } }

/**
 * The shared control set. Every page composes these instead of declaring its own
 * button / field / card strings, so a correction lands everywhere at once.
 */
export const TOOLBAR_BUTTON = "workstation-toolbar-button inline-flex h-[30px] items-center gap-1.5 rounded-[5px] border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
export const TOOLBAR_PRIMARY = "inline-flex h-[30px] items-center gap-1.5 rounded-[5px] border border-transparent bg-blue-600 px-2.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-45"
export const FIELD = "w-full rounded-[5px] border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900"
export const INPUT = "w-full rounded-[5px] border border-slate-300 bg-white px-3 py-2 text-[13px] leading-5 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900"
export const LABEL = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
export const ICON_BUTTON = "inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
/** Card surface — flat, bordered and 5 px, like the CAM resource cards. */
export const CARD = "workspace-card ui-card ui-card-default group flex flex-col overflow-hidden !p-0 transition-colors duration-150"
/** Panel surface — flat, bordered and 5 px, like the CAD/CAM inspector blocks. */
export const PANEL = "workspace-panel ui-card ui-card-default"
export const RAIL_LABEL = "mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
export const BADGE = "workspace-badge"
export const DANGER_BUTTON = "inline-flex h-[30px] items-center justify-center rounded-[5px] border border-transparent bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-45"
export const CANCEL_BUTTON = "inline-flex h-[30px] items-center justify-center rounded-[5px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
export const SUBMIT_BUTTON = "inline-flex h-[30px] items-center justify-center rounded-[5px] border border-transparent bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-45"

export interface WorkspaceTabItem<T extends string = string> {
  readonly id: T
  readonly label: string
  readonly icon?: JSX.Element
}

export interface WorkspaceTabsProps<T extends string> {
  readonly tabs: ReadonlyArray<WorkspaceTabItem<T>>
  readonly value: T
  readonly onChange: (id: T) => void
  /** Accessible name of the tab list. */
  readonly label: string
  readonly class?: string
}

/**
 * The one tab row of the workspace pages: a segmented strip with the active tab
 * underlined in the accent. It replaces the five bespoke tab implementations
 * (settings, organizations, profile, project detail, analytics).
 */
export function WorkspaceTabs<T extends string>(props: WorkspaceTabsProps<T>): JSX.Element {
  return (
    <div class={`workspace-tabs${props.class === undefined ? "" : ` ${props.class}`}`} role="tablist" aria-label={props.label}>
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.value === tab.id}
            class="workspace-tab"
            onClick={() => props.onChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}

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
      class="workspace-page cam-workspace h-full w-full flex flex-col overflow-hidden"
      {...enter(20, 0)}
    >
      <div class="workspace-page__frame cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div
          class="workspace-page__toolbar workstation-toolbar w-full flex flex-wrap items-center justify-between gap-2"
          {...enter(-20, 0)}
        >
          <div class="workspace-page__title flex min-w-0 items-center">
            <h1 class="truncate text-sm font-semibold text-slate-900 dark:text-white">{props.title}</h1>
          </div>
          <Show when={props.actions !== undefined}><div class="flex flex-wrap items-center gap-1.5">{props.actions}</div></Show>
        </Motion.div>

        <div class="workspace-page__body cam-workspace__body flex flex-1 overflow-hidden w-full">
          <Show when={props.rail !== undefined}>
            <aside class="workspace-page__rail cam-workspace__sidebar flex-shrink-0 h-full flex flex-col" data-open="true" aria-label="Filters">
              <div class="workspace-page__rail-card ui-card ui-card-light flex flex-col gap-3 overflow-y-auto">{props.rail}</div>
            </aside>
          </Show>
          <Motion.div
            class="workspace-page__stage workspace-stage cam-workspace__stage ui-card ui-card-default flex-1 min-w-0 overflow-y-auto"
            initial={prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion() ? ENTER_DURATION_REDUCED : ENTER_DURATION, delay: prefersReducedMotion() ? 0 : 0.04 }}
          >
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
  return <p class="py-8 text-center text-xs text-slate-500 dark:text-slate-400" role="status">{props.label}</p>
}

/** The stage's error box, with an optional retry. */
export function StageError(props: { readonly message: string; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div class="workspace-alert" role="alert">
      <span class="min-w-0 break-words">{props.message}</span>
      <Show when={props.onRetry !== undefined}>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => props.onRetry?.()}>Retry</button>
      </Show>
    </div>
  )
}

/** The stage's empty card: an icon, a heading, a hint and optional actions. */
export function StageEmpty(props: { readonly icon: JSX.Element; readonly title: string; readonly hint: string; readonly children?: JSX.Element }): JSX.Element {
  return (
    <div class="workspace-empty">
      <div class="workspace-empty__icon">{props.icon}</div>
      <h3 class="mb-1 text-[13px] font-semibold text-slate-900 dark:text-white">{props.title}</h3>
      <p class="mb-4 text-xs text-slate-500 dark:text-slate-400">{props.hint}</p>
      <Show when={props.children !== undefined}><div class="flex flex-wrap justify-center gap-2">{props.children}</div></Show>
    </div>
  )
}

/** The neutral banner at the top of a card, with the icon tile and optional corner badges. */
export function CardBanner(props: { readonly icon: JSX.Element; readonly badge?: string; readonly leftBadge?: string }): JSX.Element {
  return (
    <div class="relative flex h-[72px] items-center justify-center border-b border-slate-200 bg-slate-50 dark:border-slate-700/70 dark:bg-slate-800/40">
      <div class="flex h-9 w-9 items-center justify-center rounded-[5px] border border-slate-200 bg-white text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300">
        {props.icon}
      </div>
      <Show when={props.badge}><span class={`absolute right-2 top-2 ${BADGE}`}>{props.badge}</span></Show>
      <Show when={props.leftBadge}><span class="workspace-badge workspace-badge--ok absolute left-2 top-2">{props.leftBadge}</span></Show>
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

/** The detail-page frame: the same toolbar and stage card as the list pages, with a back link. */
export function WorkspaceDetail(props: WorkspaceDetailProps): JSX.Element {
  return (
    <Motion.div class="workspace-page workspace-detail cam-workspace h-full w-full flex flex-col overflow-hidden" data-testid={props.testId} {...enter(20, 0)}>
      <div class="workspace-page__frame cam-workspace__frame flex flex-col h-full w-full">
        <Motion.div class="workspace-page__toolbar workstation-toolbar w-full flex flex-wrap items-center justify-between gap-2" {...enter(-20, 0)}>
          <div class="workspace-page__title flex min-w-0 items-center gap-2">
            <A href={props.backHref} class="workspace-page__back" aria-label={props.backLabel}>
              <ArrowLeft size={16} aria-hidden="true" />
            </A>
            <div class="min-w-0">
              <h1 class="truncate text-sm font-semibold text-slate-900 dark:text-white">{props.title}</h1>
              <Show when={props.subtitle}><p class="text-[11px] text-slate-500 dark:text-slate-400">{props.subtitle}</p></Show>
            </div>
          </div>
          <Show when={props.actions !== undefined}><div class="flex flex-wrap items-center gap-1.5">{props.actions}</div></Show>
        </Motion.div>
        <div class="workspace-page__body cam-workspace__body flex flex-1 overflow-hidden w-full">
          <div class="workspace-page__stage workspace-stage cam-workspace__stage ui-card ui-card-default flex-1 min-w-0 overflow-y-auto">
            {props.children}
          </div>
        </div>
      </div>
      {props.overlays}
    </Motion.div>
  )
}
