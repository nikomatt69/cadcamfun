/**
 * What the layout is made of (spec 06-desktop-ui.md §1).
 *
 * The shell has four regions: an in-window title bar with a menu fallback, the left
 * activity bar, the main area (the router's outlet) and the bottom status bar. The
 * screen routes and the AI panel live in the main area's slots.
 */
import type { JSX } from "solid-js"
import type { Component } from "solid-js"

/** Destinations available from the shell and command palette. */
export type ActivityId = "projects" | "cad" | "cam" | "library" | "manuals" | "costs" | "ai" | "plugins" | "settings"

export interface Activity {
  readonly id: ActivityId
  readonly route: string
  /** i18n key for the label; never a literal in the component. */
  readonly labelKey: string
}

/** `ai` has no page of its own: it toggles the docked panel and stays on the last screen. */
export const ACTIVITIES: ReadonlyArray<Activity> = [
  { id: "projects", route: "/", labelKey: "activity.projects" },
  { id: "cad", route: "/cad", labelKey: "activity.cad" },
  { id: "cam", route: "/cam", labelKey: "activity.cam" },
  { id: "library", route: "/library", labelKey: "activity.library" },
  { id: "manuals", route: "/manuals", labelKey: "activity.manuals" },
  { id: "costs", route: "/costs", labelKey: "activity.costs" },
  { id: "ai", route: "/ai", labelKey: "activity.ai" },
  { id: "plugins", route: "/plugins", labelKey: "activity.plugins" },
  { id: "settings", route: "/settings", labelKey: "activity.settings" }
]

/** The route an activity id maps to; `ai` toggles the panel, so it has no page. */
export const routeOf = (id: ActivityId): string | undefined =>
  ACTIVITIES.find((a) => a.id === id)?.route

/**
 * Which activity is highlighted for a pathname. Longest-prefix match, so `/cad/x`
 * highlights CAD rather than the start screen.
 */
export const activeActivity = (pathname: string): ActivityId => {
  let best: Activity = ACTIVITIES[0]!
  for (const activity of ACTIVITIES) {
    if (activity.id === "ai") continue
    if (activity.route === "/") {
      if (pathname === "/") return activity.id
      continue
    }
    if (pathname === activity.route || pathname.startsWith(`${activity.route}/`)) {
      if (activity.route.length >= best.route.length) best = activity
    }
  }
  return best.id
}

/** The AI screen is a panel, not a route: `/ai` shows the panel over the last screen. */
export const isPanelRoute = (pathname: string): boolean => pathname === "/ai"

export type Region = "main" | "panel" | "palette"

/** Everything the layout renders, passed in so tests can mount pieces in isolation. */
export interface ShellSlots {
  /** The router's matched route. */
  readonly main: JSX.Element
  /** The docked streaming AI panel, or `undefined` when closed. */
  readonly panel?: JSX.Element
  /** The command palette overlay, or `undefined` when closed. */
  readonly palette?: JSX.Element
}

/** The layout's props: slots plus the signals the chrome reads. */
export interface ShellProps extends ShellSlots {
  readonly units: string
  readonly snapEnabled: boolean
  readonly toolLabel: string | undefined
  readonly cursor: { readonly x: number; readonly y: number } | undefined
  readonly sidecar: "starting" | "ready" | "fake" | "stopped"
  readonly onSelectActivity: (id: ActivityId) => void
  readonly onNewProject: () => void
  readonly onTogglePanel: () => void
  readonly onOpenPalette: () => void
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/** The region a keyboard shortcut belongs to, so the palette can group commands. */
export const shortcutRegion = (region: Region): string =>
  region === "main" ? "palette.group.edit" : `palette.group.${region}`

export type ShellComponent = Component<ShellProps>
