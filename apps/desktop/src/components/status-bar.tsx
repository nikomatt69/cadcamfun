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
import Plug from "lucide-solid/icons/plug"
import Ruler from "lucide-solid/icons/ruler"
import SettingsIcon from "lucide-solid/icons/settings"
import Sparkles from "lucide-solid/icons/sparkles"
import Wallet from "lucide-solid/icons/wallet"
import { t, type Key } from "../i18n/index.ts"
import { formatLength, type DisplayUnits } from "../viewport/units.ts"
import { ACTIVITIES, type ActivityId } from "../app/layout.ts"
import type { SidecarStatus } from "../state/context.ts"

const ICONS = {
  projects: FolderOpen,
  cad: Ruler,
  cam: Cpu,
  library: Library,
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
      class="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-800"
      aria-label={t("activity.label")}
    >
      <For each={ACTIVITIES}>
        {(activity) => {
          const Icon = ICONS[activity.id]
          const selected = (): boolean => props.active === activity.id
          return (
            <button
              type="button"
              class="flex w-14 flex-col items-center gap-0.5 rounded-md px-1 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              classList={{
                "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300": selected(),
                "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700": !selected()
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
}

const sidecarKey = (status: SidecarStatus): Key => {
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
      class="reference-native-statusbar flex h-7 shrink-0 items-center gap-4 border-t border-gray-200 bg-white px-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      aria-label={t("status.units")}
    >
      <span>
        <span class="sr-only">{t("status.units")}: </span>
        {props.units}
      </span>
      <span>
        <span class="sr-only">{t("status.snap")}: </span>
        {t("status.snap")}: {props.snapEnabled ? t("shell.snapOn") : t("status.snapOff")}
      </span>
      <Show when={props.toolLabel !== undefined}>
        <span>
          <span class="sr-only">{t("status.tool")}: </span>
          {t("status.tool")}: {props.toolLabel}
        </span>
      </Show>
      <span class="ml-auto font-mono">
        <span class="sr-only">{t("status.cursor")}: </span>
        {t("status.cursor")}: {cursor()}
      </span>
      <span aria-live="polite">
        <span class="sr-only">{t("status.sidecar")}: </span>
        {t("status.sidecar")}: {t(sidecarKey(props.sidecar))}
      </span>
    </footer>
  )
}
