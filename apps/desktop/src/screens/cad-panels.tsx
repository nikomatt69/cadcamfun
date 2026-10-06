import { For, Show, createMemo, createSignal } from "solid-js"
import { Schema } from "effect"
import { EntitySchema, type Entity, type Layer } from "@cadcamfun/core"
import { Copy, Trash2, Eye, EyeOff, Lock, Unlock, Plus, Layers, ChevronDown, ChevronRight, Search, MousePointer2 } from "lucide-solid"
import { useApp } from "../state/context.ts"
import { t, type Key } from "../i18n/index.ts"
import { CadButton, CadToolIcon } from "./cad-controls.tsx"

export function CadLayers() {
  const app = useApp()
  const [name, setName] = createSignal("")
  const [adding, setAdding] = createSignal(false)
  const [editing, setEditing] = createSignal<string>()
  const update = (id: string, patch: Partial<Layer>) => app.editor.apply({ label: t("cad.editLayer"), touched: [], apply: drawing => ({ ...drawing, layers: drawing.layers.map(layer => layer.id === id ? { ...layer, ...patch } : layer) }) })
  const add = () => {
    if (!name().trim()) return
    const layer: Layer = { id: crypto.randomUUID(), name: name().trim(), color: "#3b82f6", visible: true, locked: false }
    app.editor.apply({ label: t("cad.addLayer"), touched: [], apply: drawing => ({ ...drawing, layers: [...drawing.layers, layer] }) })
    setName(""); setAdding(false)
  }
  const remove = (id: string) => {
    const replacement = app.drawing().layers.find(layer => layer.id !== id)
    if (!replacement) return
    app.editor.apply({ label: t("cad.deleteLayer"), touched: app.drawing().entities.filter(entity => entity.layerId === id).map(entity => entity.id), apply: drawing => ({ ...drawing, layers: drawing.layers.filter(layer => layer.id !== id), entities: drawing.entities.map(entity => entity.layerId === id ? { ...entity, layerId: replacement.id } : entity) }) })
  }
  return <div class="cad-card">
    <div class="cad-panel-heading"><h3>{t("cad.layers")}</h3><CadButton label={t("cad.addLayer")} onClick={() => setAdding(true)}><Plus size={18} /></CadButton></div>
    <Show when={adding()}><form class="cad-stack" onSubmit={event => { event.preventDefault(); add() }}><input aria-label={t("cad.layerName")} placeholder={t("cad.layerName")} value={name()} onInput={event => setName(event.currentTarget.value)} /><div class="cad-actions"><button class="cad-primary" disabled={!name().trim()}>{t("cad.add")}</button><button type="button" class="cad-button" onClick={() => setAdding(false)}>{t("common.cancel")}</button></div></form></Show>
    <For each={app.drawing().layers}>{layer => <div class="cad-layer-row">
      <input type="color" aria-label={t("cad.layerColor")} value={layer.color} onInput={event => update(layer.id, { color: event.currentTarget.value })} />
      <Show when={editing() === layer.id} fallback={<button class="cad-layer-name" title={t("cad.renameLayer")} onClick={() => setEditing(layer.id)}>{layer.name}<small>{app.drawing().entities.filter(entity => entity.layerId === layer.id).length}</small></button>}>
        <input aria-label={t("cad.layerName")} value={layer.name} onChange={event => { if (event.currentTarget.value.trim()) update(layer.id, { name: event.currentTarget.value.trim() }); setEditing(undefined) }} onKeyDown={event => { if (event.key === "Enter" || event.key === "Escape") { event.currentTarget.blur(); setEditing(undefined) } }} />
      </Show>
      <CadButton label={t("cad.visibility")} active={layer.visible} onClick={() => update(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</CadButton>
      <CadButton label={t("cad.lock")} active={layer.locked} onClick={() => update(layer.id, { locked: !layer.locked })}>{layer.locked ? <Lock size={14} /> : <Unlock size={14} />}</CadButton>
      <CadButton label={t("cad.deleteLayer")} disabled={app.drawing().layers.length < 2} onClick={() => remove(layer.id)}><Trash2 size={14} /></CadButton>
    </div>}</For>
    <p class="cad-hint">{t("cad.layerDeleteHint")}</p>
  </div>
}

export function CadExplorer() {
  const app = useApp()
  const [query, setQuery] = createSignal("")
  const [grouped, setGrouped] = createSignal(true)
  const [collapsed, setCollapsed] = createSignal<readonly string[]>([])
  const entities = createMemo(() => app.drawing().entities.filter(entity => `${entity._tag} ${entity.id}`.toLowerCase().includes(query().toLowerCase())))
  const update = (id: string, patch: Partial<Pick<Entity, "visible" | "locked">>) => app.editor.apply({ label: t("cad.edit"), touched: [id], apply: drawing => ({ ...drawing, entities: drawing.entities.map(entity => entity.id === id ? { ...entity, ...patch } : entity) }) })
  const row = (entity: Entity) => <div class="cad-entity-row" classList={{ selected: app.editor.selection().includes(entity.id) }}>
    <button class="cad-entity-name" onClick={event => { const selection = app.editor.selection(); app.editor.setSelection(event.ctrlKey || event.metaKey || event.shiftKey ? selection.includes(entity.id) ? selection.filter(id => id !== entity.id) : [...selection, entity.id] : [entity.id]) }}>
      <CadToolIcon tool={entity._tag.toLowerCase()} size={16} /><span>{entity._tag}<small>{entity.id.slice(0, 6)}</small></span>
    </button>
    <CadButton label={t("cad.visibility")} onClick={() => update(entity.id, { visible: !entity.visible })}>{entity.visible ? <Eye size={14} /> : <EyeOff size={14} />}</CadButton>
    <CadButton label={t("cad.lock")} onClick={() => update(entity.id, { locked: !entity.locked })}>{entity.locked ? <Lock size={14} /> : <Unlock size={14} />}</CadButton>
  </div>
  return <div class="cad-card cad-explorer">
    <div class="cad-panel-heading"><h3>{t("cad.elementExplorer")}</h3><CadButton label={t("cad.clearSelection")} onClick={() => app.editor.setSelection([])}><MousePointer2 size={16} /></CadButton></div>
    <div class="cad-search"><Search size={15} /><input aria-label={t("cad.searchElements")} placeholder={t("cad.searchElements")} value={query()} onInput={event => setQuery(event.currentTarget.value)} /></div>
    <label class="cad-checkbox"><input type="checkbox" checked={grouped()} onChange={event => setGrouped(event.currentTarget.checked)} />{t("cad.groupByLayer")}</label>
    <Show when={entities().length} fallback={<p class="cad-empty">{t("cad.noElements")}</p>}>
      <Show when={grouped()} fallback={<For each={entities()}>{row}</For>}>
        <For each={app.drawing().layers}>{layer => <div class="cad-tree-group"><button class="cad-tree-heading" onClick={() => setCollapsed(ids => ids.includes(layer.id) ? ids.filter(id => id !== layer.id) : [...ids, layer.id])}>{collapsed().includes(layer.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<Layers size={15} style={{ color: layer.color }} /><span>{layer.name}</span><small>{entities().filter(entity => entity.layerId === layer.id).length}</small></button><Show when={!collapsed().includes(layer.id)}><For each={entities().filter(entity => entity.layerId === layer.id)}>{row}</For></Show></div>}</For>
      </Show>
    </Show>
    <p class="cad-hint">{t("cad.selectionHint")}</p>
  </div>
}

type Field = { path: readonly string[]; value: number | string; angle: boolean }
function fields(value: unknown, path: readonly string[] = []): Field[] {
  if (typeof value === "number" || typeof value === "string") return [{ path, value, angle: /angle|rotation/i.test(path.at(-1) ?? "") }]
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value).filter(([key]) => !["id", "layerId", "_tag", "userData", "lineStyle", "fontFamily"].includes(key)).flatMap(([key, child]) => fields(child, [...path, key]))
}
function patchAt(value: unknown, path: readonly string[], replacement: number | string): unknown {
  const [key, ...rest] = path
  if (!key) return replacement
  const object = value as Record<string, unknown>
  return { ...object, [key]: patchAt(object[key], rest, replacement) }
}

export function CadProperties() {
  const app = useApp()
  const [error, setError] = createSignal<string>()
  const selected = createMemo(() => app.drawing().entities.find(entity => entity.id === app.editor.selection()[0]))
  const locked = () => selected()?.locked || app.drawing().layers.find(layer => layer.id === selected()?.layerId)?.locked
  const update = (entity: Entity) => {
    try {
      const validated = Schema.decodeUnknownSync(EntitySchema)(entity)
      app.editor.apply({ label: t("cad.editProperties"), touched: [entity.id], apply: drawing => ({ ...drawing, entities: drawing.entities.map(item => item.id === entity.id ? validated : item) }) }); setError(undefined)
    } catch { setError(t("cad.invalidGeometry")) }
  }
  const duplicate = () => {
    const entity = selected(); if (!entity || locked()) return
    const copy = { ...entity, id: crypto.randomUUID() }
    app.editor.apply({ label: t("cad.duplicate"), touched: [copy.id], apply: drawing => ({ ...drawing, entities: [...drawing.entities, copy] }) }); app.editor.setSelection([copy.id])
  }
  const remove = () => {
    const entity = selected(); if (!entity || locked()) return
    app.editor.apply({ label: t("cad.deleteElement"), touched: [entity.id], apply: drawing => ({ ...drawing, entities: drawing.entities.filter(item => item.id !== entity.id) }) }); app.editor.setSelection([])
  }
  return <div class="cad-card"><h3>{t("cad.elementProperties")}</h3>
    <Show when={selected()} fallback={<div class="cad-empty"><MousePointer2 size={32} /><p>{t("cad.selectElement")}</p></div>}>{entity => <>
      <div class="cad-panel-heading"><span class="cad-badge">{entity()._tag}</span><div class="cad-actions"><CadButton label={t("cad.duplicate")} disabled={!!locked()} onClick={duplicate}><Copy size={16} /></CadButton><CadButton label={t("cad.deleteElement")} disabled={!!locked()} onClick={remove}><Trash2 size={16} /></CadButton></div></div>
      <Show when={locked()}><p class="cad-hint"><Lock size={14} />{t("cad.elementLocked")}</p></Show>
      <label class="cad-field"><span>{t("cad.layer")}</span><select disabled={!!locked()} value={entity().layerId} onChange={event => update({ ...entity(), layerId: event.currentTarget.value })}><For each={app.drawing().layers}>{layer => <option value={layer.id}>{layer.name}</option>}</For></select></label>
      <For each={fields(entity())}>{field => <label class="cad-field"><span>{field.path.map(part => t(`cad.field.${part}` as Key)).join(" / ")}<small>{typeof field.value === "number" ? field.angle ? t("cad.degrees") : t("cad.millimeters") : ""}</small></span><input disabled={!!locked()} type={typeof field.value === "number" ? "number" : "text"} step="0.1" value={typeof field.value === "number" && field.angle ? Number((field.value * 180 / Math.PI).toFixed(4)) : field.value} onChange={event => { const raw = event.currentTarget.value; if (typeof field.value === "number" && !raw.trim()) { setError(t("cad.invalidGeometry")); return } const value = typeof field.value === "number" ? Number(raw) * (field.angle ? Math.PI / 180 : 1) : raw; update(patchAt(entity(), field.path, value) as Entity) }} /></label>}</For>
      <label class="cad-checkbox"><input type="checkbox" disabled={!!locked()} checked={entity().visible} onChange={event => update({ ...entity(), visible: event.currentTarget.checked })} />{t("cad.visibility")}</label>
    </>}</Show>
    <Show when={error()}><p role="alert" class="cad-error">{error()}</p></Show>
  </div>
}
