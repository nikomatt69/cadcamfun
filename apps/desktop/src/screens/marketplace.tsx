/**
 * Marketplace — visual parity with .reference/src/pages/marketplace/*.
 *
 * Five views share this component: browse, item, purchases, seller, success.
 * Apple design principles throughout:
 * - Hero: translucent gradient + floating orbs, optical typography on the title
 * - Category pills: pointer-down feedback (Motion.press)
 * - Item grid: holographic cards with press/hover lift
 * - Reduced-motion fallback: opacity-only transitions
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import {
  Search,
  Filter,
  Grid3X3,
  List,
  Plus,
  TrendingUp,
  Users,
  Award,
  ArrowLeft,
  Download as DownloadIcon,
  Star,
  Package
} from "lucide-solid"
import { Card, InteractiveCard } from "../components/ui/card.tsx"
import { Button, IconButton } from "../components/ui/button.tsx"
import { AnimatedSection, FloatingOrbs, StaggerGroup } from "../components/ui/animated-section.tsx"
import { Badge, IconChip } from "../components/ui/badge.tsx"
import { Field, TextInput, Select } from "../components/ui/field.tsx"
import { Skeleton } from "../components/ui/feedback.tsx"
import { t } from "../i18n/index.ts"

interface Category { readonly id: string; readonly icon: string; readonly label: string }

const categories = (): ReadonlyArray<Category> => [
  { id: "components", icon: "🔧", label: t("marketplace.category.components") },
  { id: "drawings", icon: "📐", label: t("marketplace.category.drawings") },
  { id: "assemblies", icon: "⚙️", label: t("marketplace.category.assemblies") },
  { id: "gcode", icon: "🤖", label: t("marketplace.category.gcode") },
  { id: "toolpaths", icon: "🛠️", label: t("marketplace.category.toolpaths") }
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
  readonly gradient: string
}

const sampleItems = (): ReadonlyArray<ItemCardData> => [
  { id: "m1", title: "Hex Socket Cap Head M5", author: "StudioForge", price: 4.5, rating: 4.7, downloads: 1284, category: "components", emoji: "🔩", gradient: "ui-item-blue" },
  { id: "m2", title: "Pneumatic Cylinder 50mm", author: "Mechanica", price: 28.0, rating: 4.9, downloads: 392, category: "components", emoji: "🛢️", gradient: "ui-item-green" },
  { id: "m3", title: "Gear Set 24T/48T", author: "GearWorks", price: 12.0, rating: 4.5, downloads: 870, category: "assemblies", emoji: "⚙️", gradient: "ui-item-orange" },
  { id: "m4", title: "Aluminium Bracket 6061", author: "AlcoLab", price: 6.5, rating: 4.8, downloads: 1620, category: "components", emoji: "📐", gradient: "ui-item-purple" },
  { id: "m5", title: "CNC Pocket Toolpath — Demo", author: "ToolpathPro", price: 9.9, rating: 4.6, downloads: 421, category: "toolpaths", emoji: "🛠️", gradient: "ui-item-cyan" },
  { id: "m6", title: "GRBL Post-Processor Pack", author: "PostLab", price: 0, rating: 4.4, downloads: 3081, category: "gcode", emoji: "🤖", gradient: "ui-item-red" }
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

export function MarketplaceScreen(props: {
  readonly view?: "browse" | "item" | "purchases" | "seller" | "success"
  readonly id?: string
}): JSX.Element {
  const view = () => props.view ?? "browse"
  return (
    <div class="marketplace-page">
      <Show when={view() === "browse"}>
        <MarketplaceBrowse id={props.id} />
      </Show>
      <Show when={view() === "item"}>
        <MarketplaceItem id={props.id} />
      </Show>
      <Show when={view() === "purchases"}>
        <MarketplacePurchases />
      </Show>
      <Show when={view() === "seller"}>
        <MarketplaceSeller />
      </Show>
      <Show when={view() === "success"}>
        <MarketplaceSuccess />
      </Show>
    </div>
  )
}

/** ----- Browse: hero + categories + grid ----- */
function MarketplaceBrowse(props: { readonly id: string | undefined }): JSX.Element {
  void props.id
  const [search, setSearch] = createSignal("")
  const [category, setCategory] = createSignal<string | undefined>(undefined)
  const [sort, setSort] = createSignal("newest")
  const [view, setView] = createSignal<"grid" | "list">("grid")
  const items = createMemo(() => {
    let list = [...sampleItems()]
    const c = category()
    if (c !== undefined) list = list.filter((i) => i.category === c)
    const q = search().toLowerCase().trim()
    if (q !== "") list = list.filter((i) => i.title.toLowerCase().includes(q))
    return list
  })
  return (
    <>
      <MarketplaceHero search={search} setSearch={setSearch} />
      <CategoryRow current={category()} onChange={setCategory} />
      <AnimatedSection delay={0.05} class="marketplace-toolbar">
        <div class="marketplace-toolbar-row">
          <IconChip tone="blue"><Filter size={16} /></IconChip>
          <Select
            value={sort()}
            onChange={(event) => setSort(event.currentTarget.value)}
            class="marketplace-sort"
          >
            <For each={sortOptions()}>{(opt) => <option value={opt.id}>{opt.label}</option>}</For>
          </Select>
          <span class="marketplace-toolbar-count">{items().length} {t("marketplace.hero.stats.items").toLowerCase()}</span>
          <div class="marketplace-view-toggle" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={view() === "grid"}
              classList={{ "marketplace-view-active": view() === "grid" }}
              onClick={() => setView("grid")}
            >
              <Grid3X3 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view() === "list"}
              classList={{ "marketplace-view-active": view() === "list" }}
              onClick={() => setView("list")}
            >
              <List size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </AnimatedSection>
      <AnimatedSection delay={0.1} class="marketplace-section">
        <Show when={view() === "grid"}>
          <StaggerGroup class="marketplace-grid" delayStep={0.05}>
            <For each={items()}>{(item) => <ItemCard item={item} />}</For>
          </StaggerGroup>
        </Show>
        <Show when={view() === "list"}>
          <div class="marketplace-list">
            <For each={items()}>{(item) => <ItemListRow item={item} />}</For>
          </div>
        </Show>
      </AnimatedSection>
    </>
  )
}

