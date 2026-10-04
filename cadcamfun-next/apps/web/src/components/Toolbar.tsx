import { For } from "solid-js"
import { useEditor, type ToolMode } from "../editor/store"
import { Button } from "./ui"

const tools: ReadonlyArray<{ mode: ToolMode; label: string; key: string; icon: string }> = [
  { mode: "select", label: "Select", key: "V", icon: "↖" },
  { mode: "pan", label: "Pan", key: "H", icon: "✋" },
  { mode: "line", label: "Line", key: "L", icon: "╱" },
  { mode: "rectangle", label: "Rectangle", key: "R", icon: "▭" },
  { mode: "circle", label: "Circle", key: "C", icon: "◯" },
  { mode: "polyline", label: "Polyline", key: "P", icon: "⌇" },
  { mode: "point", label: "Drill point", key: "D", icon: "⊕" },
]

export function Toolbar() {
  const ed = useEditor()
  return (
    <div class="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <For each={tools}>
        {(t) => (
          <Button active={ed.mode() === t.mode} title={`${t.label} (${t.key})`} onClick={() => ed.setMode(t.mode)}>
            <span class="w-4 text-center">{t.icon}</span>
            <span class="hidden lg:inline">{t.label}</span>
          </Button>
        )}
      </For>
      <span class="mx-2 h-5 w-px bg-zinc-800" />
      <Button title="Undo (Ctrl+Z)" disabled={!ed.canUndo()} onClick={ed.undo}>
        ↶
      </Button>
      <Button title="Redo (Ctrl+Shift+Z)" disabled={!ed.canRedo()} onClick={ed.redo}>
        ↷
      </Button>
      <Button title="Delete selection (Del)" disabled={ed.selection().size === 0} onClick={ed.removeSelected}>
        ✕
      </Button>
      <span class="mx-2 h-5 w-px bg-zinc-800" />
      <label class="flex items-center gap-1 text-xs text-zinc-400">
        <input type="checkbox" checked={ed.snap()} onChange={(e) => ed.setSnap(e.currentTarget.checked)} />
        Snap
      </label>
      <select
        class="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-200"
        value={ed.grid()}
        onChange={(e) => ed.setGrid(Number(e.currentTarget.value))}
      >
        <For each={[0.5, 1, 2, 5, 10, 25]}>
          {(g) => (
            <option value={g}>
              {g} {ed.doc().units}
            </option>
          )}
        </For>
      </select>
      <div class="ml-auto flex items-center gap-1">
        <Button active={!ed.view3d()} onClick={() => ed.setView3d(false)}>
          2D
        </Button>
        <Button active={ed.view3d()} onClick={() => ed.setView3d(true)}>
          3D
        </Button>
      </div>
    </div>
  )
}
