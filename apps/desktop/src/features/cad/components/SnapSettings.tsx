import { For, Show, type JSX } from "solid-js"
import { createSnap } from "../hooks/createSnap.ts"
import type { SnapType } from "../lib/enanchedSnapService.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { displayChord } from "../../../shared/keybindings/chord.ts"

/** Snapping on/off, the snap kinds, grid size and tolerance. */
export default function SnapSettings(): JSX.Element {
  const app = useApp()
  const snap = createSnap()
  /** The chord the user's keymap gives a snap command, shown as a tooltip and next to the kind. */
  /** Kinds that are relative to a start point: they only apply while something is drawn or moved from a point. */
  const NEEDS_START: ReadonlySet<string> = new Set(["perpendicular", "tangent", "parallel"])
  const chordOf = (id: string): string | undefined => {
    const chord = app.keys.keymap().entry(id)?.chords[0]
    return chord === undefined ? undefined : displayChord(chord, app.keys.platform)
  }
  const settings = snap.snapSettings
  return (
    <div class="sidebar-snap bg-white dark:bg-gray-800 rounded-md shadow-sm p-4">
      <h3 class="text-sm font-medium mb-2">{t("cad.snapSettings")}</h3>
      <div class="mb-3">
        <label class="flex items-center">
          <input type="checkbox" checked={settings().enabled} onChange={() => snap.updateSnapSettings({ enabled: !settings().enabled })} class="mr-2 h-4 w-4 rounded text-blue-600" />
          <span class="text-sm">{t("cad.enableSnapping")}</span>
          <Show when={chordOf("cad.snap.toggle")}>{(chord) => <kbd class="ml-2 text-[10px] text-gray-500">{chord()}</kbd>}</Show>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <For each={Object.entries(settings().types)}>{([type, enabled]) =>
          <label class="flex items-center">
            <input type="checkbox" checked={enabled} onChange={() => snap.toggleSnapType(type as SnapType)} disabled={!settings().enabled} class="mr-2 h-4 w-4 rounded text-blue-600" />
            <span class="text-xs" title={NEEDS_START.has(type) ? t("cad.snap.needsStart") : undefined} classList={{ "opacity-60": NEEDS_START.has(type) }}>{type}{NEEDS_START.has(type) ? " ↦" : ""}</span>
            <Show when={chordOf(`cad.snap.type.${type}`)}>{(chord) => <kbd class="ml-auto text-[10px] text-gray-500">{chord()}</kbd>}</Show>
          </label>}
        </For>
      </div>
      <div class="mt-3">
        <label class="block text-xs mb-1">{t("cad.snap.gridSize")}</label>
        <input type="range" min="1" max="50" value={settings().gridSize} onInput={(event) => snap.updateSnapSettings({ gridSize: Number(event.currentTarget.value) })} disabled={!settings().enabled} class="w-full" />
        <div class="flex justify-between text-xs text-gray-500"><span>1</span><span>{settings().gridSize}</span><span>50</span></div>
      </div>
      <div class="mt-3">
        <label class="block text-xs mb-1">{t("cad.snap.snapTolerance")}</label>
        <input type="range" min="1" max="20" value={settings().tolerance} onInput={(event) => snap.updateSnapSettings({ tolerance: Number(event.currentTarget.value) })} disabled={!settings().enabled} class="w-full" />
        <div class="flex justify-between text-xs text-gray-500"><span>1px</span><span>{settings().tolerance}px</span><span>20px</span></div>
      </div>
    </div>
  )
}
