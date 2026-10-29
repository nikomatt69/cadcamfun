/**
 * The thin one-line information strip under the CAD and CAM workspaces (the Fusion 360 / Creo status line).
 *
 * One row, never wrapping: every segment is `shrink-0`, the less important ones hide below a breakpoint
 * instead of squeezing the rest, and the whole strip clips rather than growing taller. Segments with an
 * `onClick` are real toggles (grid, axes, dimensions), the rest are read-outs with a tooltip.
 */
import { Show, type JSX } from "solid-js"
import { t } from "../../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { UNIT_TABLE, formatLength } from "../../viewport/units.ts"
import { sidecarKey } from "./status-bar.tsx"
import { projectSession } from "../../features/projects/lib/project-session.ts"
import { describeSave } from "../../features/projects/lib/save-status.ts"

const HIDE = { md: "hidden md:flex", lg: "hidden lg:flex", xl: "hidden xl:flex", "2xl": "hidden 2xl:flex" } as const
export type HideBelow = keyof typeof HIDE

const TONES = {
  neutral: "text-gray-200",
  blue: "text-blue-300",
  green: "text-green-300",
  amber: "text-amber-300",
  red: "text-red-400",
  cyan: "text-cyan-300",
  purple: "text-purple-300",
  muted: "text-gray-500"
} as const
export type Tone = keyof typeof TONES

export interface SegProps {
  readonly label?: string
  readonly value: JSX.Element
  readonly tone?: Tone
  readonly title?: string
  readonly hideBelow?: HideBelow
  readonly testId?: string
  readonly onClick?: () => void
  /** Pressed state of a toggle. */
  readonly pressed?: boolean
}

/** One read-out (or toggle) of the strip: a muted label and a tinted value. */
export function Seg(props: SegProps): JSX.Element {
  const cls = (): string => `${props.hideBelow ? HIDE[props.hideBelow] : "flex"} shrink-0 items-center gap-1`
  const body = (): JSX.Element => (
    <>
      <Show when={props.label}><span class="text-gray-500">{props.label}</span></Show>
      <span class={`${TONES[props.tone ?? "neutral"]} font-medium`}>{props.value}</span>
    </>
  )
  return (
    <Show
      when={props.onClick}
      fallback={<span class={cls()} title={props.title} data-testid={props.testId}>{body()}</span>}
    >
      <button
        type="button"
        class={`${cls()} rounded px-1 hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 ${props.pressed === false ? "opacity-50" : ""}`}
        title={props.title}
        aria-pressed={props.pressed}
        data-testid={props.testId}
        onClick={() => props.onClick?.()}
      >
        {body()}
      </button>
    </Show>
  )
}

/** Thin divider between groups. */
export const Sep = (): JSX.Element => <span class="h-3 w-px shrink-0 bg-gray-700" aria-hidden="true" />

/**
 * The strip itself: `left` and `center` flow from the start, `right` is pushed to the end.
 *
 * It is the bottom bar of the workspace, so its bottom corners are round like every other
 * bottom bar of the shell (the shell's own status bar and the activity bar): the window's
 * corner is far rounder than the workspace panels, and a square black bar running into it
 * reads as a bar that was sliced off.
 */
export function Strip(props: { readonly left: JSX.Element; readonly right?: JSX.Element; readonly label: string; readonly testId?: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-label={props.label}
      data-testid={props.testId}
      class="flex h-6 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-b-lg border-t border-gray-700 bg-[#1b1b1d] px-3 text-[11px] leading-none text-gray-300"
    >
      <div class="flex min-w-0 items-center gap-3 overflow-hidden">{props.left}</div>
      <Show when={props.right}><div class="ml-auto flex shrink-0 items-center gap-3">{props.right}</div></Show>
    </div>
  )
}

const LIGHT_TONES = {
  green: "text-green-700 dark:text-green-300", amber: "text-amber-700 dark:text-amber-300", blue: "text-blue-700 dark:text-blue-300",
  red: "text-red-700 dark:text-red-400", muted: "text-gray-500"
} as const

/**
 * Whether the open project's drawing and CAM program are saved, with the time of the last save; a click saves now.
 * `light` is for the shell's footer (light surface); the workspace strips are dark.
 */
export function SaveSeg(props: { readonly light?: boolean } = {}): JSX.Element {
  const app = useApp()
  const session = projectSession(app)
  const view = () => describeSave(session.summary())
  return (
    <Show when={view()}>
      {(shown) => (
        <Show
          when={props.light}
          fallback={<Seg value={shown().text} tone={shown().tone} title={shown().title} testId="status-save"
            {...(shown().saveable ? { onClick: () => { void session.saveInteractive() } } : {})} />}
        >
          <Show when={shown().saveable} fallback={<span class={LIGHT_TONES[shown().tone]} title={shown().title} data-testid="status-save">{shown().text}</span>}>
            <button type="button" class={`rounded px-1 hover:bg-gray-100 dark:hover:bg-gray-700 ${LIGHT_TONES[shown().tone]}`} title={shown().title} data-testid="status-save"
              onClick={() => { void session.saveInteractive() }}>{shown().text}</button>
          </Show>
        </Show>
      )}
    </Show>
  )
}

/** What the shell's footer shows on other pages: display units, snap and the sidecar state. */
export function ShellSegs(): JSX.Element {
  const app = useApp()
  const settings = () => app.settings.settings()
  const ready = (): boolean => app.sidecar() === "ready"
  return (
    <>
      <SaveSeg />
      <Seg label={t("cam.units")} value={UNIT_TABLE[settings().units].label} tone="amber" testId="status-units" />
      <Seg label={t("status.tolerance")} value={formatLength(settings().tolerance, settings().units, settings().decimals)} tone="cyan" title={t("status.toleranceTitle")} testId="status-tolerance" />
      <Seg label={t("status.snap")} value={settings().snapEnabled ? t("shell.snapOn") : t("status.snapOff")} tone={settings().snapEnabled ? "green" : "muted"} hideBelow="md" testId="status-snap" />
      <Seg label={t("status.sidecar")} value={t(sidecarKey(app.sidecar()))} tone={ready() ? "green" : "red"} testId="status-sidecar" />
    </>
  )
}
