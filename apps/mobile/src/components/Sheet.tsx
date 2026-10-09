/**
 * Bottom-anchored sheet — a temporary surface for one task (a PR detail, a confirmation).
 *
 * Spatial consistency (Apple §7): enters from the bottom and exits the same way it came.
 * Origin (Emil): modals keep `transform-origin: center bottom` (the spec exemption).
 *
 * The component mounts immediately with the dismissed state, then plays the WAAPI animation in
 * via `sheetIn()`. Closing reverses the path with `sheetOut()` and only unmounts when the
 * animation has finished — never lock out input during a transition (Apple §3).
 */
import { Show, createEffect, createSignal, on, onMount, type JSX } from "solid-js"
import { sheetIn, sheetOut } from "../lib/motion.ts"

export interface SheetProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly trailing?: JSX.Element
  readonly children: JSX.Element
  readonly /** Internal padding override, useful for sticky footers. */ bodyClass?: string
}

export const Sheet = (props: SheetProps): JSX.Element => {
  const [mounted, setMounted] = createSignal(false)
  let sheetEl: HTMLDivElement | undefined
  let scrimEl: HTMLDivElement | undefined

  // Present when open is true, dismiss + unmount when open flips to false.
  createEffect(on(() => props.open, async (open) => {
    if (open) {
      setMounted(true)
      // Wait one frame so the dismissed state has rendered before we animate in.
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      sheetIn(sheetEl ?? null, scrimEl ?? null)
    } else if (mounted()) {
      await sheetOut(sheetEl ?? null, scrimEl ?? null)
      setMounted(false)
    }
  }))

  onMount(() => {
    // If the component mounts already open (e.g. deep link), animate in on next tick.
    if (props.open) {
      requestAnimationFrame(() => sheetIn(sheetEl ?? null, scrimEl ?? null))
    }
  })

  return (
    <Show when={mounted()}>
      <div class="scrim" ref={scrimEl} onClick={() => props.onClose()} />
      <div
        class="sheet"
        ref={sheetEl}
        role="dialog"
        aria-modal="true"
        aria-label={props.title ?? "Dialog"}
        style={{ transform: "translateY(100%)" }}
      >
        <div class="sheet-grabber" aria-hidden="true" />
        <Show when={props.title}>
          <header class="sheet-header">
            <h2 class="t-headline">{props.title}</h2>
            <Show when={props.trailing}>{props.trailing}</Show>
          </header>
        </Show>
        <div class={`sheet-body${props.bodyClass ? ` ${props.bodyClass}` : ""}`}>
          {props.children}
        </div>
      </div>
    </Show>
  )
}