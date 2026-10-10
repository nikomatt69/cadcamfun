/**
 * Marketplace, in the CAM workspace style shared with the toolpaths and resources pages.
 *
 * Five views share this component: browse (filter rail + card grid or table), item, purchases, seller, success.
 * The data is the local sample catalogue; the listing/purchase endpoints are not part of the v6 contract yet.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { Download as DownloadIcon, Grid3x3, List, Package, Plus, Receipt, Search, Star, Store, X } from "lucide-solid"
import {
  CARD, CardBanner, FIELD, PANEL, RAIL_LABEL, StageEmpty, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage
} from "../components/WorkspacePage.tsx"
import { t } from "../i18n/index.ts"

interface Category { readonly id: string; readonly label: string }

const categories = (): ReadonlyArray<Category> => [
  { id: "components", label: t("marketplace.category.components") },
  { id: "drawings", label: t("marketplace.category.drawings") },
  { id: "assemblies", label: t("marketplace.category.assemblies") },
  { id: "gcode", label: t("marketplace.category.gcode") },
  { id: "toolpaths", label: t("marketplace.category.toolpaths") }
]

interface SortOption { readonly id: string; readonly label: string }
const sortOptions = (): ReadonlyArray<SortOption> => [
  { id: "newest", label: t("marketplace.sort.newest") },
  { id: "priceLow", label: t("marketplace.sort.priceLow") },
  { id: "priceHigh", label: t("marketplace.sort.priceHigh") },
  { id: "rating", label: t("marketplace.sort.rating") },
  { id: "downloads", label: t("marketplace.sort.downloads") }
]

interface ItemCardData {
  readonly id: string
  readonly title: string
  readonly author: string
  readonly price: number
  readonly rating: number
  readonly downloads: number
  readonly category: string
  readonly emoji: string
}

const sampleItems = (): ReadonlyArray<ItemCardData> => [
  { id: "m1", title: "Hex Socket Cap Head M5", author: "StudioForge", price: 4.5, rating: 4.7, downloads: 1284, category: "components", emoji: "🔩" },
  { id: "m2", title: "Pneumatic Cylinder 50mm", author: "Mechanica", price: 28.0, rating: 4.9, downloads: 392, category: "components", emoji: "🛢️" },
  { id: "m3", title: "Gear Set 24T/48T", author: "GearWorks", price: 12.0, rating: 4.5, downloads: 870, category: "assemblies", emoji: "⚙️" },
  { id: "m4", title: "Aluminium Bracket 6061", author: "AlcoLab", price: 6.5, rating: 4.8, downloads: 1620, category: "components", emoji: "📐" },
  { id: "m5", title: "CNC Pocket Toolpath — Demo", author: "ToolpathPro", price: 9.9, rating: 4.6, downloads: 421, category: "toolpaths", emoji: "🛠️" },
  { id: "m6", title: "GRBL Post-Processor Pack", author: "PostLab", price: 0, rating: 4.4, downloads: 3081, category: "gcode", emoji: "🤖" }
]

interface PurchaseRecord {
  readonly id: string
  readonly title: string
  readonly status: "completed" | "pending" | "refunded"
  readonly amount: number
  readonly date: string
}
const samplePurchases = (): ReadonlyArray<PurchaseRecord> => [
  { id: "p1", title: "Hex Socket Cap Head M5", status: "completed", amount: 4.5, date: "2026-09-21" },
  { id: "p2", title: "Gear Set 24T/48T", status: "completed", amount: 12.0, date: "2026-09-15" }
]

interface SellerMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly change: string
}
const sellerMetrics = (): ReadonlyArray<SellerMetric> => [
  { id: "listings", label: "Active listings", value: "12", change: "+2" },
  { id: "sales", label: "Sales (30d)", value: "37", change: "+8" },
  { id: "revenue", label: "Revenue (30d)", value: "€218.50", change: "+€42" },
  { id: "rating", label: "Average rating", value: "4.7", change: "+0.1" }
]

const priceLabel = (price: number): string => (price === 0 ? "Free" : `€${price.toFixed(2)}`)
const PILL = "rounded-full bg-blue-100/80 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
const STATUS_PILL: Readonly<Record<PurchaseRecord["status"], string>> = {
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  refunded: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
}

export function MarketplaceScreen(props: {
  readonly view?: "browse" | "item" | "purchases" | "seller" | "success"
  readonly id?: string
}): JSX.Element {
  const view = () => props.view ?? "browse"
  return (
    <>
      <Show when={view() === "browse"}><MarketplaceBrowse /></Show>
      <Show when={view() === "item"}><MarketplaceItem id={props.id} /></Show>
      <Show when={view() === "purchases"}><MarketplacePurchases /></Show>
      <Show when={view() === "seller"}><MarketplaceSeller /></Show>
      <Show when={view() === "success"}><MarketplaceSuccess /></Show>
    </>
  )
}

const BACK = { backHref: "/marketplace", get backLabel() { return t("marketplace.hero.title") } } as const

/** ----- Browse: filter rail + card grid / table ----- */
function MarketplaceBrowse(): JSX.Element {
  const navigate = useNavigate()
  const [search, setSearch] = createSignal("")
  const [category, setCategory] = createSignal("")
  const [sort, setSort] = createSignal("newest")
  const [view, setView] = createSignal<"grid" | "list">("grid")
  const items = createMemo(() => {
    const needle = search().toLowerCase().trim()
    const list = sampleItems()
      .filter((item) => category() === "" || item.category === category())
      .filter((item) => needle === "" || `${item.title} ${item.author}`.toLowerCase().includes(needle))
    const by: Readonly<Record<string, (a: ItemCardData, b: ItemCardData) => number>> = {
      priceLow: (a, b) => a.price - b.price,
      priceHigh: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
      downloads: (a, b) => b.downloads - a.downloads
    }
    const compare = by[sort()]
    return compare === undefined ? [...list] : [...list].sort(compare)
  })
  const hasFilters = () => search() !== "" || category() !== ""
  const clearFilters = () => { setSearch(""); setCategory("") }
  const open = (item: ItemCardData): void => navigate(`/marketplace/items/${item.id}`)

  return (
    <WorkspacePage
      title={t("marketplace.hero.title")}
      actions={<>
        <A href="/marketplace/purchases" class={TOOLBAR_BUTTON}><Receipt size={16} aria-hidden="true" />{t("marketplace.purchases.title")}</A>
        <A href="/marketplace/seller/dashboard" class={TOOLBAR_BUTTON}><Store size={16} aria-hidden="true" />{t("marketplace.seller.title")}</A>
        <button type="button" class={TOOLBAR_PRIMARY}><Plus size={16} aria-hidden="true" />{t("marketplace.hero.sell")}</button>
      </>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>Search</span>
          <div class="relative">
            <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" name="search" class={`${FIELD} pl-8`} placeholder={t("marketplace.hero.searchPlaceholder")} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
          </div>
        </label>
        <label class="block">
          <span class={RAIL_LABEL}>Category</span>
          <select name="category" class={FIELD} value={category()} onChange={(event) => setCategory(event.currentTarget.value)}>
            <option value="">{t("marketplace.category.all")}</option>
            <For each={categories()}>{(entry) => <option value={entry.id}>{entry.label}</option>}</For>
          </select>
        </label>
        <label class="block">
          <span class={RAIL_LABEL}>Sort</span>
          <select name="sort" class={FIELD} value={sort()} onChange={(event) => setSort(event.currentTarget.value)}>
            <For each={sortOptions()}>{(option) => <option value={option.id}>{option.label}</option>}</For>
          </select>
        </label>
        <div class="flex items-center justify-between pt-1">
          <button type="button" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200" onClick={clearFilters} disabled={!hasFilters()}><X size={14} aria-hidden="true" />Clear Filters</button>
          <div class="flex overflow-hidden rounded-md border border-slate-200/70 dark:border-slate-700/50" role="group" aria-label="View">
            <button type="button" class={`p-1.5 ${view() === "grid" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" : "bg-white/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"}`} title="Grid View" aria-pressed={view() === "grid"} onClick={() => setView("grid")}><Grid3x3 size={16} aria-hidden="true" /></button>
            <button type="button" class={`p-1.5 ${view() === "list" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" : "bg-white/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"}`} title="List View" aria-pressed={view() === "list"} onClick={() => setView("list")}><List size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400" role="status">{items().length} of {sampleItems().length} {t("marketplace.hero.stats.items").toLowerCase()}</p>
      </>}
    >
      <Show
        when={items().length > 0}
        fallback={<StageEmpty icon={<Package size={24} aria-hidden="true" />} title="No items found" hint="No items match your search criteria."><button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>Clear filters</button></StageEmpty>}
      >
        <Show
          when={view() === "grid"}
          fallback={
            <div class="ui-card ui-card-default overflow-hidden !p-0">
              <table class="min-w-full divide-y divide-slate-200/70 dark:divide-slate-700/50">
                <thead class="bg-slate-50/70 dark:bg-slate-800/40">
                  <tr>
                    <For each={["Name", "Category", "Author", "Rating", "Downloads", "Price"]}>{(label) => <th scope="col" class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</th>}</For>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200/70 bg-white/60 dark:divide-slate-700/50 dark:bg-slate-900/30">
                  <For each={items()}>{(item) => (
                    <tr class="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10" onClick={() => open(item)}>
                      <td class="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900 dark:text-white"><span class="mr-2" aria-hidden="true">{item.emoji}</span>{item.title}</td>
                      <td class="whitespace-nowrap px-4 py-3"><span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{item.category}</span></td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{item.author}</td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{item.rating}</td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{item.downloads}</td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{priceLabel(item.price)}</td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={items()}>{(item) => (
              <div class={`${CARD} cursor-pointer`} role="link" tabIndex={0} onClick={() => open(item)} onKeyDown={(event) => { if (event.key === "Enter") open(item) }}>
                <CardBanner icon={<span class="text-2xl leading-7" aria-hidden="true">{item.emoji}</span>} badge={item.category} />
                <div class="flex flex-1 flex-col gap-2 p-4">
                  <h3 class="text-base font-semibold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">{item.title}</h3>
                  <p class="text-sm text-slate-600 dark:text-slate-400">{t("marketplace.item.by")} {item.author}</p>
                  <div class="mt-auto space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div class="flex justify-between"><span>{t("marketplace.item.rating")}:</span><span class={`inline-flex items-center gap-1 ${PILL}`}><Star size={12} aria-hidden="true" />{item.rating}</span></div>
                    <div class="flex justify-between"><span>{t("marketplace.item.downloads")}:</span><span class={`inline-flex items-center gap-1 ${PILL}`}><DownloadIcon size={12} aria-hidden="true" />{item.downloads}</span></div>
                  </div>
                </div>
                <div class="flex items-center justify-between border-t border-slate-200/60 bg-white/60 px-4 py-2.5 backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/40">
                  <span class="text-sm font-semibold text-slate-900 dark:text-white">{priceLabel(item.price)}</span>
                  <A href={`/marketplace/items/${item.id}`} class={TOOLBAR_PRIMARY} onClick={(event) => event.stopPropagation()}>{t("marketplace.item.buy")}</A>
                </div>
              </div>
            )}</For>
          </div>
        </Show>
      </Show>
    </WorkspacePage>
  )
}

/** ----- Item detail ----- */
function MarketplaceItem(props: { readonly id: string | undefined }): JSX.Element {
  const item = () => sampleItems().find((i) => i.id === props.id) ?? sampleItems()[0]
  return (
    <Show when={item()} fallback={<NotFoundMarketplace />}>{(i) => (
      <WorkspaceDetail title={i().title} subtitle={`${t("marketplace.item.by")} ${i().author}`} {...BACK}
        actions={<button type="button" class={TOOLBAR_PRIMARY}>{t("marketplace.item.buy")}</button>}
      >
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div class={`${PANEL} flex items-center justify-center md:col-span-1`}><span class="text-7xl" aria-hidden="true">{i().emoji}</span></div>
          <div class={`${PANEL} md:col-span-2`}>
            <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{i().category}</span>
            <h2 class="mt-3 text-xl font-bold text-slate-900 dark:text-white">{i().title}</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">{t("marketplace.item.by")} {i().author}</p>
            <div class="mt-5 grid grid-cols-3 gap-4">
              <div class="rounded-md bg-slate-50/70 p-3 backdrop-blur-sm dark:bg-slate-800/50"><h3 class="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">{t("marketplace.item.rating")}</h3><p class="font-medium text-slate-900 dark:text-white">{i().rating}</p></div>
              <div class="rounded-md bg-slate-50/70 p-3 backdrop-blur-sm dark:bg-slate-800/50"><h3 class="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">{t("marketplace.item.downloads")}</h3><p class="font-medium text-slate-900 dark:text-white">{i().downloads}</p></div>
              <div class="rounded-md bg-slate-50/70 p-3 backdrop-blur-sm dark:bg-slate-800/50"><h3 class="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">Price</h3><p class="font-medium text-slate-900 dark:text-white">{priceLabel(i().price)}</p></div>
            </div>
          </div>
        </div>
      </WorkspaceDetail>
    )}</Show>
  )
}

/** ----- Purchases ----- */
function MarketplacePurchases(): JSX.Element {
  const records = samplePurchases()
  return (
    <WorkspaceDetail title={t("marketplace.purchases.title")} {...BACK}>
      <Show when={records.length > 0} fallback={<StageEmpty icon={<Package size={24} aria-hidden="true" />} title={t("marketplace.purchases.title")} hint={t("marketplace.purchases.empty")} />}>
        <div class="flex flex-col gap-3">
          <For each={records}>{(r) => (
            <div class={`${PANEL} flex flex-wrap items-center justify-between gap-3`}>
              <div class="min-w-0">
                <h3 class="truncate text-base font-semibold text-slate-900 dark:text-white">{r.title}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">{r.date}</p>
              </div>
              <div class="flex items-center gap-3">
                <span class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[r.status]}`}>{r.status}</span>
                <span class="font-semibold text-slate-900 dark:text-white">€{r.amount.toFixed(2)}</span>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </WorkspaceDetail>
  )
}

/** ----- Seller dashboard ----- */
function MarketplaceSeller(): JSX.Element {
  return (
    <WorkspaceDetail title={t("marketplace.seller.title")} subtitle={t("marketplace.seller.metrics")} {...BACK}>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <For each={sellerMetrics()}>{(m) => (
          <div class={`${PANEL} flex flex-col gap-1`}>
            <span class="text-sm text-slate-500 dark:text-slate-400">{m.label}</span>
            <strong class="text-2xl font-bold text-slate-900 dark:text-white">{m.value}</strong>
            <span class="w-max rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{m.change}</span>
          </div>
        )}</For>
      </div>
    </WorkspaceDetail>
  )
}

/** ----- Purchase success ----- */
function MarketplaceSuccess(): JSX.Element {
  return (
    <WorkspaceDetail title={t("marketplace.success.title")} {...BACK}>
      <div class={`${PANEL} mx-auto mt-6 max-w-xl text-center`}>
        <h2 class="mb-2 text-xl font-bold text-slate-900 dark:text-white">{t("marketplace.success.title")}</h2>
        <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">{t("marketplace.success.warning")}</p>
        <A href="/marketplace/purchases" class={TOOLBAR_PRIMARY}>{t("marketplace.purchases.title")}</A>
      </div>
    </WorkspaceDetail>
  )
}

function NotFoundMarketplace(): JSX.Element {
  return <WorkspaceDetail title={t("marketplace.hero.title")} {...BACK}><p class="p-8 text-center text-sm text-slate-500 dark:text-slate-400" role="alert">{t("marketplace.error")}</p></WorkspaceDetail>
}
