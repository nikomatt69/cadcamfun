import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import {
  dimensionsOf, historyVolume, moveFeature, rebuild, removeFeature, removeParameter, renameParameter, resolveParameters, setDimension, setParameter, usesOf,
  type Feature, type History
} from "@cadcamfun/core"
import { useElementsStore, type Element } from "../store/elementsStore.ts"

const INPUT = "w-full px-2 py-1 border border-gray-300 rounded-md text-sm font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
const SMALL = "px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-40"

const STATUS: Readonly<Record<string, { readonly text: string; readonly tone: string }>> = {
  "fully-constrained": { text: "fully constrained", tone: "text-green-700" },
  "under-constrained": { text: "under-constrained", tone: "text-amber-700" },
  "over-constrained": { text: "over-constrained", tone: "text-amber-700" },
  conflicting: { text: "conflicting", tone: "text-red-700" },
  failed: { text: "failed", tone: "text-red-700" }
}

const format = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, ""))

/**
 * The editor of a `parametric` element: its parameters (numbers or formulas, with the value each resolves to), its feature
 * timeline with the dimensions of every feature, the state of every sketch, and what the history could not build. Every edit is
 * `elements.updateElement(id, { history })`, so it goes through the editor's undo, and the viewport and the CAM rebuild from the
 * new history. The logic is core's (`cad/history-edit.ts`); this only shows it.
 */