/** ----- Hero ----- */
function MarketplaceHero(props: {
  readonly search: () => string
  readonly setSearch: (next: string) => void
}): JSX.Element {
  return (
    <section class="marketplace-hero">
      <FloatingOrbs count={4} />
      <div class="marketplace-hero-bg" aria-hidden="true" />
      <div class="marketplace-hero-content">
        <Motion.span
          class="marketplace-hero-eyebrow"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          ✦ {t("marketplace.hero.eyebrow")}
        </Motion.span>
        <Motion.h1
          class="ui-display marketplace-hero-title"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, easing: [0.22, 1, 0.36, 1] }}
        >
          {t("marketplace.hero.title")}
        </Motion.h1>
        <Motion.p
          class="marketplace-hero-subtitle"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, easing: [0.22, 1, 0.36, 1] }}
        >
          {t("marketplace.hero.subtitle")}
        </Motion.p>
        <Motion.div
          class="marketplace-hero-stats"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.26, easing: [0.22, 1, 0.36, 1] }}
        >
          <StatPill icon={TrendingUp} text={t("marketplace.hero.stats.items")} />
          <StatPill icon={Users} text={t("marketplace.hero.stats.designers")} />
          <StatPill icon={Award} text={t("marketplace.hero.stats.quality")} />
        </Motion.div>
        <Motion.form
          class="marketplace-hero-search"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.34, easing: [0.22, 1, 0.36, 1] }}
          onSubmit={(event) => event.preventDefault()}
        >
          <Search size={20} class="marketplace-hero-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={props.search()}
            onInput={(event) => props.setSearch(event.currentTarget.value)}
            placeholder={t("marketplace.hero.searchPlaceholder")}
            aria-label={t("marketplace.hero.searchPlaceholder")}
            class="marketplace-hero-search-input"
          />
        </Motion.form>
        <Motion.div
          class="marketplace-hero-actions"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.42, easing: [0.22, 1, 0.36, 1] }}
        >
          <Button variant="primary" size="lg">
            <Plus size={18} aria-hidden="true" />
            {t("marketplace.hero.sell")}
          </Button>
        </Motion.div>
      </div>
    </section>
  )
}

function StatPill(props: { readonly icon: typeof TrendingUp; readonly text: string }): JSX.Element {
  return (
    <span class="marketplace-stat-pill">
      <props.icon size={14} aria-hidden="true" />
      <span>{props.text}</span>
    </span>
  )
}

