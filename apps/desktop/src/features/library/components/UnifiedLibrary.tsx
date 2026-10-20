import { For, Show, createMemo, createSignal, createUniqueId, type JSX } from "solid-js"
import { AlertCircle, Book, Database, Filter, Grid3x3, HardDrive, Layers, List, Package, RefreshCw, Search, Star, Wrench, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useUnifiedLibrary, type LibraryEntityType, type LibraryItem, type LibrarySource, type MaterialLibraryItem, type ToolLibraryItem } from "../hooks/useUnifiedLibrary.ts"

const SOURCES = [
  { id: "api", label: "library.main", icon: Database },
  { id: "local", label: "library.local", icon: HardDrive },
  { id: "predefined", label: "library.standard", icon: Book }
] as const

export interface UnifiedLibraryProps<T extends LibraryItem> {
  readonly entityType: LibraryEntityType
  readonly onSelectItem?: (item: T) => void
  readonly onSaveItem?: (item: T) => void
  readonly showCloseButton?: boolean
  readonly onClose?: () => void
  readonly initialSource?: LibrarySource
}

export default function UnifiedLibrary<T extends LibraryItem>(props: UnifiedLibraryProps<T>): JSX.Element {
  const id = createUniqueId()
  const [search, setSearch] = createSignal("")
  const [view, setView] = createSignal<"grid" | "list">("grid")
  const [showFilters, setShowFilters] = createSignal(false)
  const [type, setType] = createSignal("")
  const [material, setMaterial] = createSignal("")
  const [tags, setTags] = createSignal("")
  const { items, isLoading, error, activeSource, setActiveSource, refreshLibrary, sourceStats } = useUnifiedLibrary<T>(props.entityType, props.initialSource ?? "api")
  const Icon = props.entityType === "components" ? Package : props.entityType === "materials" ? Layers : Wrench
  const hasFilters = () => Boolean(type() || material() || tags())
  const clear = (): void => { setSearch(""); setType(""); setMaterial(""); setTags("") }
  const types = createMemo(() => [...new Set(items().map((item) => item.type).filter((value): value is string => Boolean(value)))].sort())
  const materials = createMemo(() => props.entityType === "tools" ? [...new Set(items().map((item) => (item as unknown as ToolLibraryItem).material).filter(Boolean))].sort() : [])
  const filtered = createMemo(() => items().filter((item) => {
    const needle = search().trim().toLowerCase()
    const text = [item.name, item.description, item.type, ...(item.tags ?? []), props.entityType === "tools" ? (item as unknown as ToolLibraryItem).material : ""].join(" ").toLowerCase()
    return (!needle || text.includes(needle)) && (!type() || item.type === type()) && (!material() || (item as unknown as ToolLibraryItem).material === material()) && (!tags().trim() || item.tags?.some((tag) => tag.toLowerCase().includes(tags().trim().toLowerCase())))
  }))
  const facts = (item: T): string => {
    if (props.entityType === "tools") {
      const tool = item as unknown as ToolLibraryItem
      return [tool.type, tool.diameter != null ? `Ø ${tool.diameter} mm` : "", tool.material, tool.numberOfFlutes ? t("library.fluteCount", { count: tool.numberOfFlutes }) : ""].filter(Boolean).join(" · ")
    }
    if (props.entityType === "materials") {
      const value = item as unknown as MaterialLibraryItem
      return [item.type, value.density != null ? t("library.densityValue", { value: value.density }) : ""].filter(Boolean).join(" · ")
    }
    return item.type ?? ""
  }

  return (
    <div class="library-browser" data-testid={`unified-library-${props.entityType}`}>
      <header class="library-browser-toolbar">
        <div class="library-section-heading">
          <div><h3>{t(`library.heading.${props.entityType}`)}</h3><p>{t("library.description", { type: props.entityType })}</p></div>
          <Show when={props.showCloseButton && props.onClose}><button type="button" class="library-icon-button" aria-label={t("library.close")} onClick={() => props.onClose?.()}><X size={16} /></button></Show>
        </div>
        <div class="library-controls">
          <div class="library-search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" data-library-search aria-label={t("library.searchKind", { type: props.entityType })} placeholder={t("library.searchKind", { type: props.entityType })} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
            <Show when={search()}><button type="button" class="library-icon-button" aria-label={t("library.clear")} onClick={() => setSearch("")}><X size={14} /></button></Show>
          </div>
          <button type="button" class="library-control-button" aria-expanded={showFilters()} aria-controls={`${id}-filters`} data-active={showFilters() || hasFilters()} onClick={() => setShowFilters(!showFilters())}><Filter size={15} />{t("library.filters")}<Show when={hasFilters()}><span class="library-filter-dot" /></Show></button>
          <div class="library-view-switch" role="group" aria-label={t("library.view")}>
            <button type="button" class="library-icon-button" aria-label={t("library.grid")} title={t("library.grid")} aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={16} /></button>
            <button type="button" class="library-icon-button" aria-label={t("library.list")} title={t("library.list")} aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={16} /></button>
          </div>
          <button type="button" class="library-icon-button" onClick={() => void refreshLibrary()} disabled={isLoading()} aria-label={t("library.refresh")} title={t("library.refresh")}><RefreshCw size={16} class={isLoading() ? "library-spinner" : ""} /></button>
        </div>
        <div class="library-source-row">
          <div class="library-sources" role="group" aria-label={t("library.sources")}>
            <For each={SOURCES}>{(source) => <button type="button" data-source={source.id} aria-pressed={activeSource() === source.id} onClick={() => { clear(); setActiveSource(source.id) }}><source.icon size={14} aria-hidden="true" /><span>{t(source.label)}</span><span class="library-count">{sourceStats()[source.id]}</span></button>}</For>
          </div>
          <span class="library-result-count" role="status">{isLoading() ? t("library.loading") : t("library.items", { count: filtered().length })}</span>
        </div>
        <Show when={showFilters()}>
          <div id={`${id}-filters`} class="library-filters">
            <label>{t("library.type")}<select value={type()} onChange={(event) => setType(event.currentTarget.value)}><option value="">{t("library.allTypes")}</option><For each={types()}>{(value) => <option value={value}>{value}</option>}</For></select></label>
            <Show when={props.entityType === "tools"}><label>{t("library.material")}<select value={material()} onChange={(event) => setMaterial(event.currentTarget.value)}><option value="">{t("library.allMaterials")}</option><For each={materials()}>{(value) => <option value={value}>{value}</option>}</For></select></label></Show>
            <Show when={props.entityType === "components"}><label>{t("library.tags")}<input value={tags()} onInput={(event) => setTags(event.currentTarget.value)} placeholder={t("library.filterTags")} /></label></Show>
            <button type="button" class="library-text-button" onClick={clear}>{t("library.reset")}</button>
          </div>
        </Show>
      </header>
      <div class="library-results" aria-busy={isLoading()}>
        <Show when={!isLoading()} fallback={<div class="library-state" role="status"><RefreshCw size={24} class="library-spinner" /><h3>{t("library.loadingKind", { type: props.entityType })}</h3></div>}>
          <Show when={!error()} fallback={<div class="library-state" role="alert"><AlertCircle size={28} /><h3>{t("library.loadError")}</h3><p>{error()}</p><button type="button" class="library-control-button" onClick={() => void refreshLibrary()}>{t("library.retry")}</button></div>}>
            <Show when={filtered().length > 0} fallback={<div class="library-state"><div class="library-state-icon"><Icon size={26} /></div><h3>{t("library.emptyKind", { type: props.entityType })}</h3><p>{search() || hasFilters() ? t("library.emptySearch") : t("library.emptySource")}</p><Show when={search() || hasFilters()}><button type="button" class="library-control-button" onClick={clear}>{t("library.reset")}</button></Show></div>}>
              <div class={view() === "grid" ? "library-item-grid" : "library-item-list"}>
                <For each={filtered()}>{(item) => (
                  <article class="library-item">
                    <div class="library-item-preview"><Show when={props.entityType === "materials"} fallback={<Icon size={28} aria-hidden="true" />}><span class="library-material-swatch" style={{ "background-color": (item as unknown as MaterialLibraryItem).color || "#a1a1aa" }} /></Show></div>
                    <div class="library-item-body"><h4 title={item.name}>{item.name}</h4><Show when={facts(item)}><p class="library-item-facts">{facts(item)}</p></Show><Show when={item.description}><p class="library-item-description">{item.description}</p></Show><Show when={item.tags?.length}><div class="library-item-tags"><For each={item.tags?.slice(0, 3)}>{(tag) => <span>{tag}</span>}</For></div></Show></div>
                    <div class="library-item-actions"><button type="button" class="library-select-button" onClick={() => props.onSelectItem?.(item)}>{t("library.useItem")}</button><Show when={activeSource() !== "local" && props.onSaveItem}><button type="button" class="library-icon-button" aria-label={t("library.saveLocal")} title={t("library.saveLocal")} onClick={() => props.onSaveItem?.(item)}><Star size={16} /></button></Show></div>
                  </article>
                )}</For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
