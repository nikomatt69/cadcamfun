/**
 * iOS 27 floating glass tab bar — fixed at the bottom, centred, with the spring-powered
 * active-pill animation defined in `styles.css`.
 *
 * Why floating (not a full-width dock): the iPhone Dynamic Island + the home-indicator gesture
 * make a docked chrome feel cramped; the floating shape leaves the edge of the screen free and
 * lets the glass materialisation read.
 */
import { For, Show, type JSX } from "solid-js"
import type { Component } from "solid-js"

export interface TabItem<T extends string> {
  readonly id: T
  readonly label: string
  readonly icon: (props: { readonly size?: number }) => JSX.Element
  /** Unread count shown as a badge on the tab; `0` or absent renders no badge. */
  readonly badge?: number
}

export interface TabBarProps<T extends string> {
  readonly tabs: ReadonlyArray<TabItem<T>>
  readonly active: T
  readonly onChange: (id: T) => void
}

export function TabBar<T extends string>(props: TabBarProps<T>): JSX.Element {
  return (
    <nav class="tabs" role="tablist" aria-label="Project sections">
      <For each={props.tabs}>{(t) => (
        <button
          role="tab"
          aria-selected={props.active === t.id}
          classList={{ active: props.active === t.id }}
          onClick={() => {
            if (props.active !== t.id) props.onChange(t.id)
          }}
        >
          <t.icon size={22} />
          <span>{t.label}</span>
          <Show when={(t.badge ?? 0) > 0}>
            <span class="tab-badge" aria-label={`${t.badge} unread`}>
              {t.badge! > 99 ? "99+" : t.badge}
            </span>
          </Show>
        </button>
      )}</For>
    </nav>
  )
}

/** Re-export so callers can write `<Component />` and keep TS happy when needed. */
export type TabBarComponent<T extends string> = Component<TabBarProps<T>>