/** ----- Categories ----- */
function CategoryRow(props: { readonly current: string | undefined; readonly onChange: (next: string | undefined) => void }): JSX.Element {
  return (
    <section class="marketplace-categories">
      <div class="marketplace-category-row">
        <CategoryTile
          active={props.current === undefined}
          onClick={() => props.onChange(undefined)}
          icon="🌟"
          label={t("marketplace.category.all")}
        />
        <For each={categories()}>{(category) => (
          <CategoryTile
            active={props.current === category.id}
            onClick={() => props.onChange(category.id)}
            icon={category.icon}
            label={category.label}
          />
        )}</For>
      </div>
    </section>
  )
}

function CategoryTile(props: { readonly active: boolean; readonly onClick: () => void; readonly icon: string; readonly label: string }): JSX.Element {
  return (
    <Motion.button
      type="button"
      class="marketplace-category"
      classList={{ "marketplace-category-active": props.active }}
      onClick={props.onClick}
      press={{ scale: 0.97 }}
      hover={{ scale: 1.02 }}
      transition={{ duration: 0.2, easing: [0.22, 1, 0.36, 1] }}
    >
      <span class="marketplace-category-icon" aria-hidden="true">{props.icon}</span>
      <span class="marketplace-category-label">{props.label}</span>
    </Motion.button>
  )
}

/** ----- Item grid ----- */
function ItemCard(props: { readonly item: ItemCardData }): JSX.Element {
  const i = props.item
  return (
    <InteractiveCard
      href={`/marketplace/items/${i.id}`}
      variant="default"
      class={["marketplace-item-card", i.gradient].join(" ")}
    >
      <div class="marketplace-item-thumb" aria-hidden="true">
        <span class="marketplace-item-emoji">{i.emoji}</span>
      </div>
      <div class="marketplace-item-body">
        <Badge tone="info">{i.category}</Badge>
        <h3 class="ui-title marketplace-item-title">{i.title}</h3>
        <p class="ui-caption marketplace-item-author">{t("marketplace.item.by")} {i.author}</p>
        <div class="marketplace-item-meta">
          <span class="marketplace-item-rating">
            <Star size={14} aria-hidden="true" />
            {i.rating}
          </span>
          <span class="marketplace-item-downloads">
            <DownloadIcon size={14} aria-hidden="true" />
            {i.downloads}
          </span>
        </div>
      </div>
      <div class="marketplace-item-footer">
        <span class="marketplace-item-price">{i.price === 0 ? "Free" : `€${i.price.toFixed(2)}`}</span>
        <Button variant="primary" size="sm">
          <A href={`/marketplace/items/${i.id}`}>{t("marketplace.item.buy")}</A>
        </Button>
      </div>
    </InteractiveCard>
  )
}

function ItemListRow(props: { readonly item: ItemCardData }): JSX.Element {
  const i = props.item
  return (
    <InteractiveCard
      href={`/marketplace/items/${i.id}`}
      variant="default"
      class="marketplace-item-row"
    >
      <div class={["marketplace-item-thumb marketplace-item-thumb-sm", i.gradient].join(" ")} aria-hidden="true">
        <span class="marketplace-item-emoji">{i.emoji}</span>
      </div>
      <div class="marketplace-item-body">
        <h3 class="ui-title marketplace-item-title">{i.title}</h3>
        <p class="ui-caption marketplace-item-author">{t("marketplace.item.by")} {i.author}</p>
        <div class="marketplace-item-meta">
          <span class="marketplace-item-rating">
            <Star size={14} aria-hidden="true" />
            {i.rating}
          </span>
          <span class="marketplace-item-downloads">
            <DownloadIcon size={14} aria-hidden="true" />
            {i.downloads}
          </span>
        </div>
      </div>
      <div class="marketplace-item-footer">
        <span class="marketplace-item-price">{i.price === 0 ? "Free" : `€${i.price.toFixed(2)}`}</span>
        <Button variant="primary" size="sm">
          <A href={`/marketplace/items/${i.id}`}>{t("marketplace.item.buy")}</A>
        </Button>
      </div>
    </InteractiveCard>
  )
}

