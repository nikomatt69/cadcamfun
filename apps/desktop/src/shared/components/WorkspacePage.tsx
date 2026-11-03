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
import { ArrowLeft, SlidersHorizontal } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { Motion } from "solid-motionone"
import { prefersReducedMotion } from "../ui/animated-section.tsx"
import { ModulePreview, type PreviewKind } from "../ui/stageshow/index.ts"
import { LoadingState } from "./screen-parts.tsx"
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
const CONTROL = "inline-flex h-7 items-center rounded-[5px] border text-xs font-medium transition-colors duration-150 disabled:opacity-45"
const SECONDARY = "border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] text-[color:var(--ent-text-muted)] hover:bg-[color:var(--ent-surface-subtle)] hover:text-[color:var(--ent-text)]"
const PRIMARY = "border-transparent bg-[color:var(--ent-action)] text-[color:var(--ent-action-text)] hover:bg-[color:var(--ent-action-hover)]"
const FIELD_BASE = "w-full min-h-7 rounded-[5px] border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-2.5 py-1 text-xs leading-[18px] text-[color:var(--ent-text)] outline-none transition-colors placeholder:text-[color:var(--ent-text-faint)] focus:border-[color:var(--ent-accent)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ent-accent)_22%,transparent)] disabled:bg-[color:var(--ent-surface-subtle)] disabled:text-[color:var(--ent-text-faint)]"
export const TOOLBAR_BUTTON = `workspace-button--secondary workstation-toolbar-button ${CONTROL} gap-1.5 px-2.5 ${SECONDARY}`
export const TOOLBAR_PRIMARY = `workspace-button--primary ${CONTROL} gap-1.5 px-2.5 ${PRIMARY}`
export const FIELD = FIELD_BASE
/** The same field as `FIELD`: one control height across the app (the larger variant was a second size nobody needed). */
export const INPUT = FIELD_BASE
export const LABEL = "mb-1 block text-[11px] font-medium text-[color:var(--ent-text-muted)]"
export const ICON_BUTTON = "inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-[color:var(--ent-text-muted)] transition-colors duration-150 hover:bg-[color:var(--ent-surface-inset)] hover:text-[color:var(--ent-text)] disabled:opacity-40"
/** Card surface — flat and bordered; workspace tokens own the radius. */
export const CARD = "workspace-card ui-card ui-card-default group flex flex-col overflow-hidden !p-0 transition-colors duration-150"
/** Panel surface — uses the same workspace tokens as the toolbar and cards. */
export const PANEL = "workspace-panel ui-card ui-card-default"
export const RAIL_LABEL = "mb-1 block text-[11px] font-medium text-[color:var(--ent-text-muted)]"
export const BADGE = "workspace-badge"
export const DANGER_BUTTON = `${CONTROL} justify-center px-3 border-transparent bg-[color:var(--ent-bad-solid)] text-[color:var(--ent-action-text)] hover:brightness-95`
export const CANCEL_BUTTON = `workspace-button--secondary ${CONTROL} justify-center px-3 ${SECONDARY}`
export const SUBMIT_BUTTON = `workspace-button--primary ${CONTROL} justify-center px-3 ${PRIMARY}`

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
  /** One sentence under the title: what this screen is for. */
  readonly description?: string
  /** A small uppercase label above the title. */
  readonly eyebrow?: string
  /** Buttons on the right of the toolbar. */
  readonly actions?: JSX.Element
  /** The left filter rail; omitted for pages without filters. */
  readonly rail?: JSX.Element
  /** Names the rail when it contains parameters or navigation instead of filters. */
  readonly railTitle?: string
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
          <div class="workspace-page__title workspace-page__heading ent-header__text">
            <Show when={props.eyebrow !== undefined}>
              <p class="ent-header__eyebrow">{props.eyebrow}</p>
            </Show>
            <h1 class="ent-header__title truncate">{props.title}</h1>
            <Show when={props.description !== undefined}>
              <p class="ent-header__description truncate">{props.description}</p>
            </Show>
          </div>
          <Show when={props.actions !== undefined}><div class="workspace-page__actions ent-header__actions">{props.actions}</div></Show>
        </Motion.div>

        <div class="workspace-page__body cam-workspace__body flex flex-1 overflow-hidden w-full">
          <Show when={props.rail !== undefined}>
            <aside class="workspace-page__rail cam-workspace__sidebar flex-shrink-0 h-full flex flex-col" data-open="true" aria-label={props.railTitle ?? t("workspace.filters")}>
              <div class="workspace-page__rail-card">
                <div class="workspace-page__rail-heading"><SlidersHorizontal size={14} aria-hidden="true" /><span>{props.railTitle ?? t("workspace.filters")}</span></div>
                {props.rail}
              </div>
            </aside>
          </Show>
          <Motion.div
            class="workspace-page__stage workspace-stage cam-workspace__stage flex-1 min-w-0 overflow-y-auto"
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
  return <LoadingState label={props.label} rows={3} />
}

