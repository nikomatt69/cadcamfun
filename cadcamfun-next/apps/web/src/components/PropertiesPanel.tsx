import { Exit, Schema } from "effect"
import { For, Show } from "solid-js"
import { Doc, Elements, type Element } from "@cadcamfun/core"
import { useEditor } from "../editor/store"
import { Field, NumberInput, Section } from "./ui"

const decodeElement = Schema.decodeUnknownExit(Elements.Element)
const skip = new Set(["_tag", "id", "layerId", "name", "color", "points", "closed"])
const isVec = (v: unknown): v is Record<"x" | "y" | "z", number> => typeof v === "object" && v !== null && "x" in v

export function PropertiesPanel() {
  const ed = useEditor()
  const single = () => (ed.selected().length === 1 ? ed.selected()[0] : undefined)

  const replace = (element: Element, patch: Record<string, unknown>) => {
    const exit = decodeElement({ ...element, ...patch })
    if (Exit.isFailure(exit)) return ed.notify("error", "Invalid value")
    ed.execute({ _tag: "ReplaceElement", element: exit.value })
  }

  return (
    <>
      <Show
        when={single()}
        fallback={
          <Section title="Selection">
            <p class="text-xs text-zinc-500">
              {ed.selection().size === 0
                ? "Nothing selected. Click a shape, or draw one."
                : `${ed.selection().size} elements selected`}
            </p>
          </Section>
        }
      >
        {(el) => (
          <Section title={el()._tag}>
            <Field label="Name">
              <input
                class="w-40 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100"
                value={el().name ?? ""}
                onChange={(e) => replace(el(), { name: e.currentTarget.value || undefined })}
              />
            </Field>
            <Field label="Layer">
              <select
                class="w-40 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100"
                value={el().layerId}
                onChange={(e) => replace(el(), { layerId: e.currentTarget.value })}
              >
                <For each={ed.doc().layers}>{(l) => <option value={l.id}>{l.name}</option>}</For>
              </select>
            </Field>
            <For each={Object.entries(el()).filter(([k]) => !skip.has(k))}>
              {([key, value]) => (
                <Show
                  when={isVec(value) && value}
                  fallback={
                    <Field label={key}>
                      <NumberInput value={value as number} onChange={(v) => replace(el(), { [key]: v })} />
                    </Field>
                  }
                >
                  {(vec) => (
                    <For each={Object.keys(vec()) as Array<"x" | "y" | "z">}>
                      {(axis) => (
                        <Field label={`${key}.${axis}`}>
                          <NumberInput
                            value={vec()[axis]}
                            onChange={(v) => replace(el(), { [key]: { ...vec(), [axis]: v } })}
                          />
                        </Field>
                      )}
                    </For>
                  )}
                </Show>
              )}
            </For>
            <Show when={el()._tag === "Polyline" && el()}>
              {(pl) => (
                <Field label="Closed">
                  <input
                    type="checkbox"
                    checked={(pl() as Elements.Polyline).closed}
                    onChange={(e) => replace(pl(), { closed: e.currentTarget.checked })}
                  />
                </Field>
              )}
            </Show>
            <div class="mt-1 grid grid-cols-2 gap-1 font-mono text-[11px] text-zinc-500">
              <span>area {Elements.area(el()).toFixed(2)}</span>
              <span>perim {Elements.perimeter(el()).toFixed(2)}</span>
            </div>
          </Section>
        )}
      </Show>
      <LayersPanel />
    </>
  )
}

function LayersPanel() {
  const ed = useEditor()
  const update = (id: string, patch: Record<string, unknown>) =>
    ed.execute({ _tag: "UpdateLayer", id: id as never, patch })
  return (
    <Section
      title="Layers"
      actions={
        <button
          class="text-xs text-[var(--accent)] hover:underline"
          onClick={() =>
            ed.execute({ _tag: "AddLayer", layer: Doc.makeLayer(`Layer ${ed.doc().layers.length + 1}`, "#f472b6") })
          }
        >
          + Add
        </button>
      }
    >
      <For each={ed.doc().layers}>
        {(layer) => (
          <div
            class="flex items-center gap-2 rounded px-1 py-0.5 text-xs"
            classList={{ "bg-zinc-800": ed.doc().activeLayerId === layer.id }}
          >
            <input
              type="color"
              class="h-4 w-4 cursor-pointer bg-transparent"
              value={layer.color}
              onChange={(e) => update(layer.id, { color: e.currentTarget.value })}
            />
            <button
              class="flex-1 truncate text-left text-zinc-200"
              onClick={() => ed.execute({ _tag: "SetActiveLayer", id: layer.id })}
            >
              {layer.name}
            </button>
            <button title="Visible" class="text-zinc-400" onClick={() => update(layer.id, { visible: !layer.visible })}>
              {layer.visible ? "👁" : "◌"}
            </button>
            <button title="Locked" class="text-zinc-400" onClick={() => update(layer.id, { locked: !layer.locked })}>
              {layer.locked ? "🔒" : "🔓"}
            </button>
            <Show when={ed.doc().layers.length > 1}>
              <button
                title="Delete layer"
                class="text-zinc-500 hover:text-red-400"
                onClick={() => ed.execute({ _tag: "RemoveLayer", id: layer.id })}
              >
                ✕
              </button>
            </Show>
          </div>
        )}
      </For>
    </Section>
  )
}
