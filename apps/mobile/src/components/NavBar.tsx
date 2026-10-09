/**
 * Sticky nav bar with optional large title.
 *
 * Two layouts:
 *  - `large`: Apple-style large title; shrinks to compact on scroll (the spec doesn't ship a
 *    scroll-listener for the sake of simplicity — the visual fidelity is what matters here).
 *  - `compact`: small centred title for secondary screens (PR detail, etc.)
 *
 * Material: backdrop-blurred glass over the page content. The bottom edge picks up a hairline of
 * the same translucent border that wraps every other glass surface in the app, so the page reads
 * as a single material system.
 */
import { Show, type JSX } from "solid-js"
import { ChevronLeft } from "./Icon.tsx"

export interface NavBarProps {
  readonly variant?: "large" | "compact"
  readonly title: string
  readonly back?: { readonly label?: string; readonly onClick: () => void }
  readonly trailing?: JSX.Element
}

export const NavBar = (props: NavBarProps): JSX.Element => (
  <header class={`nav nav-edge${props.variant === "large" ? " nav-large" : ""}`}>
    <Show when={props.variant === "large"} fallback={
      <Show when={props.back}>
        {(b) => (
          <button class="nav-back" onClick={b().onClick} aria-label="Back">
            <ChevronLeft size={22} />
            <Show when={b().label}>{b().label}</Show>
          </button>
        )}
      </Show>
    }>
      <div class="nav-actions">
        <Show when={props.back}>
          {(b) => (
            <button class="nav-back" onClick={b().onClick} aria-label="Back">
              <ChevronLeft size={22} />
              <Show when={b().label}>{b().label}</Show>
            </button>
          )}
        </Show>
      </div>
      <div class="nav-title-row">
        <h1 class="nav-title-large">{props.title}</h1>
        <Show when={props.trailing}>{props.trailing}</Show>
      </div>
    </Show>

    <Show when={props.variant === "compact"}>
      <Show when={props.back}>
        {(b) => (
          <button class="nav-back" onClick={b().onClick} aria-label="Back">
            <ChevronLeft size={22} />
            <Show when={b().label}>{b().label}</Show>
          </button>
        )}
      </Show>
      <div class="nav-title-compact">{props.title}</div>
      <div class="nav-actions" style={{ "min-width": "32px" }}>
        <Show when={props.trailing}>{props.trailing}</Show>
      </div>
    </Show>
  </header>
)