/** ----- Item detail ----- */
function MarketplaceItem(props: { readonly id: string | undefined }): JSX.Element {
  const item = () => sampleItems().find((i) => i.id === props.id) ?? sampleItems()[0]
  if (item() === undefined) return <NotFoundMarketplace />
  const i = item() as ItemCardData
  return (
    <div class="marketplace-page marketpace-item-page">
      <AnimatedSection>
        <A class="marketplace-back-link" href="/marketplace">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("marketplace.hero.title")}
        </A>
      </AnimatedSection>
      <div class="marketplace-item-detail">
        <Motion.div
          class={["marketplace-item-hero", i.gradient].join(" ")}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, easing: [0.22, 1, 0.36, 1] }}
        >
          <span class="marketplace-item-emoji marketplace-item-emoji-lg">{i.emoji}</span>
        </Motion.div>
        <Card variant="default" class="marketplace-item-info">
          <Badge tone="info">{i.category}</Badge>
          <h1 class="ui-headline marketplace-item-title-lg">{i.title}</h1>
          <p class="ui-caption marketplace-item-author">{t("marketplace.item.by")} {i.author}</p>
          <div class="marketplace-item-stats">
            <span class="marketplace-stat-pill"><Star size={14} aria-hidden="true" />{i.rating} {t("marketplace.item.rating")}</span>
            <span class="marketplace-stat-pill"><DownloadIcon size={14} aria-hidden="true" />{i.downloads} {t("marketplace.item.downloads")}</span>
          </div>
          <div class="marketplace-item-price-row">
            <span class="marketplace-item-price-lg">{i.price === 0 ? "Free" : `€${i.price.toFixed(2)}`}</span>
            <Button variant="primary" size="lg">{t("marketplace.item.buy")}</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

/** ----- Purchases ----- */
function MarketplacePurchases(): JSX.Element {
  const records = samplePurchases()
  return (
    <div class="marketplace-page-content">
      <AnimatedSection>
        <A class="marketplace-back-link" href="/marketplace">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("marketplace.hero.title")}
        </A>
      </AnimatedSection>
      <h1 class="ui-headline marketplace-page-title">{t("marketplace.purchases.title")}</h1>
      <Show when={records.length === 0}>
        <Card variant="default" class="marketplace-empty">
          <Package size={32} aria-hidden="true" />
          <p>{t("marketplace.purchases.empty")}</p>
        </Card>
      </Show>
      <StaggerGroup class="marketplace-purchases">
        <For each={records}>{(r) => (
          <Card variant="default" class="marketplace-purchase-row">
            <div class="marketplace-purchase-row-left">
              <h3 class="ui-title marketplace-item-title">{r.title}</h3>
              <p class="ui-caption">{r.date}</p>
            </div>
            <Badge tone={r.status === "completed" ? "success" : r.status === "pending" ? "warning" : "danger"}>{r.status}</Badge>
            <span class="marketplace-item-price">€{r.amount.toFixed(2)}</span>
          </Card>
        )}</For>
      </StaggerGroup>
    </div>
  )
}

/** ----- Seller dashboard ----- */
function MarketplaceSeller(): JSX.Element {
  const metrics = sellerMetrics()
  return (
    <div class="marketplace-page-content">
      <AnimatedSection>
        <A class="marketplace-back-link" href="/marketplace">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("marketplace.hero.title")}
        </A>
      </AnimatedSection>
      <h1 class="ui-headline marketplace-page-title">{t("marketplace.seller.title")}</h1>
      <p class="ui-subhead marketplace-page-subtitle">{t("marketplace.seller.metrics")}</p>
      <StaggerGroup class="marketplace-seller-grid" delayStep={0.05}>
        <For each={metrics}>{(m) => (
          <Card variant="holographic" class="marketplace-seller-card">
            <span class="ui-caption">{m.label}</span>
            <strong class="marketplace-seller-value">{m.value}</strong>
            <Badge tone="success">{m.change}</Badge>
          </Card>
        )}</For>
      </StaggerGroup>
    </div>
  )
}

/** ----- Purchase success ----- */
function MarketplaceSuccess(): JSX.Element {
  return (
    <div class="marketplace-page-content">
      <AnimatedSection>
        <Card variant="holographic" class="marketplace-success-card">
          <h1 class="ui-headline">{t("marketplace.success.title")}</h1>
          <p class="ui-body marketplace-success-warning">{t("marketplace.success.warning")}</p>
          <Button variant="primary">
            <A href="/marketplace/purchases">{t("marketplace.purchases.title")}</A>
          </Button>
        </Card>
      </AnimatedSection>
    </div>
  )
}

function NotFoundMarketplace(): JSX.Element {
  return <div class="marketplace-page-content">{t("marketplace.error")}</div>
}

// Suppress unused warnings.
void TextInput
void IconButton
void Skeleton
void Field