export default function ParametricPanel(props: { readonly element: Element; readonly locked: boolean }): JSX.Element {
  const elements = useElementsStore()
  const [error, setError] = createSignal("")
  const [newName, setNewName] = createSignal("")
  const [newValue, setNewValue] = createSignal("")
  const history = (): History => props.element["history"] as History
  const resolved = createMemo(() => resolveParameters(history().parameters))
  const built = createMemo(() => { try { return rebuild(history()) } catch { return undefined } })

  /** Applies an edit; a refused one (a name in use, a dimension that does not exist) is shown, not thrown. */
  const edit = (change: (h: History) => History): boolean => {
    try {
      elements.updateElement(props.element.id, { history: change(history()) })
      setError("")
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }
  const asValue = (text: string): number | string => { const t = text.trim(); return t !== "" && Number.isFinite(Number(t)) ? Number(t) : t }

  const addParameter = () => {
    const name = newName().trim()
    if (name === "" || newValue().trim() === "") { setError("A parameter needs a name and a value or formula"); return }
    if (edit((h) => setParameter(h, name, asValue(newValue())))) { setNewName(""); setNewValue("") }
  }

  const describe = (feature: Feature): string => {
    switch (feature.type) {
      case "sketch": return `sketch on ${feature.plane}`
      case "extrude": return `extrude ${feature.operation} from ${feature.sketch}`
      case "revolve": return `revolve ${feature.operation} from ${feature.sketch}`
      case "hole": return `hole on ${feature.plane}`
      case "pattern": return `${feature.kind} pattern of ${feature.feature}`
    }
  }

  return (
    <div class="mt-6 space-y-5 border-t border-gray-200 pt-4 dark:border-gray-600" data-testid="parametric-panel">
      <div>
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Parametric part</h4>
        <Show when={built()} fallback={<p class="text-sm text-red-600">The history could not be rebuilt.</p>}>{(result) =>
          <p class="text-xs text-gray-600 dark:text-gray-300" data-testid="parametric-summary">
            {result().bodies.length} solid{result().bodies.length === 1 ? "" : "s"}, {format(historyVolume(result()) / 1000)} cm³
          </p>}
        </Show>
        <Show when={error()}><p class="mt-1 text-xs text-red-600" role="alert">{error()}</p></Show>
      </div>

      <div>
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Parameters</h5>
        <div class="space-y-1">
          <For each={Object.entries(history().parameters)}>{([name, definition]) =>
            <div class="grid grid-cols-[6rem_1fr_auto] items-center gap-1" data-testid={`parameter-${name}`}>
              <button type="button" class="truncate text-left text-sm font-mono text-blue-700 hover:underline disabled:no-underline" title="Rename" disabled={props.locked}
                onClick={() => { const next = window.prompt(`Rename '${name}' to`, name); if (next && next !== name) edit((h) => renameParameter(h, name, next)) }}>{name}</button>
              <div>
                <input class={INPUT} value={String(definition)} disabled={props.locked} aria-label={`Parameter ${name}`}
                  onChange={(event) => edit((h) => setParameter(h, name, asValue(event.currentTarget.value)))} />
                <Show when={resolved().errors[name]} fallback={<Show when={typeof definition === "string"}><span class="text-xs text-gray-500">= {format(resolved().values[name] ?? NaN)}</span></Show>}>
                  <span class="text-xs text-red-600">{resolved().errors[name]}</span>
                </Show>
              </div>
              <button type="button" class={SMALL} disabled={props.locked} title={(() => { const u = usesOf(history(), name); return u.parameters.length + u.features.length > 0 ? `Used by ${[...u.parameters, ...u.features].join(", ")}` : "Delete" })()}
                onClick={() => edit((h) => removeParameter(h, name))}>✕</button>
            </div>}
          </For>
          <div class="grid grid-cols-[6rem_1fr_auto] items-center gap-1">
            <input class={INPUT} placeholder="name" value={newName()} onInput={(event) => setNewName(event.currentTarget.value)} disabled={props.locked} aria-label="New parameter name" />
            <input class={INPUT} placeholder="12 or width / 2" value={newValue()} onInput={(event) => setNewValue(event.currentTarget.value)} disabled={props.locked} aria-label="New parameter value"
              onKeyDown={(event) => { if (event.key === "Enter") addParameter() }} />
            <button type="button" class={SMALL} disabled={props.locked} onClick={addParameter}>Add</button>
          </div>
        </div>
      </div>

      <div>
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Features</h5>
        <ol class="space-y-3">
          <For each={history().features}>{(feature, index) =>
            <li class="rounded-md border border-gray-200 p-2 dark:border-gray-600" data-testid={`feature-${feature.id}`}>
              <div class="mb-1 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="text-sm font-medium">{feature.id}</span>
                  <span class="ml-2 text-xs text-gray-500">{describe(feature)}</span>
                  <Show when={feature.type === "sketch" ? built()?.sketches[feature.id] : undefined}>{(sketch) =>
                    <span class={`ml-2 text-xs ${STATUS[sketch().solve.status]?.tone ?? ""}`}>
                      {STATUS[sketch().solve.status]?.text ?? sketch().solve.status}{sketch().solve.dof > 0 ? `, ${sketch().solve.dof} free` : ""}
                    </span>}
                  </Show>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button type="button" class={SMALL} disabled={props.locked || index() === 0} onClick={() => edit((h) => moveFeature(h, feature.id, -1))} title="Earlier">↑</button>
                  <button type="button" class={SMALL} disabled={props.locked || index() === history().features.length - 1} onClick={() => edit((h) => moveFeature(h, feature.id, 1))} title="Later">↓</button>
                  <button type="button" class={SMALL} disabled={props.locked} title="Delete (with what depends on it)"
                    onClick={() => { if (window.confirm(`Delete ${feature.id} and what depends on it?`)) edit((h) => removeFeature(h, feature.id)) }}>✕</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                <For each={dimensionsOf(feature)}>{(dimension) =>
                  <label class="block text-xs text-gray-600 dark:text-gray-300">
                    <span class="block truncate" title={dimension.label}>{dimension.label}</span>
                    <input class={INPUT} value={String(dimension.value)} disabled={props.locked} aria-label={`${feature.id} ${dimension.label}`}
                      onChange={(event) => edit((h) => setDimension(h, feature.id, dimension.path, asValue(event.currentTarget.value)))} />
                  </label>}
                </For>
              </div>
            </li>}
          </For>
        </ol>
      </div>

      <Show when={(built()?.issues.length ?? 0) > 0}>
        <div data-testid="parametric-issues">
          <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Problems</h5>
          <ul class="space-y-1">
            <For each={built()?.issues ?? []}>{(issue) =>
              <li class={`text-xs ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`}><span class="font-medium">{issue.feature}</span>: {issue.message}</li>}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  )
}
