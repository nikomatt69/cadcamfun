/**
 * The left activity bar and the bottom status bar (spec 06-desktop-ui.md §1).
 *
 * The status bar is the spec's: units, snap state, cursor coordinates and sidecar
 * status. Everything it shows comes in as a prop so it can be rendered — and asserted
 * on — without booting a client.
 */
import { For, Show, type JSX } from "solid-js"
import Cpu from "lucide-solid/icons/cpu"
import FolderOpen from "lucide-solid/icons/folder-open"
import Library from "lucide-solid/icons/library"
import BookOpen from "lucide-solid/icons/book-open"
import Plug from "lucide-solid/icons/plug"
import Ruler from "lucide-solid/icons/ruler"
import SettingsIcon from "lucide-solid/icons/settings"
import Sparkles from "lucide-solid/icons/sparkles"
import Wallet from "lucide-solid/icons/wallet"
import { t, type Key } from "../../i18n/index.ts"
import { formatLength, type DisplayUnits } from "../../viewport/units.ts"
import { ACTIVITIES, type ActivityId } from "../../app/layout.ts"
import type { SidecarStatus } from "../state/context.ts"

const ICONS = {
  projects: FolderOpen,
  cad: Ruler,
  cam: Cpu,
  library: Library,
  manuals: BookOpen,
  costs: Wallet,
  ai: Sparkles,
  plugins: Plug,
  settings: SettingsIcon
} as const

export interface ActivityBarProps {
  readonly active: ActivityId
  readonly onSelect: (id: ActivityId) => void
}

/** Vertical strip of destinations; each entry is a real button, so it is tabbable. */
export function ActivityBar(props: ActivityBarProps): JSX.Element {
  return (
    <nav
      class="flex w-16 shrink-0 flex-col items-center gap-1 border-r rounded-b-lg border-[color:var(--ent-line)] bg-[color:var(--ent-surface)] py-2"
      aria-label={t("activity.label")}
    >
      <For each={ACTIVITIES}>
        {(activity) => {
          const Icon = ICONS[activity.id]
          const selected = (): boolean => props.active === activity.id
          return (
            <button
              type="button"
              class="flex w-14 flex-col items-center gap-0.5 rounded-[5px] px-1 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ent-accent)]"
              classList={{
                "bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)]": selected(),
                "text-[color:var(--ent-text-muted)] hover:bg-[color:var(--ent-hover)]": !selected()
              }}
              aria-current={selected() ? "page" : undefined}
              title={t(activity.labelKey as Key)}
              onClick={() => props.onSelect(activity.id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span class="text-xxs">{t(activity.labelKey as Key)}</span>
            </button>
          )
        }}
      </For>
    </nav>
  )
}

export interface StatusBarProps {
  readonly units: DisplayUnits
  readonly snapEnabled: boolean
  /** Cursor position in *millimetres*; converted here, once. */
  readonly cursor: { readonly x: number; readonly y: number } | undefined
  readonly sidecar: SidecarStatus
  readonly decimals: number
  readonly toolLabel?: string
  /** The save-state read-out, supplied by the shell (this module cannot import the project session without a cycle). */
  readonly saveSlot?: JSX.Element
}

export const sidecarKey = (status: SidecarStatus): Key => {
  switch (status) {
    case "starting":
      return "status.sidecarStarting"
    case "ready":
      return "status.sidecarReady"
    case "fake":
      return "status.sidecarFake"
    default:
      return "status.sidecarStopped"
  }
}

/** Bottom bar: units, snap, cursor coordinates, sidecar status. */
export function StatusBar(props: StatusBarProps): JSX.Element {
  const cursor = (): string => {
    const position = props.cursor
    if (position === undefined) return "—"
    return `${formatLength(position.x, props.units, props.decimals)}, ${formatLength(position.y, props.units, props.decimals)}`
  }
  return (
    <footer
      class="reference-native-statusbar flex h-7 shrink-0 items-center gap-4 border-t rounded-b-lg border-[color:var(--ent-line)] bg-[color:var(--ent-surface)] px-3 text-xs text-[color:var(--ent-text-muted)]"
      aria-label={t("status.label")}
    >
      <span>
        {/* Value only ("mm"), so the label is announced via sr-only. */}
        <span class="sr-only">{t("status.units")}: </span>
        {props.units}
      </span>
      <span>
        {t("status.snap")}: {props.snapEnabled ? t("shell.snapOn") : t("status.snapOff")}
      </span>
      <Show when={props.toolLabel !== undefined}>
        <span>
          {t("status.tool")}: {props.toolLabel}
        </span>
      </Show>
      {props.saveSlot}
      <span class="ml-auto font-mono">
        {t("status.cursor")}: {cursor()}
      </span>
      <span aria-live="polite">
        {t("status.sidecar")}: {t(sidecarKey(props.sidecar))}
      </span>
    </footer>
  )
}
