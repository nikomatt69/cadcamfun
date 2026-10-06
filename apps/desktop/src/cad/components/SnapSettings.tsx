import { For, type JSX } from "solid-js"
import { createSnap } from "../hooks/createSnap.ts"
import type { SnapType } from "../lib/enanchedSnapService.ts"

/** Snapping on/off, the snap kinds, grid size and tolerance. */
export default function SnapSettings(): JSX.Element {
  const snap = createSnap()
  const settings = snap.snapSettings
  return (
    <div class="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4">
      <h3 class="text-sm font-medium mb-2">Snap Settings</h3>
      <div class="mb-3">
        <label class="flex items-center">
          <input type="checkbox" checked={settings().enabled} onChange={() => snap.updateSnapSettings({ enabled: !settings().enabled })} class="mr-2 h-4 w-4 rounded text-blue-600" />
          <span class="text-sm">Enable Snapping</span>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <For each={Object.entries(settings().types)}>{([type, enabled]) =>
          <label class="flex items-center">
            <input type="checkbox" checked={enabled} onChange={() => snap.toggleSnapType(type as SnapType)} disabled={!settings().enabled} class="mr-2 h-4 w-4 rounded text-blue-600" />
            <span class="text-xs">{type}</span>
          </label>}
        </For>
      </div>
      <div class="mt-3">
        <label class="block text-xs mb-1">Grid Size</label>
        <input type="range" min="1" max="50" value={settings().gridSize} onInput={(event) => snap.updateSnapSettings({ gridSize: Number(event.currentTarget.value) })} disabled={!settings().enabled} class="w-full" />
        <div class="flex justify-between text-xs text-gray-500"><span>1</span><span>{settings().gridSize}</span><span>50</span></div>
      </div>
      <div class="mt-3">
        <label class="block text-xs mb-1">Snap Tolerance</label>
        <input type="range" min="1" max="20" value={settings().tolerance} onInput={(event) => snap.updateSnapSettings({ tolerance: Number(event.currentTarget.value) })} disabled={!settings().enabled} class="w-full" />
        <div class="flex justify-between text-xs text-gray-500"><span>1px</span><span>{settings().tolerance}px</span><span>20px</span></div>
      </div>
    </div>
  )
}