/** The stage's error box, with an optional retry. */
export function StageError(props: { readonly message: string; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div class="workspace-alert" role="alert">
      <span class="min-w-0 break-words">{props.message}</span>
      <Show when={props.onRetry !== undefined}>
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => props.onRetry?.()}>{t("boot.retry")}</button>
      </Show>
    </div>
  )
}

/** The stage's empty card: an icon, a heading, a hint and optional actions. */
export function StageEmpty(props: {
  readonly icon: JSX.Element
  readonly title: string
  readonly hint: string
  /** A Stageshow illustration of what will fill this screen, shown instead of the icon tile. */
  readonly preview?: PreviewKind
  /** A page-specific scene, when the shared module previews cannot tell this screen's story. */
  readonly scene?: JSX.Element
  readonly children?: JSX.Element
}): JSX.Element {
  return (
    <div class="workspace-empty">
      <Show
        when={props.scene !== undefined}
        fallback={
          <Show when={props.preview !== undefined} fallback={<div class="workspace-empty__icon" aria-hidden="true">{props.icon}</div>}>
            <div class="workspace-empty__preview"><ModulePreview module={props.preview!} /></div>
          </Show>
        }
      >
        <div class="workspace-empty__preview">{props.scene}</div>
      </Show>
      <h3 class="mb-1 text-[13px] font-semibold text-[color:var(--ent-text)]">{props.title}</h3>
      <p class="mb-4 text-xs text-[color:var(--ent-text-muted)]">{props.hint}</p>
      <Show when={props.children !== undefined}><div class="workspace-empty__actions">{props.children}</div></Show>
    </div>
  )
}

/** The neutral banner at the top of a card, with the icon tile and optional corner badges. */
export function CardBanner(props: { readonly icon: JSX.Element; readonly badge?: string; readonly leftBadge?: string }): JSX.Element {
  return (
    <div class="relative flex h-[72px] items-center justify-center border-b border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)]">
      <div class="flex h-9 w-9 items-center justify-center rounded-[5px] border border-[color:var(--ent-line)] bg-[color:var(--ent-surface)] text-[color:var(--ent-accent)]">
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
              <h1 class="ent-header__title truncate">{props.title}</h1>
              <Show when={props.subtitle}><p class="ent-header__description truncate">{props.subtitle}</p></Show>
            </div>
          </div>
          <Show when={props.actions !== undefined}><div class="workspace-page__actions">{props.actions}</div></Show>
        </Motion.div>
        <div class="workspace-page__body cam-workspace__body flex flex-1 overflow-hidden w-full">
          <div class="workspace-page__stage workspace-stage cam-workspace__stage flex-1 min-w-0 overflow-y-auto">
            {props.children}
          </div>
        </div>
      </div>
      {props.overlays}
    </Motion.div>
  )
}
