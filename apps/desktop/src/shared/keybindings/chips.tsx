import { For, type JSX } from "solid-js"
import { chordLabels, type Chord, type Platform } from "./chord.ts"

const KBD = "inline-flex min-w-[1.5rem] items-center justify-center rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"

/** One chord as key caps: `⇧ ⌘ Z` on macOS, `Ctrl Shift Z` elsewhere. */
export function ChordKeys(props: { readonly chord: Chord; readonly platform: Platform }): JSX.Element {
  return (
    <span class="inline-flex items-center gap-1" data-chord>
      <For each={chordLabels(props.chord, props.platform)}>{(label) => <kbd class={KBD}>{label}</kbd>}</For>
    </span>
  )
}
