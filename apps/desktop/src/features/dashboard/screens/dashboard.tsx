/**
 * Dashboard — shop status at a glance, in the same workstation language as
 * every other list page: `WorkspacePage` frame, `CARD` surfaces,
 * `TOOLBAR_*` actions, dense 12px type, tabular numerals.
 *
 * No hero card, no animations, no gradients — the toolbar already carries
 * the title and the primary actions.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import {
  Box,
  File,
  FolderOpen,
  Grid3X3,
  Layers,
  Plus,
  Wrench,
  ArrowUpRight
} from "lucide-solid"
import {
  BADGE,
  CARD,
  StageLoading,
  TOOLBAR_BUTTON,
  TOOLBAR_PRIMARY,
  WorkspacePage
} from "../../../shared/components/WorkspacePage.tsx"
import { t } from "../../../i18n/index.ts"

interface DashboardData {
  readonly projectsCount: number | undefined
  readonly drawingsCount: number | undefined
  readonly componentsCount: number | undefined
  readonly toolsCount: number | undefined
  readonly materialsCount: number | undefined
  readonly materialsLowStock: number | undefined
  readonly activeProjects: number | undefined
  readonly recentComponents: number | undefined
}

interface MetricData {
  readonly code: string
  readonly icon: typeof Box
  readonly label: string
  readonly value: number | undefined
  readonly meta: string
  readonly metaAlert: boolean
  readonly href: string
}

interface ModuleData {
  readonly index: string
  readonly title: string
  readonly subtitle: string
  readonly href: string
  readonly cta: string
  readonly icon: typeof Grid3X3
  readonly specs: ReadonlyArray<{ readonly k: string; readonly v: string }>
  readonly stat: string
}

export function DashboardScreen(props: { readonly data: DashboardData; readonly loading: boolean }): JSX.Element {
  const metrics = (): ReadonlyArray<MetricData> => [
    {
      code: "KPI·01",
      icon: Box,
      label: t("dashboard.metric.components"),
      value: props.data.componentsCount,
      meta: `${props.data.recentComponents ?? "—"} ${t("dashboard.metric.recentSuffix")}`,
      metaAlert: false,
      href: "/components"
    },
    {
      code: "KPI·02",
      icon: File,
      label: t("dashboard.metric.projects"),
      value: props.data.projectsCount,
      meta: `${props.data.activeProjects ?? "—"} ${t("dashboard.metric.activeSuffix")}`,
      metaAlert: false,
      href: "/projects"
    },
    {
      code: "KPI·03",
      icon: Wrench,
      label: t("dashboard.metric.tools"),
      value: props.data.toolsCount,
      meta: t("dashboard.metric.toolsMeta"),
      metaAlert: false,
      href: "/tools"
    },
    {
      code: "KPI·04",
      icon: Layers,
      label: t("dashboard.metric.materials"),
      value: props.data.materialsCount,
      meta:
        props.data.materialsLowStock !== undefined && props.data.materialsLowStock > 0
          ? `${props.data.materialsLowStock} ${t("dashboard.metric.lowStockSuffix")}`
          : t("dashboard.metric.stockOk"),
      metaAlert: props.data.materialsLowStock !== undefined && props.data.materialsLowStock > 0,
      href: "/materials"
    }
  ]

  const modules = (): ReadonlyArray<ModuleData> => [
    {
      index: "01",
      title: t("dashboard.module.cad.title"),
      subtitle: t("dashboard.module.cad.subtitle"),
      href: "/cad",
      cta: t("dashboard.module.cad.cta"),
      icon: Grid3X3,
      specs: [
        { k: t("dashboard.spec.kernel"), v: t("dashboard.spec.cadKernel") },
        { k: t("dashboard.spec.units"), v: t("dashboard.spec.unitsValue") },
        { k: t("dashboard.spec.exchange"), v: t("dashboard.spec.cadExchange") }
      ],
      stat: `${props.data.componentsCount ?? "—"} ${t("dashboard.metric.components").toLowerCase()}`
    },
    {
      index: "02",
      title: t("dashboard.module.cam.title"),
      subtitle: t("dashboard.module.cam.subtitle"),
      href: "/cam",
      cta: t("dashboard.module.cam.cta"),
      icon: Wrench,
      specs: [
        { k: t("dashboard.spec.strategy"), v: t("dashboard.spec.camStrategy") },
        { k: t("dashboard.spec.post"), v: t("dashboard.spec.camPost") },
        { k: t("dashboard.spec.output"), v: t("dashboard.spec.camOutput") }
      ],
      stat: `${props.data.toolsCount ?? "—"} ${t("dashboard.metric.tools").toLowerCase()}`
    },
    {
      index: "03",
      title: t("dashboard.module.projects.title"),
      subtitle: t("dashboard.module.projects.subtitle"),
      href: "/projects",
      cta: t("dashboard.module.projects.cta"),
      icon: File,
      specs: [
        { k: t("dashboard.system.activeProjects"), v: String(props.data.activeProjects ?? "—") },
        { k: t("dashboard.metric.projects"), v: String(props.data.projectsCount ?? "—") },
        { k: t("dashboard.quick.drawings"), v: String(props.data.drawingsCount ?? "—") }
      ],
      stat: `${props.data.activeProjects ?? "—"} ${t("dashboard.metric.activeSuffix")}`
    }
  ]

  return (
    <WorkspacePage
      title={t("shell.dashboard")}
      actions={<>
        <A href="/projects" class={TOOLBAR_BUTTON}>
          <FolderOpen size={14} aria-hidden="true" />
          {t("dashboard.hero.cta.browse")}
        </A>
        <A href="/projects/create" class={TOOLBAR_PRIMARY}>
          <Plus size={14} aria-hidden="true" />
          {t("dashboard.hero.cta.start")}
        </A>
      </>}
    >
      <div class="dash" aria-busy={props.loading}>
        <Show when={props.loading}>
          <StageLoading label={t("dashboard.loading")} />
        </Show>

        <section class="dash-open" aria-label={t("dashboard.hero.eyebrow")}>
          <div class="dash-open-top">
            <span class="dash-dot" aria-hidden="true" />
            <span class="dash-open-eyebrow">{t("dashboard.hero.eyebrow")}</span>
            <span class="dash-statusline-sep" aria-hidden="true">·</span>
            <span class="dash-statusline-dim">{t("dashboard.hero.env")}</span>
            <span class="dash-statusline-spacer" aria-hidden="true" />
            <span class={BADGE}>{t("dashboard.status.nominal")}</span>
          </div>
          <div class="dash-open-main">
            <p class="dash-lede">{t("dashboard.hero.tagline")}</p>
          </div>
        </section>

        <section aria-label={t("dashboard.kpi.label")}>
          <div class="dash-sect">
            <span class="dash-code">01</span>
            <h2 class="dash-h2">{t("dashboard.kpi.label")}</h2>
            <span class="dash-rule" aria-hidden="true" />
          </div>
          <div class="dash-kpi-grid" role="list">
            <For each={metrics()}>{(m) => <MetricCell {...m} />}</For>
          </div>
        </section>

        <section aria-label={t("dashboard.modules.label")}>
          <div class="dash-sect">
            <span class="dash-code">02</span>
            <h2 class="dash-h2">{t("dashboard.modules.label")}</h2>
            <span class="dash-rule" aria-hidden="true" />
          </div>
          <div class="dash-mod-grid">
            <For each={modules()}>{(m) => <ModuleCard {...m} />}</For>
          </div>
        </section>

        <section aria-label={t("dashboard.system.title")}>
          <div class="dash-sect">
            <span class="dash-code">03</span>
            <h2 class="dash-h2">{t("dashboard.detail.label")}</h2>
            <span class="dash-rule" aria-hidden="true" />
          </div>
          <div class="dash-split">
            <SystemCard data={props.data} />
            <QuickCard />
          </div>
        </section>
      </div>
    </WorkspacePage>
  )
}

function MetricCell(props: MetricData): JSX.Element {
  const Icon = props.icon
  return (
    <A
      href={props.href}
      class="dash-kpi"
      role="listitem"
      aria-label={`${props.label}: ${props.value ?? t("dashboard.metric.unavailable")}`}
    >
      <span class="dash-kpi-top">
        <span class="dash-code">{props.code}</span>
        <Icon size={14} aria-hidden="true" class="dash-kpi-icon" />
      </span>
      <strong class="dash-kpi-value">{props.value ?? t("dashboard.metric.unavailable")}</strong>
      <span class="dash-kpi-label">{props.label}</span>
      <span class={`dash-kpi-meta${props.metaAlert ? " dash-kpi-meta-alert" : ""}`}>{props.meta}</span>
    </A>
  )
}

function ModuleCard(props: ModuleData): JSX.Element {
  const Icon = props.icon
  return (
    <div class={CARD}>
      <div class="dash-mod-body">
        <div class="dash-mod-head">
          <Icon size={15} aria-hidden="true" class="dash-mod-icon" />
          <div class="dash-mod-titles">
            <h3 class="dash-mod-title">{props.title}</h3>
            <p class="dash-mod-sub">{props.subtitle}</p>
          </div>
          <span class="dash-code dash-mod-idx">{props.index}</span>
        </div>
        <dl class="dash-spec">
          <For each={props.specs}>{(s) => (
            <div class="dash-spec-row">
              <dt>{s.k}</dt>
              <dd>{s.v}</dd>
            </div>
          )}</For>
        </dl>
      </div>
      <div class="dash-card-foot">
        <span class="dash-stat">{props.stat}</span>
        <A href={props.href} class="dash-open-link" aria-label={`${props.cta}`}>
          {props.cta}
          <ArrowUpRight size={14} aria-hidden="true" />
        </A>
      </div>
    </div>
  )
}

function SystemCard(props: { readonly data: DashboardData }): JSX.Element {
  const rows: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: t("dashboard.system.latency"), value: "14 ms" },
    { label: t("dashboard.system.cache"), value: "97%" },
    { label: t("dashboard.system.errors"), value: "0.1%" },
    { label: t("dashboard.system.activeProjects"), value: String(props.data.activeProjects ?? "—") },
    { label: t("dashboard.system.recentComponents"), value: String(props.data.recentComponents ?? "—") }
  ]
  return (
    <section class="dash-panel" aria-label={t("dashboard.system.title")}>
      <div class="dash-panel-head">
        <h2 class="dash-h2">{t("dashboard.system.title")}</h2>
        <span class={BADGE}>{t("dashboard.status.nominal")}</span>
      </div>
      <dl class="dash-table">
        <For each={rows}>{(r) => (
          <div class="dash-table-row">
            <dt>{r.label}</dt>
            <dd class="dash-mono">{r.value}</dd>
          </div>
        )}</For>
      </dl>
    </section>
  )
}

function QuickCard(): JSX.Element {
  const tiles = (): ReadonlyArray<{ readonly href: string; readonly label: string; readonly detail: string; readonly icon: typeof Layers }> => [
    { href: "/materials", label: t("dashboard.quick.materials"), detail: t("dashboard.quick.materialsDetail"), icon: Layers },
    { href: "/components", label: t("dashboard.quick.components"), detail: t("dashboard.quick.componentsDetail"), icon: Box },
    { href: "/projects", label: t("dashboard.quick.drawings"), detail: t("dashboard.quick.drawingsDetail"), icon: File },
    { href: "/toolpaths", label: t("dashboard.quick.toolpaths"), detail: t("dashboard.quick.toolpathsDetail"), icon: Wrench }
  ]
  return (
    <section class="dash-panel" aria-label={t("dashboard.quick.title")}>
      <div class="dash-panel-head">
        <h2 class="dash-h2">{t("dashboard.quick.title")}</h2>
      </div>
      <nav class="dash-rows">
        <For each={tiles()}>{(tile) => (
          <A href={tile.href} class="dash-row">
            <tile.icon size={14} aria-hidden="true" class="dash-row-icon" />
            <span class="dash-row-main">
              <span class="dash-row-label">{tile.label}</span>
              <span class="dash-row-detail">{tile.detail}</span>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" class="dash-row-arrow" />
          </A>
        )}</For>
      </nav>
    </section>
  )
}

export type { DashboardData }
