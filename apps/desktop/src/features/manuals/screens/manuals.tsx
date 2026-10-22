import { For, Show, createMemo, type JSX } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, Globe, Search, UserRound, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { openExternal } from "../../../app/external.ts"
import { isTauri } from "../../../app/sidecar.ts"
import { WorkspacePage, StageEmpty, PANEL, FIELD, RAIL_LABEL, TOOLBAR_BUTTON } from "../../../shared/components/WorkspacePage.tsx"
import { categories, findManuals, manuals, type ManualEntry } from "../lib/catalogue.ts"
import "../styles/manuals.css"

const PAGE_SIZE = 24
const publishers = [...new Set(manuals.map((entry) => entry.publisher))].sort((a, b) => a.localeCompare(b))
const manufacturers = ["FANUC", "HEIDENHAIN", "Siemens", "Mazak", "Haas Automation", "Okuma", "Grbl", "LinuxCNC"]
const counts = new Map(categories.map((category) => [category, manuals.filter((entry) => entry.category === category).length]))

function ManualCard(props: { readonly entry: ManualEntry }): JSX.Element {
  const entry = () => props.entry
  const source = () => new URL(entry().url).hostname.replace(/^www\./, "")
  const open = (event: MouseEvent) => {
    // Preserve modified clicks and link context menus; ordinary activation uses the native browser bridge.
    if (!isTauri() && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return
    event.preventDefault()
    openExternal(entry().url)
  }
  return <article class={`${PANEL} manual-card`} data-manual-id={entry().id}>
    <div class="manual-card-top"><span class="manual-kind">{t(`manuals.kind.${entry().kind}`)}</span><Show when={entry().access === "account"}><span class="manual-account"><UserRound size={12} aria-hidden="true" />{t("manuals.account")}</span></Show></div>
    <p class="manual-publisher">{entry().publisher}</p>
    <h2><a href={entry().url} target="_blank" rel="noopener noreferrer" onClick={open} aria-label={t("manuals.openTitle", { title: entry().title })}>{entry().title}</a></h2>
    <p class="manual-collection">{entry().collection}</p>
    <div class="manual-card-bottom">
      <span class="manual-language"><Globe size={12} aria-hidden="true" />{t(entry().language === "en" ? "manuals.english" : "manuals.multipleLanguages")}</span>
      <a class="manual-open" href={entry().url} target="_blank" rel="noopener noreferrer" onClick={open} aria-label={t("manuals.openTitle", { title: entry().title })}>{t("manuals.open")}<ExternalLink size={13} aria-hidden="true" /></a>
    </div>
    <span class="manual-source">{source()}</span>
  </article>
}

export default function ManualsScreen(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const query = () => typeof params.q === "string" ? params.q : ""
  const category = () => categories.find((value) => value === params.category) ?? ""
  const publisher = () => publishers.find((value) => value === params.publisher) ?? ""
  const results = createMemo(() => findManuals({ query: query(), category: category(), publisher: publisher() }))
  const pages = () => Math.max(1, Math.ceil(results().length / PAGE_SIZE))
  const page = () => Math.min(pages(), Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1))
  const visible = createMemo(() => results().slice((page() - 1) * PAGE_SIZE, page() * PAGE_SIZE))
  const filtered = () => !!(query() || category() || publisher())
  const filter = (values: { q?: string; category?: string; publisher?: string }) => setParams({ ...values, page: undefined }, { replace: true })
  const clear = () => setParams({ q: undefined, category: undefined, publisher: undefined, page: undefined }, { replace: true })

  return <section class="manuals-screen h-full" aria-label={t("manuals.title")}>
    <WorkspacePage title={t("manuals.title")}
      actions={<div class="ui-card ui-card-light manuals-stats !p-2"><BookOpen size={16} aria-hidden="true" /><span>{t("manuals.total", { count: manuals.length })}</span><small>{t("manuals.publishers", { count: publishers.length })}</small></div>}
      rail={<div class="manuals-filters">
        <h2 class={RAIL_LABEL}>{t("manuals.categories")}</h2>
        <nav aria-label={t("manuals.categories")}>
          <button type="button" aria-pressed={!category()} onClick={() => filter({ category: "" })}><span>{t("manuals.allTopics")}</span><span>{manuals.length}</span></button>
          <For each={categories}>{(value) => <button type="button" aria-pressed={category() === value} onClick={() => filter({ category: value })}><span>{t(`manuals.category.${value}`)}</span><span>{counts.get(value)}</span></button>}</For>
        </nav>
        <label class={RAIL_LABEL} for="manual-publisher">{t("manuals.publisher")}</label>
        <select class={FIELD} id="manual-publisher" value={publisher()} onChange={(event) => filter({ publisher: event.currentTarget.value })}><option value="">{t("manuals.allPublishers")}</option><For each={publishers}>{(name) => <option value={name}>{name}</option>}</For></select>
      </div>}>
      <p class="manuals-subtitle">{t("manuals.subtitle")}</p>
      <aside class="manuals-access-note"><Globe size={17} aria-hidden="true" /><div><strong>{t("manuals.onDemand")}</strong><p>{t("manuals.onDemandHint")}</p></div></aside>
      <nav class="manuals-manufacturers" aria-label={t("manuals.featured")}><For each={manufacturers}>{(name) => <button type="button" class={TOOLBAR_BUTTON} aria-pressed={publisher() === name} onClick={() => filter({ publisher: publisher() === name ? "" : name, category: "", q: "" })}>{name}</button>}</For></nav>
      <div class="manuals-content">
        <div class="manuals-search-row"><div class="manuals-search"><Search size={17} aria-hidden="true" /><input class={FIELD} type="search" aria-label={t("manuals.search")} placeholder={t("manuals.searchPlaceholder")} value={query()} onInput={(event) => filter({ q: event.currentTarget.value })} /><Show when={query()}><button type="button" aria-label={t("manuals.clear")} onClick={() => filter({ q: "" })}><X size={15} /></button></Show></div><Show when={filtered()}><button type="button" class={TOOLBAR_BUTTON} onClick={clear}>{t("manuals.clear")}</button></Show></div>
        <p class="manuals-result-count" role="status" aria-live="polite">{t("manuals.results", { count: results().length })}</p>
        <Show when={results().length > 0} fallback={<StageEmpty icon={<BookOpen size={30} aria-hidden="true" />} title={t("manuals.empty")} hint={t("manuals.emptyHint")}><button type="button" class={TOOLBAR_BUTTON} onClick={clear}>{t("manuals.clear")}</button></StageEmpty>}>
          <div class="manuals-grid"><For each={visible()}>{(entry) => <ManualCard entry={entry} />}</For></div>
          <Show when={pages() > 1}><nav class="manuals-pagination" aria-label={t("manuals.pagination")}><button type="button" class={TOOLBAR_BUTTON} disabled={page() === 1} onClick={() => setParams({ page: page() - 1 })}><ChevronLeft size={15} />{t("manuals.previous")}</button><span>{t("manuals.page", { page: page(), pages: pages() })}</span><button type="button" class={TOOLBAR_BUTTON} disabled={page() === pages()} onClick={() => setParams({ page: page() + 1 })}>{t("manuals.next")}<ChevronRight size={15} /></button></nav></Show>
        </Show>
      </div>
    </WorkspacePage>
  </section>
}
