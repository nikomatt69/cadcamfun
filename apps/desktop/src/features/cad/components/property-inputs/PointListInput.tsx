import { For, Show, createSignal, type JSX } from "solid-js"
import { Edit2, Plus, Trash2 } from "lucide-solid"
import type { Vector3 } from "./Vector3Input.tsx"
import { NumberField } from "./NumberField.tsx"
import { PropertyEditorModal } from "./PropertyEditorModal.tsx"
import { t } from "../../../../i18n/index.ts"

interface PointListInputProps {
  readonly label: string
  readonly value?: Vector3[] | undefined
  onChange(points: Vector3[]): void
  readonly disabled?: boolean
  readonly minPoints?: number | undefined
  readonly maxPoints?: number | undefined
  readonly exactPoints?: number | undefined
}

const TRIGGER = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center gap-2 text-gray-700 dark:text-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1"
const COORD = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400"
const AXES = ["x", "y", "z"] as const

/** What the list shows: three decimals at most, no float noise. */
const show = (value: number | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0"

/**
 * Edits a list of 3D points. The editor opens as a centred modal over the whole window:
 * the list of points on the left, the coordinates of the selected one on the right.
 */
export function PointListInput(props: PointListInputProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [points, setPoints] = createSignal<Vector3[]>([])
  const [current, setCurrent] = createSignal<number | null>(null)
  const value = () => props.value ?? []
  const min = () => props.minPoints ?? 0

  const openDialog = () => {
    const list = [...value()]
    setPoints(list)
    // The first point is picked straight away, so the coordinates are there to be read.
    setCurrent(list.length > 0 ? 0 : null)
    setOpen(true)
  }
  const close = () => { setOpen(false); setCurrent(null) }

  /** Why the list cannot be saved yet. It is written in the dialog, never behind an alert. */
  const problem = (): string | undefined => {
    const count = points().length
    if (min() > 0 && count < min()) return `At least ${min()} points are needed (${count} now).`
    if (props.exactPoints !== undefined && count !== props.exactPoints) return `Exactly ${props.exactPoints} points are needed (${count} now).`
    if (props.maxPoints !== undefined && count > props.maxPoints) return `At most ${props.maxPoints} points are allowed (${count} now).`
    return undefined
  }

  const save = () => {
    if (problem() !== undefined) return
    props.onChange(points())
    close()
  }

  const add = () => {
    if (props.maxPoints !== undefined && points().length >= props.maxPoints) return
    const last = points()[points().length - 1]
    const next = last ? { x: last.x + 10, y: last.y, z: last.z } : { x: 0, y: 0, z: 0 }
    setCurrent(points().length)
    setPoints([...points(), next])
  }

  const remove = (index: number) => {
    setPoints(points().filter((_, i) => i !== index))
    const selected = current()
    if (selected === index) setCurrent(null)
    else if (selected !== null && selected > index) setCurrent(selected - 1)
  }

  const update = (index: number, axis: "x" | "y" | "z", next: number) =>
    setPoints(points().map((point, i) => (i === index ? { ...point, [axis]: next } : point)))

  return (
    <div class="mb-2">
      <div class={LABEL}>
        {props.label} ({value().length || 0} points)
        {min() > 0 && ` (min ${min()})`}
        {props.maxPoints !== undefined && ` (max ${props.maxPoints})`}
        {props.exactPoints !== undefined && ` (exactly ${props.exactPoints})`}
      </div>
      <button type="button" onClick={openDialog} disabled={props.disabled ?? false} class={TRIGGER} data-testid="edit-points">
        <span class="truncate">{t("cad.input.editPoints")}</span>
        <span class="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {value().length}
          <Edit2 size={16} />
        </span>
      </button>

      <PropertyEditorModal
        open={open()}
        onClose={close}
        onSave={save}
        title={t("cad.input.editPoints")}
        subtitle={`${props.label} · ${points().length} ${points().length === 1 ? "point" : "points"}`}
        error={problem()}
        saveDisabled={problem() !== undefined}
        saveLabel="Save points"
        size="lg"
      >
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="flex min-w-0 flex-col rounded-lg border border-gray-200 dark:border-gray-700">
            <header class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("cad.toolpanel.tool.point-cloud")}</h4>
              <button
                type="button"
                onClick={add}
                disabled={props.maxPoints !== undefined && points().length >= props.maxPoints}
                class="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Plus size={14} /> Add point
              </button>
            </header>
            <div class="max-h-[46vh] min-h-[6rem] overflow-y-auto p-2">
              <div class="flex items-center gap-1 px-2 pb-1">
                <span class="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("cad.input.point")}</span>
                <span class="grid min-w-0 flex-1 grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  <span>{t("cad.field.x")}</span>
                  <span>{t("cad.field.y")}</span>
                  <span>Z</span>
                </span>
                <span class="w-7 shrink-0" />
              </div>
              <For each={points()}>{(point, index) =>
                <div data-testid="point-row" class={`flex items-center gap-1 rounded-md border px-2 py-1.5 ${current() === index() ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/40" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <button type="button" onClick={() => setCurrent(index())} class="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span class="w-20 shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200">{t("cad.input.point")} {index() + 1}</span>
                    <span class="grid min-w-0 flex-1 grid-cols-3 gap-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                      <span class="truncate">{show(point?.x)}</span>
                      <span class="truncate">{show(point?.y)}</span>
                      <span class="truncate">{show(point?.z)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index())}
                    class="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                    title={`Remove point ${index() + 1}`}
                    aria-label={`Remove point ${index() + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>}
              </For>
              <Show when={points().length === 0}>
                <p class="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("cad.input.noPoints")}</p>
              </Show>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("cad.input.coordinates")}</h4>
            {/* The picked point is read from the signal, not from `Show`'s condition: point 1 is index 0, which is falsy. */}
            <Show when={current() !== null} fallback={
              <p class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("cad.input.pickPoint")}</p>
            }>
              <div class="space-y-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("cad.input.point")} {(current() ?? 0) + 1} of {points().length}</p>
                <div class="grid grid-cols-3 gap-2">
                  <For each={AXES}>{(axis) =>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{axis.toUpperCase()}</label>
                      <NumberField
                        label={`Point ${(current() ?? 0) + 1} ${axis.toUpperCase()}`}
                        value={points()[current() ?? 0]?.[axis] ?? 0}
                        onChange={(next) => update(current() ?? 0, axis, next)}
                        class={COORD}
                        step={0.1}
                      />
                    </div>}
                  </For>
                </div>
                <button
                  type="button"
                  onClick={() => remove(current() ?? 0)}
                  class="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-red-900/40"
                >
                  <Trash2 size={14} /> Remove point {(current() ?? 0) + 1}
                </button>
              </div>
            </Show>
          </section>
        </div>
      </PropertyEditorModal>
    </div>
  )
}
